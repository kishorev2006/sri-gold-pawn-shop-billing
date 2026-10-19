const { ipcMain } = require('electron');
const { getDatabaseStatus } = require('../database/connection');

function registerDatabaseIpcHandlers() {
  ipcMain.handle('db:get-status', async () => {
    try {
      const status = getDatabaseStatus();
      return {
        success: true,
        data: status
      };
    } catch (error) {
      console.error('[IPC Handler db:get-status Error]:', error);
      return {
        success: false,
        error: error.message || 'Failed to retrieve database status'
      };
    }
  });
}

module.exports = {
  registerDatabaseIpcHandlers
};

