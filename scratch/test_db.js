const { app } = require('electron');
const { initDatabase, getDatabaseStatus } = require('../electron/database/connection');
const { initializeSchema } = require('../electron/database/schema');
const fs = require('fs');

app.whenReady().then(() => {
  try {
    initDatabase();
    const status = getDatabaseStatus();
    console.log('TEST_VERIFICATION_SUCCESS');
    console.log('DB_STATUS:', JSON.stringify(status, null, 2));

    if (fs.existsSync(status.path)) {
      console.log('DB_FILE_EXISTS_AT:', status.path);
    } else {
      console.error('DB_FILE_NOT_FOUND');
    }
  } catch (err) {
    console.error('TEST_VERIFICATION_FAILED:', err);
  } finally {
    app.quit();
  }
});

