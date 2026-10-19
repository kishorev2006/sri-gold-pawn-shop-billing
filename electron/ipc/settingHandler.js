/**
 * Settings & Database Backup IPC Handlers for Sri Gold Pawn Shop Billing.
 * Supports retrieving/saving shop configuration, consistent WAL database backups via db.backup(),
 * backup history logging, and database integrity checks.
 */

const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../database/connection');

function registerSettingIpcHandlers() {
  /**
   * Get all application settings as key-value pairs
   * Channel: 'settings:get-all'
   */
  ipcMain.handle('settings:get-all', async () => {
    try {
      const db = getDb();
      const rows = db.prepare(`SELECT key, value FROM app_settings`).all();
      const settings = {};
      for (const row of rows) {
        settings[row.key] = row.value;
      }
      return { success: true, data: settings };
    } catch (error) {
      console.error('[IPC Handler settings:get-all Error]:', error);
      return { success: false, error: error.message || 'Failed to fetch settings' };
    }
  });

  /**
   * Save application settings
   * Channel: 'settings:save'
   */
  ipcMain.handle('settings:save', async (event, settingsObj = {}) => {
    try {
      if (!settingsObj || typeof settingsObj !== 'object') {
        return { success: false, error: 'Settings payload must be an object' };
      }

      const db = getDb();
      const upsert = db.prepare(`
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = CURRENT_TIMESTAMP
      `);

      const saveTx = db.transaction(() => {
        for (const [key, val] of Object.entries(settingsObj)) {
          if (typeof key === 'string' && key.trim()) {
            upsert.run(key.trim(), String(val ?? ''));
          }
        }
      });

      saveTx();
      return { success: true, message: 'Settings saved successfully' };
    } catch (error) {
      console.error('[IPC Handler settings:save Error]:', error);
      return { success: false, error: error.message || 'Failed to save settings' };
    }
  });

  /**
   * Create a consistent database backup using better-sqlite3 db.backup()
   * Channel: 'settings:create-backup'
   */
  ipcMain.handle('settings:create-backup', async () => {
    try {
      const db = getDb();
      const userDataDir = app ? app.getPath('userData') : process.cwd();
      const backupDir = path.join(userDataDir, 'backups');

      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `sri_gold_backup_${timestamp}.sqlite`;
      const backupPath = path.join(backupDir, filename);

      // Perform online SQLite backup (captures WAL completely and consistently)
      await db.backup(backupPath);

      const stats = fs.statSync(backupPath);
      const sizeBytes = stats.size;

      // Log into backup_history table
      db.prepare(`
        INSERT INTO backup_history (filename, filepath, size_bytes, status, created_at)
        VALUES (?, ?, ?, 'SUCCESS', CURRENT_TIMESTAMP)
      `).run(filename, backupPath, sizeBytes);

      // Audit log
      db.prepare(`
        INSERT INTO audit_logs (entity_type, entity_id, action, details_json, created_at)
        VALUES ('backup', 0, 'CREATE', ?, CURRENT_TIMESTAMP)
      `).run(JSON.stringify({ filename, size_bytes: sizeBytes }));

      return {
        success: true,
        data: {
          filename,
          filepath: backupPath,
          size_bytes: sizeBytes,
          created_at: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('[IPC Handler settings:create-backup Error]:', error);
      return { success: false, error: error.message || 'Database backup failed' };
    }
  });

  /**
   * List database backups
   * Channel: 'settings:list-backups'
   */
  ipcMain.handle('settings:list-backups', async () => {
    try {
      const db = getDb();
      const history = db.prepare(`
        SELECT id, filename, filepath, size_bytes, status, created_at
        FROM backup_history
        ORDER BY id DESC
        LIMIT 50
      `).all();

      return { success: true, data: history };
    } catch (error) {
      console.error('[IPC Handler settings:list-backups Error]:', error);
      return { success: false, error: error.message || 'Failed to list backup history' };
    }
  });

  /**
   * Run PRAGMA integrity_check and PRAGMA foreign_key_check
   * Channel: 'settings:verify-integrity'
   */
  ipcMain.handle('settings:verify-integrity', async () => {
    try {
      const db = getDb();
      const integrityResult = db.pragma('integrity_check');
      const fkResult = db.pragma('foreign_key_check');

      const isIntegrityOk = Array.isArray(integrityResult) &&
        integrityResult.length === 1 &&
        integrityResult[0].integrity_check === 'ok';

      const isFkOk = Array.isArray(fkResult) && fkResult.length === 0;

      return {
        success: true,
        data: {
          integrity: isIntegrityOk ? 'OK' : JSON.stringify(integrityResult),
          foreign_keys: isFkOk ? 'OK' : `${fkResult.length} violations found`,
          healthy: isIntegrityOk && isFkOk
        }
      };
    } catch (error) {
      console.error('[IPC Handler settings:verify-integrity Error]:', error);
      return { success: false, error: error.message || 'Integrity check failed' };
    }
  });
  /**
   * Restore database from a validated backup file
   * Channel: 'settings:restore-backup'
   */
  ipcMain.handle('settings:restore-backup', async (event, payload = {}) => {
    try {
      const result = await performBackupRestore(payload.filepath, { confirmed: payload.confirmed });
      return { success: true, data: result };
    } catch (error) {
      console.error('[IPC Handler settings:restore-backup Error]:', error);
      return { success: false, error: error.message || 'Database restore failed' };
    }
  });
}

/**
 * Perform a controlled, validated database restore with safety pre-backup and rollback
 */
async function performBackupRestore(backupPath, options = {}) {
  const { confirmed = false } = options;
  if (!confirmed) {
    throw new Error('Explicit confirmation is required before restoring a database backup because newer data will be replaced.');
  }

  if (!backupPath || typeof backupPath !== 'string' || !fs.existsSync(backupPath)) {
    throw new Error('Valid backup file path is required and file must exist.');
  }

  const Database = require('better-sqlite3');
  const { closeDatabase, initDatabase, getDatabasePath } = require('../database/connection');

  // 1. Validate the selected backup before touching live DB
  let backupDb;
  try {
    backupDb = new Database(backupPath, { readonly: true, fileMustExist: true });
    const backupIntegrity = backupDb.pragma('integrity_check');
    const isBackupIntegrityOk = Array.isArray(backupIntegrity) &&
      backupIntegrity.length === 1 &&
      backupIntegrity[0].integrity_check === 'ok';

    if (!isBackupIntegrityOk) {
      throw new Error(`Backup file failed integrity check: ${JSON.stringify(backupIntegrity)}`);
    }

    const backupFk = backupDb.pragma('foreign_key_check');
    if (Array.isArray(backupFk) && backupFk.length > 0) {
      throw new Error(`Backup file contains foreign key violations (${backupFk.length} found)`);
    }

    // Verify it contains basic expected tables
    const tableCheck = backupDb.prepare(`
      SELECT count(*) as cnt FROM sqlite_master WHERE type='table' AND name IN ('loans', 'customers', 'payments')
    `).get();
    if (!tableCheck || tableCheck.cnt < 3) {
      throw new Error('Selected backup is not a valid Sri Gold Pawn Shop database (missing core tables).');
    }
  } finally {
    if (backupDb) {
      backupDb.close();
    }
  }

  // 2. Create safety pre-restore backup of the current live database
  const liveDb = getDb();
  const liveDbPath = getDatabasePath();
  const userDataDir = app ? app.getPath('userData') : path.dirname(liveDbPath);
  const backupDir = path.join(userDataDir, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = Date.now();
  const safetyBackupPath = path.join(backupDir, `safety_prerestore_${timestamp}.sqlite`);

  // WAL-safe backup of live database
  await liveDb.backup(safetyBackupPath);

  // Checkpoint live DB before closing
  try {
    liveDb.pragma('wal_checkpoint(TRUNCATE)');
  } catch (e) {
    console.warn('WAL checkpoint warning during restore prep:', e);
  }

  // 3. Close database connection
  closeDatabase();

  const walPath = `${liveDbPath}-wal`;
  const shmPath = `${liveDbPath}-shm`;

  // Remove live WAL / SHM files
  if (fs.existsSync(walPath)) {
    try { fs.unlinkSync(walPath); } catch (e) { console.warn('Failed unlinking wal:', e); }
  }
  if (fs.existsSync(shmPath)) {
    try { fs.unlinkSync(shmPath); } catch (e) { console.warn('Failed unlinking shm:', e); }
  }

  // 4. Overwrite live DB with backup
  try {
    fs.copyFileSync(backupPath, liveDbPath);
  } catch (copyErr) {
    // Attempt emergency rollback
    console.error('File copy failed during restore. Rolling back to safety backup...', copyErr);
    try {
      fs.copyFileSync(safetyBackupPath, liveDbPath);
      initDatabase();
    } catch (rbErr) {
      console.error('Catastrophic rollback failure:', rbErr);
    }
    throw new Error(`Failed to copy backup file into place: ${copyErr.message}. Rolled back.`);
  }

  // 5. Reopen the restored database and verify integrity
  let reopenedDb;
  try {
    reopenedDb = initDatabase();
  } catch (initErr) {
    // Reopen failed: rollback!
    console.error('Reopening restored DB failed. Rolling back...', initErr);
    closeDatabase();
    if (fs.existsSync(walPath)) { try { fs.unlinkSync(walPath); } catch (_) {} }
    if (fs.existsSync(shmPath)) { try { fs.unlinkSync(shmPath); } catch (_) {} }
    fs.copyFileSync(safetyBackupPath, liveDbPath);
    initDatabase();
    throw new Error(`Failed to initialize restored database: ${initErr.message}. Successfully rolled back.`);
  }

  // Verify integrity of reopened database
  const reopenedIntegrity = reopenedDb.pragma('integrity_check');
  const reopenedFk = reopenedDb.pragma('foreign_key_check');

  const isReopenedIntegrityOk = Array.isArray(reopenedIntegrity) &&
    reopenedIntegrity.length === 1 &&
    reopenedIntegrity[0].integrity_check === 'ok';

  const isReopenedFkOk = Array.isArray(reopenedFk) && reopenedFk.length === 0;

  if (!isReopenedIntegrityOk || !isReopenedFkOk) {
    console.error('Restored DB failed post-restore verification. Rolling back...');
    closeDatabase();
    if (fs.existsSync(walPath)) { try { fs.unlinkSync(walPath); } catch (_) {} }
    if (fs.existsSync(shmPath)) { try { fs.unlinkSync(shmPath); } catch (_) {} }
    fs.copyFileSync(safetyBackupPath, liveDbPath);
    initDatabase();
    throw new Error(`Restored database failed integrity check (${JSON.stringify(reopenedIntegrity)}) or FK check (${JSON.stringify(reopenedFk)}). Successfully rolled back to pre-restore state.`);
  }

  // 6. Log restore event in history and audit log
  try {
    const backupStat = fs.statSync(backupPath);
    reopenedDb.prepare(`
      INSERT INTO backup_history (filename, filepath, size_bytes, status, created_at)
      VALUES (?, ?, ?, 'RESTORED', CURRENT_TIMESTAMP)
    `).run(path.basename(backupPath), backupPath, backupStat.size);

    reopenedDb.prepare(`
      INSERT INTO audit_logs (entity_type, entity_id, action, details_json, created_at)
      VALUES ('backup', 0, 'RESTORE', ?, CURRENT_TIMESTAMP)
    `).run(JSON.stringify({
      restored_from: backupPath,
      safety_backup: safetyBackupPath,
      restored_at: new Date().toISOString()
    }));
  } catch (logErr) {
    console.warn('Non-fatal: failed to record restore audit log:', logErr);
  }

  return {
    success: true,
    message: 'Database restored successfully and passed all integrity checks.',
    restored_from: backupPath,
    safety_backup: safetyBackupPath
  };
}

module.exports = {
  registerSettingIpcHandlers,
  performBackupRestore
};
