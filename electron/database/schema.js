/**
 * Schema and migration runner for Sri Gold Pawn Shop Billing.
 * Supports transactional incremental migrations from v1 upwards,
 * preserving existing database files and customer data.
 */

const migration002 = require('./migrations/002_business_schema');
const migration003 = require('./migrations/003_enhanced_loans');
const migration004 = require('./migrations/004_settings_and_backups');
const migration005 = require('./migrations/005_loan_types_and_payments');

const INITIAL_SCHEMA_VERSION = 1;
const TARGET_SCHEMA_VERSION = 5;

// Ordered list of migrations
const MIGRATIONS = [
  migration002,
  migration003,
  migration004,
  migration005
];


/**
 * Initializes the schema and applies any outstanding migrations sequentially.
 * Every migration runs within a discrete transaction; if any migration fails,
 * its changes are automatically rolled back and an error is thrown.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {{ initialized: boolean, version: number }}
 */
function initializeSchema(db) {
  // 1. Ensure metadata table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS _schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Determine current schema version
  const versionRow = db.prepare(`SELECT value FROM _schema_meta WHERE key = 'schema_version'`).get();
  let currentVersion = versionRow ? parseInt(versionRow.value, 10) : 0;

  if (!versionRow) {
    // Fresh database: establish baseline version 1
    db.prepare(`INSERT INTO _schema_meta (key, value) VALUES ('schema_version', ?)`).run(INITIAL_SCHEMA_VERSION.toString());
    db.prepare(`INSERT INTO _schema_meta (key, value) VALUES ('created_at', ?)`).run(new Date().toISOString());
    currentVersion = INITIAL_SCHEMA_VERSION;
    console.log(`[Database Schema] Fresh database initialized with baseline version ${INITIAL_SCHEMA_VERSION}`);
  }

  // 3. Apply pending migrations sequentially in transactions
  const updateVersionStmt = db.prepare(`
    UPDATE _schema_meta
    SET value = ?, updated_at = CURRENT_TIMESTAMP
    WHERE key = 'schema_version'
  `);

  for (const migration of MIGRATIONS) {
    if (currentVersion < migration.targetVersion) {
      console.log(`[Database Schema] Applying migration to version ${migration.targetVersion}...`);
      
      const runTx = db.transaction(() => {
        migration.up(db);
        updateVersionStmt.run(migration.targetVersion.toString());
      });

      // Execute transactionally
      runTx();
      currentVersion = migration.targetVersion;
      console.log(`[Database Schema] Successfully migrated to version ${currentVersion}`);
    } else {
      // Safely skip already-applied migration
      // console.log(`[Database Schema] Migration ${migration.targetVersion} already applied, skipping.`);
    }
  }

  return {
    initialized: true,
    version: currentVersion
  };
}

/**
 * Transaction-safe sequence generator for gap-free document numbering.
 * Atomically increments and returns formatted sequence string (e.g. 'L-0001').
 *
 * @param {import('better-sqlite3').Database} db
 * @param {'customer' | 'loan' | 'receipt'} name
 * @returns {string} Formatted sequence number
 */
function getNextSequence(db, name) {
  const getSeqTx = db.transaction(() => {
    const update = db.prepare(`
      UPDATE sequences
      SET current_value = current_value + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE name = ?
    `).run(name);

    if (update.changes === 0) {
      throw new Error(`Sequence '${name}' not found.`);
    }

    const row = db.prepare(`
      SELECT prefix, current_value, padding
      FROM sequences
      WHERE name = ?
    `).get(name);

    return `${row.prefix}${String(row.current_value).padStart(row.padding, '0')}`;
  });

  return getSeqTx();
}

module.exports = {
  initializeSchema,
  getNextSequence,
  INITIAL_SCHEMA_VERSION,
  TARGET_SCHEMA_VERSION
};
