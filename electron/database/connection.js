const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { initializeSchema } = require('./schema');

let dbInstance = null;
let dbPath = null;
let initStatus = {
  connected: false,
  path: null,
  schemaVersion: null,
  error: null
};

function initDatabase() {
  try {
    const userDataPath = app.getPath('userData');
    
    // Create log directory if not exists
    const scratchDir = path.join(__dirname, '../../scratch');
    if (!fs.existsSync(scratchDir)) {
      fs.mkdirSync(scratchDir, { recursive: true });
    }

    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }

    dbPath = path.join(userDataPath, 'sri_gold_pawn_shop.sqlite');
    
    // Connect to SQLite
    dbInstance = new Database(dbPath, { verbose: null });
    
    // Enable PRAGMA foreign keys & WAL mode for offline desktop efficiency
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('foreign_keys = ON');

    // Run schema initialization
    const schemaInfo = initializeSchema(dbInstance);

    initStatus = {
      connected: true,
      path: dbPath,
      schemaVersion: schemaInfo.version,
      error: null
    };

    console.log(`[Database] SQLite connected successfully at: ${dbPath}`);
    
    // Write verification status log for empirical audit
    try {
      const verifyLogPath = path.join(scratchDir, 'init_verification.json');
      fs.writeFileSync(verifyLogPath, JSON.stringify(initStatus, null, 2), 'utf8');
      
      const userDataVerifyLog = path.join(userDataPath, 'init_verification.json');
      fs.writeFileSync(userDataVerifyLog, JSON.stringify(initStatus, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to write verify log:', e);
    }

    return dbInstance;
  } catch (err) {
    console.error('[Database] Connection error:', err);
    initStatus = {
      connected: false,
      path: dbPath,
      schemaVersion: null,
      error: err.message
    };
    throw err;
  }
}

function getDb() {
  if (!dbInstance) {
    throw new Error('Database has not been initialized. Call initDatabase() first.');
  }
  return dbInstance;
}

function getDatabaseStatus() {
  return initStatus;
}

function closeDatabase() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    initStatus.connected = false;
  }
}

function getDatabasePath() {
  return dbPath;
}

module.exports = {
  initDatabase,
  getDb,
  getDatabaseStatus,
  getDatabasePath,
  closeDatabase
};

