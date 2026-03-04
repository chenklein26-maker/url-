import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import sharp from "sharp";
import iconv from "iconv-lite";
import jschardet from "jschardet";
import path from "path";
import fs from "fs";
import cors from "cors";
import { fileURLToPath } from "url";
import { HttpsProxyAgent } from "https-proxy-agent";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Global proxy configuration
let proxyUrl: string | null = null;

function getAxiosConfig(url: string) {
  const config: any = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Referer': new URL(url).origin
    },
    timeout: 15000
  };

  if (proxyUrl) {
    config.httpsAgent = new HttpsProxyAgent(proxyUrl);
    config.proxy = false; // Disable default axios proxy handling to use the agent
  }

  return config;
}

// Simple lock for sequential image processing to avoid race conditions in naming
let imageProcessingLock = Promise.resolve();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  
  // Ensure processed directory exists
  const publicDir = path.join(__dirname, 'public');
  const processedDir = path.join(publicDir, 'processed');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  if (!fs.existsSync(processedDir)) {
    fs.mkdirSync(processedDir, { recursive: true });
  }

  // Serve static files from public
  app.use('/processed', express.static(processedDir));

  // API: Set/Get Proxy
  app.post("/api/config/proxy", (req, res) => {
    const { url } = req.body;
    proxyUrl = url || null;
    res.json({ success: true, proxyUrl });
  });

  app.get("/api/config/proxy", (req, res) => {
    res.json({ proxyUrl });
  });

  // API: Test Proxy / VPN
  app.get("/api/test-connection", async (req, res) => {
    try {
      const startTime = Date.now();
      const config = getAxiosConfig("https://www.google.com");
      
      // Try to get IP info from a public API
      const ipRes = await axios.get("https://api.ipify.org?format=json", config);
      const geoRes = await axios.get(`https://ipapi.co/${ipRes.data.ip}/json/`, config);
      
      const duration = Date.now() - startTime;
      
      res.json({
        success: true,
        ip: ipRes.data.ip,
        location: `${geoRes.data.city}, ${geoRes.data.country_name}`,
        isp: geoRes.data.org,
        latency: `${duration}ms`,
        proxyActive: !!proxyUrl
      });
    } catch (error: any) {
      res.status(500).json({ 
        success: false, 
        error: error.message,
        proxyActive: !!proxyUrl
      });
    }
  });

  // API: Extract article and image URLs
  app.post("/api/extract", async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    try {
      const response = await axios.get(url, {
        ...getAxiosConfig(url),
        responseType: 'arraybuffer'
      });

      // Detect and decode encoding
      const buffer = Buffer.from(response.data);
      const detection = jschardet.detect(buffer);
      const encoding = detection.encoding || 'utf-8';
      const html = iconv.decode(buffer, encoding);

      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (!article) {
        return res.status(404).json({ error: "Could not extract article content" });
      }

      // Extract images from the content
      const contentDom = new JSDOM(article.content);
      const images = Array.from(contentDom.window.document.querySelectorAll('img'))
        .map(img => {
          // Support common lazy load attributes
          const src = img.getAttribute('data-src') || img.getAttribute('src') || img.getAttribute('data-original');
          if (!src) return null;
          
          // Filter out very small icons or data URIs if needed
          if (src.startsWith('data:')) return null;
          
          try {
            return new URL(src, url).href;
          } catch {
            return null;
          }
        })
        .filter((src): src is string => !!src);

      res.json({
        title: article.title,
        content: article.textContent,
        html: article.content,
        images: Array.from(new Set(images)) // Unique images
      });
    } catch (error: any) {
      console.error("Extraction error:", error.message);
      res.status(500).json({ error: "Failed to fetch or parse the URL" });
    }
  });

  // API: Process images
  app.post("/api/process-images", async (req, res) => {
    const { images, taskId, imageSavePath } = req.body;
    if (!images || !Array.isArray(images)) {
      return res.status(400).json({ error: "Images array is required" });
    }

    // Use a lock to ensure sequential naming across concurrent requests
    await imageProcessingLock;
    
    let unlock: () => void;
    imageProcessingLock = new Promise(resolve => { unlock = resolve; });

    try {
      // Priority: 1. Body param (from UI), 2. Env var, 3. Default processedDir
      const baseSavePath = imageSavePath || process.env.IMAGE_SAVE_PATH || processedDir;
      
      const useFlatStructure = !!(imageSavePath || process.env.IMAGE_SAVE_PATH);
      const targetDir = useFlatStructure ? baseSavePath : path.join(baseSavePath, taskId || Date.now().toString());

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Helper to get next sequence number if flat structure is used
      const getNextSequence = () => {
        if (!useFlatStructure) return null;
        try {
          const files = fs.readdirSync(targetDir);
          const numbers = files
            .map(f => parseInt(path.parse(f).name))
            .filter(n => !isNaN(n));
          return numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
        } catch (e) {
          return 1;
        }
      };

      let globalCount = getNextSequence();
      const results = [];
      let localCount = 1;

      for (const imageUrl of images) {
        try {
          const response = await axios.get(imageUrl, { 
            ...getAxiosConfig(imageUrl),
            responseType: 'arraybuffer'
          });
          const buffer = Buffer.from(response.data);
          
          const filename = globalCount !== null ? `${globalCount}.jpg` : `${localCount}.jpg`;
          const outputPath = path.join(targetDir, filename);

          await sharp(buffer)
            .resize({ width: 1200, withoutEnlargement: true })
            .toFormat('jpeg', { quality: 85 })
            .toFile(outputPath);

          results.push({
            original: imageUrl,
            processed: `/processed/${taskId}/${filename}`,
            localPath: useFlatStructure ? outputPath : null,
            filename: filename,
            success: true
          });

          if (globalCount !== null) globalCount++;
          localCount++;
        } catch (error: any) {
          console.error(`Error processing image ${imageUrl}:`, error.message);
          results.push({
            original: imageUrl,
            error: error.message,
            success: false
          });
        }
      }

      res.json({ results });
    } finally {
      unlock!();
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
