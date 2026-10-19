const { initDatabase, getDatabaseStatus, closeDatabase } = require('../electron/database/connection');

// Mock electron app.getPath if run outside electron main
const { app } = require('electron');
if (!app) {
  throw new Error('Electron app not found');
}

try {
  const db = initDatabase();
  const status = getDatabaseStatus();
  console.log('[Connection Status Result]:', JSON.stringify(status, null, 2));

  if (!status.connected || status.schemaVersion !== 2) {
    throw new Error(`Expected connected=true, schemaVersion=2; got: ${JSON.stringify(status)}`);
  }

  console.log('Verification Success: connection.js and getDatabaseStatus() operate cleanly with Schema Version 2!');
  closeDatabase();
} catch (e) {
  console.error('Connection test failed:', e);
  process.exit(1);
}
