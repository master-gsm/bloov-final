const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const isDev = process.env.NODE_ENV === 'development';

let mainWindow;
let backupPath = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    icon: path.join(__dirname, 'public/favicon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: true,
    },
    backgroundColor: '#1a1a1a',
    show: false,
    autoHideMenuBar: true,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuTemplate = [
    {
      label: 'ملف',
      submenu: [
        {
          label: 'إعادة تحميل',
          accelerator: 'Ctrl+R',
          click: () => mainWindow.reload(),
        },
        {
          label: 'تكبير الشاشة',
          accelerator: 'F11',
          click: () => mainWindow.setFullScreen(!mainWindow.isFullScreen()),
        },
        { type: 'separator' },
        {
          label: 'إغلاق',
          accelerator: 'Alt+F4',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: 'عرض',
      submenu: [
        {
          label: 'تكبير',
          accelerator: 'Ctrl+Plus',
          click: () => {
            const currentZoom = mainWindow.webContents.getZoomFactor();
            mainWindow.webContents.setZoomFactor(currentZoom + 0.1);
          },
        },
        {
          label: 'تصغير',
          accelerator: 'Ctrl+-',
          click: () => {
            const currentZoom = mainWindow.webContents.getZoomFactor();
            mainWindow.webContents.setZoomFactor(currentZoom - 0.1);
          },
        },
        {
          label: 'الحجم الطبيعي',
          accelerator: 'Ctrl+0',
          click: () => mainWindow.webContents.setZoomFactor(1),
        },
      ],
    },
  ];

  if (isDev) {
    menuTemplate.push({
      label: 'Developer',
      submenu: [
        {
          label: 'أدوات المطور',
          accelerator: 'Ctrl+Shift+I',
          click: () => mainWindow.webContents.openDevTools(),
        },
      ],
    });
  }

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);

    if (parsedUrl.origin !== 'http://localhost:5173' && !navigationUrl.startsWith('file://')) {
      event.preventDefault();
      require('electron').shell.openExternal(navigationUrl);
    }
  });
});

ipcMain.handle('save-backup', async (event, backupData, filename) => {
  try {
    if (!backupPath) {
      backupPath = path.join(app.getPath('documents'), 'BloovBackups');
    }

    if (!fs.existsSync(backupPath)) {
      fs.mkdirSync(backupPath, { recursive: true });
    }

    const filePath = path.join(backupPath, filename);
    fs.writeFileSync(filePath, backupData, 'utf8');

    return { success: true, path: filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('select-directory', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'اختر مجلد النسخ الاحتياطي',
    });

    if (!result.canceled && result.filePaths.length > 0) {
      backupPath = result.filePaths[0];
      return { success: true, path: backupPath };
    }

    return { success: false };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-backup-path', async () => {
  if (!backupPath) {
    backupPath = path.join(app.getPath('documents'), 'BloovBackups');
  }
  return backupPath;
});

ipcMain.handle('set-backup-path', async (event, newPath) => {
  backupPath = newPath;
  return { success: true };
});
