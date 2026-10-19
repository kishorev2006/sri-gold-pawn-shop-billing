const { app } = require('electron');
const { initDatabase, getDatabaseStatus, closeDatabase } = require('../electron/database/connection');
const fs = require('fs');

app.whenReady().then(() => {
  const logFile = 'C:\\Users\\kishore\\OneDrive\\Desktop\\siva\\scratch\\test_output.txt';
  let output = '=== ELECTRON APP READY ===\n';
  try {
    initDatabase();
    const status = getDatabaseStatus();
    output += `STATUS: ${JSON.stringify(status, null, 2)}\n`;
    if (fs.existsSync(status.path)) {
      output += `VERIFIED_SQLITE_FILE_CREATED_AT: ${status.path}\n`;
    } else {
      output += 'VERIFICATION_FAILED_NO_FILE\n';
    }
    closeDatabase();
  } catch (err) {
    output += `VERIFICATION_ERROR: ${err.stack || err.message}\n`;
  } finally {
    try {
      fs.writeFileSync(logFile, output, 'utf8');
    } catch (e) {
      console.error(e);
    }
    app.quit();
  }
});

