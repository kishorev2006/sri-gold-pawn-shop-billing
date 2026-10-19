const path = require('path');
const fs = require('fs');

// Create mock app if running with ELECTRON_RUN_AS_NODE
let app;
try {
  app = require('electron').app;
} catch (e) {}

if (!app || typeof app.getPath !== 'function') {
  app = {
    getPath: (name) => {
      if (name === 'userData') {
        return path.join(process.env.APPDATA, 'sri-gold-pawn-shop-billing');
      }
      return process.cwd();
    }
  };
  require.cache[require.resolve('electron')] = {
    exports: { app }
  };
}

const { initDatabase, getDatabaseStatus, closeDatabase } = require('../electron/database/connection');

const db = initDatabase();
const status = getDatabaseStatus();
console.log('INIT_STATUS_OUTPUT:', JSON.stringify(status, null, 2));

closeDatabase();
