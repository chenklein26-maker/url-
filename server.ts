import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

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
import crypto from "crypto";
import os from "os";

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
    timeout: 15000,
    proxy: false // Explicitly disable default proxy to avoid picking up environment variables like 127.0.0.1:10809
  };

  if (proxyUrl) {
    config.httpsAgent = new HttpsProxyAgent(proxyUrl);
  }

  return config;
}

// Simple lock for sequential image processing to avoid race conditions in naming
let imageProcessingLock = Promise.resolve();
const imageHashCache = new Map<string, string>();

// Lock for scan-folder to prevent concurrent scans on the same folder
let scanFolderLock = Promise.resolve();

async function startServer() {
  const app = express();

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

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "articleflow" });
  });

  // --- Prompts persistence ---
  const fallbackDataBase =
    process.env.APPDATA ||
    process.env.XDG_DATA_HOME ||
    path.join(os.homedir(), ".articleflow-pro");
  const promptsDataRoot =
    process.env.PROMPTS_DATA_DIR?.trim() ||
    path.join(fallbackDataBase, "ArticleFlowPro");
  const dataDir = path.join(promptsDataRoot, 'data');
  const promptsFile = path.join(dataDir, 'prompts.json');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const writeFileAtomically = (targetPath: string, content: string) => {
    const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
    let fd: number | undefined;

    try {
      fd = fs.openSync(tempPath, 'w');
      fs.writeFileSync(fd, content, 'utf-8');
      fs.fsyncSync(fd);
    } catch (err) {
      try {
        if (fs.existsSync(tempPath)) {
          fs.rmSync(tempPath, { force: true });
        }
      } catch {}
      throw err;
    } finally {
      if (fd !== undefined) {
        fs.closeSync(fd);
      }
    }

    try {
      fs.renameSync(tempPath, targetPath);
    } catch (err) {
      try {
        if (fs.existsSync(tempPath)) {
          fs.rmSync(tempPath, { force: true });
        }
      } catch {}
      throw err;
    }
  };

  app.get("/api/prompts", (req, res) => {
    try {
      if (!fs.existsSync(promptsFile)) {
        res.json(null);
        return;
      }

      const data = JSON.parse(fs.readFileSync(promptsFile, 'utf-8'));
      if (!data || !Array.isArray(data.prompts)) {
        res.status(500).json({
          error: "提示词读取失败：本地保存文件格式无效",
          details: promptsFile,
        });
        return;
      }

      res.json(data);
    } catch (err: any) {
      console.error("Prompts read error:", err.message);
      res.status(500).json({
        error: "提示词读取失败：本地保存文件可能已损坏",
        details: err.message,
      });
    }
  });

  app.post("/api/prompts", (req, res) => {
    try {
      const { prompts, activePromptId } = req.body;
      if (!Array.isArray(prompts) || typeof activePromptId !== 'string') {
        res.status(400).json({ error: "提示词保存失败：提交的数据格式无效" });
        return;
      }
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      writeFileAtomically(
        promptsFile,
        JSON.stringify({ prompts, activePromptId }, null, 2)
      );
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // API: Set/Get Proxy
  app.post("/api/config/proxy", (req, res) => {
    const { url } = req.body;
    proxyUrl = url || null;
    res.json({ success: true, proxyUrl });
  });

  app.get("/api/config/proxy", (req, res) => {
    res.json({ proxyUrl });
  });

  // API: Serve local file (for Electron mode thumbnails)
  app.get("/api/local-image", (req, res) => {
    let imagePath = req.query.path as string;
    if (!imagePath) return res.status(404).send("Not found");
    try {
      imagePath = decodeURIComponent(imagePath);
      imagePath = path.normalize(imagePath);
      if (!path.isAbsolute(imagePath) || !fs.existsSync(imagePath)) {
        return res.status(404).send("Not found");
      }
      const ext = path.extname(imagePath).toLowerCase();
      const mime: Record<string, string> = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp',
      };
      const contentType = mime[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.sendFile(imagePath);
    } catch {
      return res.status(404).send("Not found");
    }
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

  // API: AI Chat Proxy (supports any OpenAI-compatible endpoint)
  app.post("/api/ai/chat", async (req, res) => {
    const { prompt, systemPrompt, apiEndpoint, apiKey, model, temperature = 0.7, maxTokens = 4000 } = req.body;

    if (!apiEndpoint || !apiKey || !model) {
      return res.status(400).json({ error: { message: "请先在通用设置中配置 AI 模型和 API Key" } });
    }

    try {
      const axiosConfig: any = {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        timeout: 120000,
        proxy: false,
      };
      if (proxyUrl) {
        axiosConfig.httpsAgent = new HttpsProxyAgent(proxyUrl);
      }

      const messages = [];
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }
      messages.push({ role: 'user', content: prompt });

      const response = await axios.post(apiEndpoint, {
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }, axiosConfig);

      res.json(response.data);
    } catch (error: any) {
      const status = error.response?.status || 500;
      const errorData = error.response?.data || { error: { message: error.message } };
      console.error("AI chat proxy error:", error.message);
      res.status(status).json(errorData);
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

      const sourceDom = new JSDOM(html, { url });
      const document = sourceDom.window.document;
      const readerDom = new JSDOM(html, { url });
      const reader = new Readability(readerDom.window.document);
      const article = reader.parse();

      if (!article) {
        return res.status(404).json({ error: "Could not extract article content" });
      }

      const resolveImageUrls = (elements: Element[]) =>
        elements
          .map((img) => {
            const src =
              img.getAttribute('data-src') ||
              img.getAttribute('data-original') ||
              img.getAttribute('data-lazy-src') ||
              img.getAttribute('data-lazyload') ||
              img.getAttribute('src') ||
              img.getAttribute('data-srcset')?.split(',')[0]?.trim().split(' ')[0] ||
              img.getAttribute('srcset')?.split(',')[0]?.trim().split(' ')[0];
            if (!src || src.startsWith('data:')) return null;

            try {
              return new URL(src, url).href;
            } catch {
              return null;
            }
          })
          .filter((src): src is string => !!src);

      // Extract images from the readability result first.
      const contentDom = new JSDOM(article.content);
      let images = resolveImageUrls(Array.from(contentDom.window.document.querySelectorAll('img')));

      // Fallback for sites like Gamer.com.tw where Readability keeps the text but drops gallery nodes.
      if (images.length === 0) {
        const fallbackSelectors = [
          '.GN-lbox3B img[name="gnnPIC"]',
          '.GN-lbox3B .bh-grids-img img',
          '.GN-lbox3B img',
          'article img',
          '[itemprop="articleBody"] img',
          '.article-content img',
          '.post-content img',
          '.entry-content img',
          '.news-content img',
          'main img',
        ];

        for (const selector of fallbackSelectors) {
          const candidates = Array.from(document.querySelectorAll(selector)).filter((img) => {
            const className = img.className || '';
            const src = img.getAttribute('src') || '';
            return (
              !className.toString().includes('avatar') &&
              !src.includes('top_logo') &&
              !src.includes('bh_no_image')
            );
          });
          const matched = resolveImageUrls(candidates);
          if (matched.length > 0) {
            images = matched;
            break;
          }
        }
      }

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
    const { images, taskId, imageSavePath, rawSavePath, standards } = req.body;
    if (!images || !Array.isArray(images)) {
      return res.status(400).json({ error: "Images array is required" });
    }

    // Use a lock to ensure sequential naming across concurrent requests
    await imageProcessingLock;
    
    let unlock: () => void;
    imageProcessingLock = new Promise(resolve => { unlock = resolve; });

    try {
      const results = [];
      let localCount = 1;

      // In Electron mode, we save directly to the user's selected folder with the correct standards and sequencing.
      if (rawSavePath) {
        if (!fs.existsSync(rawSavePath)) fs.mkdirSync(rawSavePath, { recursive: true });

        const width = standards?.width || 500;
        const format = (standards?.format || 'image/jpeg').split('/')[1] as 'jpeg' | 'png' | 'webp';
        const quality = Math.round((standards?.quality ?? 1) * 100);
        const prefix = standards?.prefix !== undefined ? standards.prefix : '';

        const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const prefixPattern = new RegExp(`^${escapedPrefix}(\\d+)\\.`);

        for (const imageUrl of images) {
          try {
            const response = await axios.get(imageUrl, { 
              ...getAxiosConfig(imageUrl),
              responseType: 'arraybuffer'
            });
            const buffer = Buffer.from(response.data);
            const hash = crypto.createHash('md5').update(buffer).digest('hex');

            let finalFilename = '';
            let outputPath = '';

            // Check for duplicates
            if (imageHashCache.has(hash)) {
              finalFilename = imageHashCache.get(hash)!;
              outputPath = path.join(rawSavePath, finalFilename);
              if (!fs.existsSync(outputPath)) {
                imageHashCache.delete(hash);
                finalFilename = '';
              }
            }

            // Create new if not duplicate
            if (!finalFilename) {
              let maxNum = 0;
              const entries = fs.readdirSync(rawSavePath);
              for (const name of entries) {
                const match = name.match(prefixPattern);
                if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
              }

              finalFilename = `${prefix}${String(maxNum + 1).padStart(3, '0')}.${format}`;
              outputPath = path.join(rawSavePath, finalFilename);

              await sharp(buffer)
                .resize({ width, withoutEnlargement: true })
                .toFormat(format, { quality })
                .toFile(outputPath);

              imageHashCache.set(hash, finalFilename);
            }

            results.push({
              original: imageUrl,
              processed: `/api/local-image?path=${encodeURIComponent(outputPath)}`,
              localPath: outputPath,
              filename: finalFilename,
              success: true
            });
          } catch (error: any) {
            console.error(`Error processing image ${imageUrl}:`, error.message);
            results.push({
              original: imageUrl,
              error: error.message,
              success: false
            });
          }
        }
      } else {
        // Fallback for non-Electron or when no folder is selected
        const baseSavePath = imageSavePath || process.env.IMAGE_SAVE_PATH || processedDir;
        const useFlatStructure = !!(imageSavePath || process.env.IMAGE_SAVE_PATH);
        const targetDir = useFlatStructure ? baseSavePath : path.join(baseSavePath, taskId || Date.now().toString());

        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

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
      }

      res.json({ results });
    } finally {
      unlock!();
    }
  });

  // API: Scan a local folder and process new images in-place (for Electron mode)
  // Evaluates ALL images against standards. Renames/processes them automatically.
  app.post("/api/scan-folder", async (req, res) => {
    const { folderPath, standards } = req.body;
    if (!folderPath) return res.status(400).json({ error: "folderPath is required" });

    await scanFolderLock;
    let unlock: () => void;
    scanFolderLock = new Promise(resolve => { unlock = resolve; });

    try {
      if (!fs.existsSync(folderPath)) {
        return res.status(400).json({ error: "Folder does not exist" });
      }

      const width = standards?.width || 500;
      const format = (standards?.format || 'image/jpeg').split('/')[1] as 'jpeg' | 'png' | 'webp';
      const quality = Math.round((standards?.quality ?? 1) * 100);
      const prefix = standards?.prefix !== undefined ? standards.prefix : '';

      const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const prefixPattern = new RegExp(`^${escapedPrefix}(\\d+)\\.`);
      const imageExtensions = /\.(jpg|jpeg|png|webp|gif|bmp)$/i;

      const entries = fs.readdirSync(folderPath);

      // Clean up orphaned .tmp files from previous failed runs
      for (const name of entries) {
        if (name.endsWith('.tmp')) {
          try {
            fs.unlinkSync(path.join(folderPath, name));
          } catch {}
        }
      }
      
      // Step 1: Find max number to know where to start naming new files
      let maxNum = 0;
      for (const name of entries) {
        const match = name.match(prefixPattern);
        if (match) {
          maxNum = Math.max(maxNum, parseInt(match[1]));
        }
      }

      let currentCounter = maxNum + 1;
      const newlyProcessed: string[] = [];

      // Step 2: Evaluate all images
      for (const name of entries) {
        const fullPath = path.join(folderPath, name);
        try { if (!fs.statSync(fullPath).isFile()) continue; } catch { continue; }
        if (!imageExtensions.test(name)) continue;

        // Skip files modified in the last 2 seconds to avoid processing half-written files
        const stat = fs.statSync(fullPath);
        if (Date.now() - stat.mtimeMs < 2000) continue;

        try {
          const metadata = await sharp(fullPath).metadata();
          const isFormatMatch = metadata.format === format || (format === 'jpeg' && metadata.format === 'jpg');
          const isWidthMatch = !metadata.width || metadata.width <= width;
          const meetsStandard = isFormatMatch && isWidthMatch;
          
          const match = name.match(prefixPattern);
          const isNamedCorrectly = !!match && name.endsWith(`.${format}`);

          if (meetsStandard && isNamedCorrectly) {
            // Perfect file, do nothing
            continue;
          }

          if (meetsStandard && !isNamedCorrectly) {
            // Just rename it, no need to re-encode!
            let newName;
            if (match) {
               newName = `${prefix}${match[1].padStart(3, '0')}.${format}`;
            } else {
               newName = `${prefix}${String(currentCounter).padStart(3, '0')}.${format}`;
               currentCounter++;
            }
            const outputPath = path.join(folderPath, newName);
            
            if (fs.existsSync(outputPath) && outputPath !== fullPath) {
               fs.unlinkSync(outputPath);
            }
            fs.renameSync(fullPath, outputPath);
            newlyProcessed.push(newName);
            continue;
          }

          if (!meetsStandard) {
            // Needs processing
            const buffer = fs.readFileSync(fullPath);
            let outputPath, newName;

            if (match) {
              // In-place processing (keep same number)
              newName = `${prefix}${match[1].padStart(3, '0')}.${format}`;
              outputPath = path.join(folderPath, newName);
            } else {
              newName = `${prefix}${String(currentCounter).padStart(3, '0')}.${format}`;
              outputPath = path.join(folderPath, newName);
              currentCounter++;
            }

            const tempPath = `${outputPath}.${process.pid}.${Date.now()}.tmp`;
            try {
              await sharp(buffer)
                .resize({ width, withoutEnlargement: true })
                .toFormat(format, { quality })
                .toFile(tempPath);

              fs.unlinkSync(fullPath);
              fs.renameSync(tempPath, outputPath);
              newlyProcessed.push(newName);
            } catch (sharpErr: any) {
              try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
              throw sharpErr;
            }
          }

        } catch (err: any) {
          console.error(`Failed to process ${name}:`, err.message);
        }
      }

      res.json({ newlyProcessed, newCounter: currentCounter });
    } catch (err: any) {
      console.error("Scan folder error:", err.message);
      res.status(500).json({ error: err.message });
    } finally {
      unlock!();
    }
  });

  // API: Copy processed task images to a local folder (for Electron mode)
  app.post("/api/save-to-folder", async (req, res) => {
    const { targetFolder, images } = req.body;
    if (!targetFolder || !images) return res.status(400).json({ error: "targetFolder and images are required" });

    try {
      if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder, { recursive: true });
      }

      const results = [];
      for (const img of images) {
        if (!img.success || !img.processed) {
          results.push({ ...img, savedToLocal: false });
          continue;
        }
        try {
          const srcPath = path.join(processedDir, ...img.processed.replace('/processed/', '').split('/'));
          const destPath = path.join(targetFolder, img.filename);
          if (fs.existsSync(srcPath)) {
            fs.copyFileSync(srcPath, destPath);
            results.push({ ...img, savedToLocal: true, localSavePath: destPath });
          } else {
            results.push({ ...img, savedToLocal: false });
          }
        } catch (err: any) {
          console.error(`Failed to copy ${img.filename}:`, err.message);
          results.push({ ...img, savedToLocal: false });
        }
      }

      res.json({ results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 开发模式：先 listen 再异步加载 Vite，保证 /api/health 立即可用，避免 Electron 启动超时
  if (process.env.NODE_ENV !== "production") {
    let vitePromise: Promise<ReturnType<typeof createViteServer>> | null = null;
    const getVite = () => {
      if (!vitePromise) {
        vitePromise = createViteServer({
          server: { middlewareMode: true },
          appType: "spa",
        });
      }
      return vitePromise;
    };
    app.use((req, res, next) => {
      getVite()
        .then((vite) => vite.middlewares(req, res, next))
        .catch((err) => {
          console.error("[vite] failed to start:", err);
          res.status(500).send("Vite dev server failed to start.");
        });
    });
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  const startPort = parseInt(process.env.PORT || "3000", 10);
  const maxPort = Math.min(65535, startPort + 50);

  function tryListen(currentPort: number) {
    const server = app.listen(currentPort, "127.0.0.1", () => {
      console.log(`Server running on http://localhost:${currentPort}`);
      console.log(`ARTICLEFLOW_LISTEN_PORT=${currentPort}`);
    });
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.warn(`Port ${currentPort} in use, trying ${currentPort + 1}...`);
        server.close();
        if (currentPort < maxPort) {
          tryListen(currentPort + 1);
        } else {
          console.error("No available port in range. Please free a port or set PORT env.");
          process.exit(1);
        }
      } else {
        console.error("Server listen error:", err.message);
        process.exit(1);
      }
    });
  }

  tryListen(startPort);
}

startServer();
