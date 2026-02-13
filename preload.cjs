const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  saveBackup: (backupData, filename) => ipcRenderer.invoke('save-backup', backupData, filename),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  getBackupPath: () => ipcRenderer.invoke('get-backup-path'),
  setBackupPath: (path) => ipcRenderer.invoke('set-backup-path', path),
});
