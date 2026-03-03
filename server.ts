import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import cors from "cors";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  // API: Extract article and image URLs
  app.post("/api/extract", async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      const dom = new JSDOM(response.data, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (!article) {
        return res.status(404).json({ error: "Could not extract article content" });
      }

      // Extract images from the content
      const contentDom = new JSDOM(article.content);
      const images = Array.from(contentDom.window.document.querySelectorAll('img'))
        .map(img => {
          const src = img.getAttribute('src');
          if (!src) return null;
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
    const { images, taskId } = req.body;
    if (!images || !Array.isArray(images)) {
      return res.status(400).json({ error: "Images array is required" });
    }

    const id = taskId || Date.now().toString();
    const taskDir = path.join(processedDir, id);
    if (!fs.existsSync(taskDir)) {
      fs.mkdirSync(taskDir, { recursive: true });
    }

    const results = [];
    let count = 1;
    for (const imageUrl of images) {
      try {
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);
        
        const filename = `${count}.jpg`;
        const outputPath = path.join(taskDir, filename);

        await sharp(buffer)
          .resize(500)
          .toFormat('jpeg')
          .toFile(outputPath);

        results.push({
          original: imageUrl,
          processed: `/processed/${id}/${filename}`,
          success: true
        });
        count++;
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
