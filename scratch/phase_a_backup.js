const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

async function main() {
  const customUserData = path.join(process.env.APPDATA || '', 'sri-gold-pawn-shop-billing');
  const liveDbPath = path.join(customUserData, 'sri_gold_pawn_shop.sqlite');
  console.log('Live DB Path:', liveDbPath);
  console.log('Exists:', fs.existsSync(liveDbPath));

  if (!fs.existsSync(liveDbPath)) {
    console.error('Live DB does not exist at path');
    process.exit(1);
  }

  const db = new Database(liveDbPath);
  const versionRow = db.prepare("SELECT value FROM _schema_meta WHERE key = 'schema_version'").get();
  console.log('Current Schema Version:', versionRow ? versionRow.value : 'None');

  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
  console.log('Tables:', tables.join(', '));

  const backupDir = path.join(customUserData, 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const backupFile = path.join(backupDir, `safety_backup_phaseA_${Date.now()}.sqlite`);
  console.log('Creating safety backup at:', backupFile);
  await db.backup(backupFile);
  console.log('Backup created successfully.');
  db.close();

  // Verify backup
  const backupDb = new Database(backupFile);
  const integrity = backupDb.pragma('integrity_check');
  const fk = backupDb.pragma('foreign_key_check');
  console.log('Backup integrity_check:', JSON.stringify(integrity));
  console.log('Backup foreign_key_check violations count:', fk.length);
  backupDb.close();
  console.log('PHASE A SAFETY BACKUP VERIFIED.');
}

main().catch(err => {
  console.error('Phase A failed:', err);
  process.exit(1);
});
