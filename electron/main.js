const { app, BrowserWindow } = require('electron');
const path = require('path');
const { initDatabase, closeDatabase } = require('./database/connection');
const { registerIpcHandlers } = require('./ipc');

let mainWindow = null;

function isDevMode() {
  return process.env.NODE_ENV === 'development' || (app && !app.isPackaged);
}

function createWindow() {
  console.log('[Electron Main] Creating browser window...');
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'Sri Gold Pawn Shop Billing',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const url = isDevMode() ? 'http://localhost:5173' : path.join(__dirname, '../dist/index.html');
  console.log('[Electron Main] Loading target:', url);

  if (isDevMode()) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Electron Main] Page loaded successfully');
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer Console] ${message}`);
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('[Electron Main] Failed to load URL:', validatedURL, errorCode, errorDescription);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Set custom userData path for deterministic DB location
  try {
    const customUserData = path.join(app.getPath('appData'), 'sri-gold-pawn-shop-billing');
    app.setPath('userData', customUserData);
  } catch (e) {
    console.error('[Electron Main] Could not set custom userData path:', e);
  }

  // Initialize Database before launching window
  try {
    initDatabase();
  } catch (error) {
    console.error('[Electron Main] Database initialization failed:', error);
  }

  // Register IPC Handlers
  registerIpcHandlers();

  // Create Window
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    closeDatabase();
    app.quit();
  }
});
