const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  openInExplorer: (folderPath) => ipcRenderer.invoke('shell:openPath', folderPath),
  restartApp: () => ipcRenderer.invoke('app:restart'),
  isElectron: true,
  watchStart: (folderPath, standards) => ipcRenderer.invoke('watch:start', folderPath, standards),
  watchStop: (folderPath) => ipcRenderer.invoke('watch:stop', folderPath),
  openDevTools: () => ipcRenderer.invoke('devtools:toggle'),
  onImageProcessed: (callback) => {
    const handler = (_e, payload) => callback(payload);
    ipcRenderer.on('image:processed', handler);
    return () => ipcRenderer.removeListener('image:processed', handler);
  },
});
