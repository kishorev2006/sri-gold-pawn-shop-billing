/**
 * Migration 004: App Settings & Comprehensive Financial Tables
 * Target Version: 4
 *
 * Adds:
 * 1. `app_settings` table: Key-value store for shop information, default interest rates,
 *    receipt headers, and backup preferences.
 * 2. Backups tracking table `backup_history` for audit and restore logs.
 */

const TARGET_VERSION = 4;

function up(db) {
  // 1. Settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed default shop settings if not already present
  const seedSetting = db.prepare(`
    INSERT OR IGNORE INTO app_settings (key, value)
    VALUES (?, ?)
  `);

  seedSetting.run('shop_name', 'Sri Gold Pawn Shop');
  seedSetting.run('shop_tagline', 'Trusted Gold Loan & Pawn Services');
  seedSetting.run('shop_phone', '9840123456');
  seedSetting.run('shop_address', '124, Main Road, Tirunelveli, Tamil Nadu - 627001');
  seedSetting.run('default_monthly_interest_pct', '1.5');
  seedSetting.run('default_weekly_interest_pct', '0.5');
  seedSetting.run('receipt_footer_notes', 'Pledged ornaments can be redeemed upon full repayment of principal and accrued interest.');

  // 2. Backup history tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS backup_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'SUCCESS',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

module.exports = {
  targetVersion: TARGET_VERSION,
  up
};
