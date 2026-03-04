const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: "Article Flow & Image Processor",
  });

  // In development, we wait for the server to be ready
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    const url = process.env.ELECTRON_START_URL || 'http://localhost:3000';
    mainWindow.loadURL(url);
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.on('ready', () => {
  // Start the express server
  // In a real packaged app, you'd bundle the server logic or run it differently
  // For this setup, we'll assume the dev server is started by npm scripts
  createWindow();
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});
