const { app, BrowserWindow } = require('electron');
const path = require('path');
const { initDatabase, getDatabaseStatus, closeDatabase } = require('../electron/database/connection');
const { registerIpcHandlers } = require('../electron/ipc');

app.whenReady().then(async () => {
  console.log('[Verify Prod] Initializing database...');
  initDatabase();
  const status = getDatabaseStatus();
  console.log('[Verify Prod] DB Status:', JSON.stringify(status));

  registerIpcHandlers();

  const win = new BrowserWindow({
    width: 1024,
    height: 700,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../electron/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const distPath = path.join(__dirname, '../dist/index.html');
  console.log('[Verify Prod] Loading bundled production file:', distPath);

  win.loadFile(distPath);

  win.webContents.on('did-finish-load', () => {
    console.log('[Verify Prod] SUCCESS: Production HTML & bundles loaded cleanly!');
    closeDatabase();
    app.quit();
  });

  win.webContents.on('did-fail-load', (e, code, desc) => {
    console.error('[Verify Prod] FAILED: did-fail-load', code, desc);
    closeDatabase();
    process.exit(1);
  });
});
