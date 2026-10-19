const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'sri-gold-pawn-shop-billing', 'sri_gold_pawn_shop.sqlite');
console.log('Inspecting:', dbPath);

const db = new Database(dbPath);
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables);

const meta = db.prepare("SELECT * FROM _schema_meta").all();
console.log('Metadata:', meta);

db.close();
