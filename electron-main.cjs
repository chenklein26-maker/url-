const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const chokidar = require('chokidar');
const sharp = require('sharp');

let mainWindow;
let serverProcess;
let isRestarting = false;
const SERVER_HOST = '127.0.0.1';
const PORT_START = 3000;
const PORT_END = 3050;
let SERVER_PORT = PORT_START;

// --- Folder watcher (chokidar) ---
const watchers = new Map();
const folderStandards = new Map();
const ignoreNextAdd = new Set();
const ignoreNextAddTimeouts = new Map();
const renamingLocks = new Map();

const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|webp|gif|bmp|avif|heic)$/i;

function addToIgnoreNextAdd(filePath) {
  const normalized = path.normalize(filePath);
  ignoreNextAdd.add(normalized);
  if (ignoreNextAddTimeouts.has(normalized)) {
    clearTimeout(ignoreNextAddTimeouts.get(normalized));
  }
  ignoreNextAddTimeouts.set(
    normalized,
    setTimeout(() => {
      ignoreNextAdd.delete(normalized);
      ignoreNextAddTimeouts.delete(normalized);
    }, 2000)
  );
}

function runWithFolderLock(folderPath, fn) {
  const normalized = path.normalize(folderPath);
  const prev = renamingLocks.get(normalized) || Promise.resolve();
  const next = prev.then(() => fn()).catch((err) => {
    console.error('[folder-watch]', err.message);
  });
  renamingLocks.set(normalized, next);
  return next;
}

async function processSingleImage(filePath, folderPath, standards) {
  const width = standards?.width || 500;
  const format = (standards?.format || 'image/jpeg').split('/')[1] || 'jpeg';
  const quality = Math.round((standards?.quality ?? 1) * 100);
  const prefix = standards?.prefix !== undefined ? standards.prefix : '';

  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const prefixPattern = new RegExp(`^${escapedPrefix}(\\d+)\\.`);

  const entries = fs.readdirSync(folderPath);
  let maxNum = 0;
  for (const name of entries) {
    const m = name.match(prefixPattern);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1]));
  }
  const newName = `${prefix}${String(maxNum + 1).padStart(3, '0')}.${format}`;
  const outputPath = path.join(folderPath, newName);
  const tempPath = `${outputPath}.${process.pid}.${Date.now()}.tmp`;

  const buffer = fs.readFileSync(filePath);
  await sharp(buffer)
    .resize({ width, withoutEnlargement: true })
    .toFormat(format, { quality })
    .toFile(tempPath);

  fs.unlinkSync(filePath);
  fs.renameSync(tempPath, outputPath);
  addToIgnoreNextAdd(outputPath);
  return { filename: newName, fullPath: outputPath };
}

function sendImageProcessed(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('image:processed', payload);
  }
}

function startFolderWatch(folderPath, standards) {
  const normalized = path.normalize(folderPath);
  if (watchers.has(normalized)) {
    folderStandards.set(normalized, standards);
    return;
  }
  folderStandards.set(normalized, standards);

  const watcher = chokidar.watch(normalized, {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    ignoreInitial: true,
    depth: 0,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100,
    },
  });

  watcher.on('add', (filePath) => {
    const normalizedPath = path.normalize(filePath);
    if (ignoreNextAdd.has(normalizedPath)) return;
    if (!IMAGE_EXTENSIONS.test(path.extname(filePath))) return;
    if (!fs.existsSync(filePath)) return;

    const stds = folderStandards.get(normalized) || standards;
    const prefix = stds?.prefix !== undefined ? stds.prefix : '';
    const format = (stds?.format || 'image/jpeg').split('/')[1] || 'jpeg';
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const prefixPattern = new RegExp(`^${escapedPrefix}(\\d+)\\.`);
    const basename = path.basename(filePath);
    const ext = path.extname(basename).toLowerCase();
    const formatMatch = ext === `.${format}` || (format === 'jpeg' && ext === '.jpg');
    if (prefixPattern.test(basename) && formatMatch) {
      return;
    }

    setTimeout(() => {
      runWithFolderLock(normalized, async () => {
        if (!fs.existsSync(filePath)) return;
        const result = await processSingleImage(filePath, normalized, stds);
        sendImageProcessed({
          folderPath: normalized,
          filename: result.filename,
          fullPath: result.fullPath,
        });
      });
    }, 300);
  });

  watchers.set(normalized, watcher);
}

function stopFolderWatch(folderPath) {
  const normalized = path.normalize(folderPath);
  const w = watchers.get(normalized);
  if (w) {
    w.close();
    watchers.delete(normalized);
    folderStandards.delete(normalized);
  }
}

function checkArticleFlowServer(port) {
  const p = port != null ? port : SERVER_PORT;
  return new Promise((resolve) => {
    const http = require('http');
    const req = http.get(`http://${SERVER_HOST}:${p}/api/health`, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          resolve(false);
          return;
        }
        try {
          const parsed = JSON.parse(body);
          resolve(parsed?.ok === true && parsed?.service === 'articleflow');
        } catch {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
}

async function waitForServerReady(timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await checkArticleFlowServer()) return true;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

function findExistingServerPort() {
  return new Promise((resolve) => {
    let port = PORT_START;
    function tryNext() {
      if (port > PORT_END) {
        resolve(null);
        return;
      }
      checkArticleFlowServer(port).then((ok) => {
        if (ok) {
          resolve(port);
        } else {
          port++;
          tryNext();
        }
      });
    }
    tryNext();
  });
}

// In dev mode, Vite needs time to pre-bundle deps. Wait for the page to load before opening the window.
async function waitForViteReady(timeoutMs = 90000) {
  const http = require('http');
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const ok = await new Promise((resolve) => {
        const req = http.get(`http://${SERVER_HOST}:${SERVER_PORT}/`, (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => {
            resolve(res.statusCode === 200 && body.includes('id="root"'));
          });
        });
        req.on('error', () => resolve(false));
        req.setTimeout(5000, () => { req.destroy(); resolve(false); });
      });
      if (ok) {
        const mainOk = await new Promise((resolve) => {
          const req = http.get(`http://${SERVER_HOST}:${SERVER_PORT}/src/main.tsx`, (res) => {
            resolve(res.statusCode === 200);
          });
          req.on('error', () => resolve(false));
          req.setTimeout(90000, () => { req.destroy(); resolve(false); });
        });
        if (mainOk) {
          console.log('[electron] Vite ready, opening window...');
          return true;
        }
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return false;
}

function getDevServerSpawnConfig(promptsDataDir) {
  const nodeExec =
    process.env.npm_node_execpath ||
    process.env.NODE ||
    (process.platform === 'win32' ? 'node.exe' : 'node');
  const tsxCliPath = path.join(__dirname, 'node_modules', 'tsx', 'dist', 'cli.mjs');

  if (!fs.existsSync(tsxCliPath)) {
    throw new Error(`tsx CLI not found: ${tsxCliPath}`);
  }

  return {
    command: nodeExec,
    args: [tsxCliPath, 'server.ts'],
    options: {
      cwd: __dirname,
      env: { ...process.env, NODE_ENV: 'development', PROMPTS_DATA_DIR: promptsDataDir },
      stdio: 'pipe',
    },
  };
}

function startServer() {
  return new Promise(async (resolve, reject) => {
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    };

    const existingPort = await findExistingServerPort();
    if (existingPort != null) {
      SERVER_PORT = existingPort;
      console.log('[electron] ArticleFlow server already running on port', SERVER_PORT);
      finish();
      return;
    }

    const isPackaged = app.isPackaged;
    const promptsDataDir = app.getPath('userData');
    let portResolved = false;

    if (isPackaged) {
      serverProcess = spawn(
        process.execPath,
        [path.join(__dirname, 'server-bundle.cjs')],
        { env: { ...process.env, NODE_ENV: 'production', PROMPTS_DATA_DIR: promptsDataDir }, stdio: 'pipe' }
      );
    } else {
      const devServer = getDevServerSpawnConfig(promptsDataDir);
      serverProcess = spawn(devServer.command, devServer.args, devServer.options);
    }

    serverProcess.stdout.on('data', (data) => {
      const msg = data.toString();
      console.log('[server]', msg);
      const m = msg.match(/ARTICLEFLOW_LISTEN_PORT=(\d+)/);
      if (m && !portResolved) {
        portResolved = true;
        SERVER_PORT = parseInt(m[1], 10);
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error('[server:err]', data.toString());
    });

    serverProcess.on('error', (err) => {
      console.error('Failed to start server:', err);
      finish(err);
    });

    serverProcess.on('exit', (code) => {
      console.log('Server exited with code', code);
      serverProcess = null;
      finish(new Error(`Server exited before ready (code: ${code})`));
    });

    await new Promise((r) => setTimeout(r, 500));
    if (!portResolved) {
      for (let p = PORT_START; p <= PORT_END && !portResolved; p++) {
        if (await checkArticleFlowServer(p)) {
          SERVER_PORT = p;
          portResolved = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    const ready = await waitForServerReady(30000);
    if (ready) {
      finish();
    } else {
      if (serverProcess) {
        serverProcess.kill();
      }
      finish(new Error(`Server not ready on http://${SERVER_HOST}:${SERVER_PORT}/api/health`));
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: 'ArticleFlow Pro',
    icon: path.join(__dirname, 'public', 'favicon.ico'),
    show: false,
  });

  mainWindow.webContents.on('did-fail-load', (_event, code, desc, url) => {
    console.error('[electron] Page load failed:', code, desc, url);
  });

  mainWindow.loadURL(`http://${SERVER_HOST}:${SERVER_PORT}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function relaunchApp() {
  const relaunchArgs = app.isPackaged
    ? process.argv.slice(1)
    : [__dirname];

  isRestarting = true;
  app.relaunch({
    execPath: process.execPath,
    args: relaunchArgs,
  });
  app.quit();
}

function setupIPC() {
  ipcMain.handle('dialog:openDirectory', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择文件夹',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('shell:openPath', async (_event, folderPath) => {
    if (folderPath) shell.openPath(folderPath);
  });

  ipcMain.handle('app:restart', () => {
    relaunchApp();
  });

  ipcMain.handle('watch:start', async (_event, folderPath, standards) => {
    if (!folderPath || !fs.existsSync(folderPath)) return { ok: false, error: 'Folder not found' };
    startFolderWatch(folderPath, standards || {});
    return { ok: true };
  });

  ipcMain.handle('watch:stop', async (_event, folderPath) => {
    if (folderPath) stopFolderWatch(folderPath);
    return { ok: true };
  });

  ipcMain.handle('devtools:toggle', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const wc = mainWindow.webContents;
    if (!wc || wc.isDestroyed?.()) return;
    if (wc.isDevToolsOpened()) {
      wc.closeDevTools();
    } else {
      wc.openDevTools();
    }
  });
}

app.on('ready', async () => {
  setupIPC();

  try {
    await startServer();
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    console.error('Server start failed:', message);
    dialog.showErrorBox('启动失败', `后端服务未就绪，应用无法启动。\n\n${message}`);
    app.quit();
    return;
  }

  if (!app.isPackaged) {
    const viteReady = await waitForViteReady(90000);
    if (!viteReady) {
      console.warn('[electron] Vite not ready in time, opening window anyway (may show white screen briefly)');
    }
  }

  createWindow();
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  if (isRestarting) {
    return;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  for (const [p, w] of watchers) {
    w.close();
  }
  watchers.clear();
  folderStandards.clear();
  for (const t of ignoreNextAddTimeouts.values()) clearTimeout(t);
  ignoreNextAdd.clear();
  ignoreNextAddTimeouts.clear();
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
