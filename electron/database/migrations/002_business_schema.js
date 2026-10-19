/**
 * Migration 002: Business Schema for Sri Gold Pawn Shop Billing
 * Target Version: 2
 *
 * Money Strategy:
 *  - Stored as INTEGER paise (1 Rupee = 100 paise) to avoid floating point inaccuracies.
 *    Example: ₹1,500.50 -> 150050 paise.
 *
 * Weight Strategy:
 *  - Stored as INTEGER milligrams (1 gram = 1000 milligrams).
 *    Example: 8.450 grams -> 8450 mg.
 *    This ensures exact integer comparisons for gold weights and stone weights.
 */

const TARGET_VERSION = 2;

function up(db) {
  // 1. Sequences table for gap-free/transaction-safe numbering
  db.exec(`
    CREATE TABLE IF NOT EXISTS sequences (
      name TEXT PRIMARY KEY,
      prefix TEXT NOT NULL,
      current_value INTEGER NOT NULL DEFAULT 0 CHECK(current_value >= 0),
      padding INTEGER NOT NULL DEFAULT 4 CHECK(padding >= 1),
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed default sequence rows if not present
  const seedSeq = db.prepare(`
    INSERT OR IGNORE INTO sequences (name, prefix, current_value, padding)
    VALUES (?, ?, 0, ?)
  `);
  seedSeq.run('customer', 'CUST-', 4);
  seedSeq.run('loan', 'L-', 4);
  seedSeq.run('receipt', 'RCP-', 4);

  // 2. Customers table
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      alternate_phone TEXT,
      address TEXT,
      city TEXT DEFAULT 'Tirunelveli',
      id_proof_type TEXT CHECK(id_proof_type IN ('AADHAAR', 'PAN', 'VOTER_ID', 'DRIVING_LICENSE', 'RATION_CARD', 'OTHER') OR id_proof_type IS NULL),
      id_proof_number TEXT,
      photo_path TEXT,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(customer_code);
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
    CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
  `);

  // 3. Ornament master lookup table
  db.exec(`
    CREATE TABLE IF NOT EXISTS ornament_master (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL DEFAULT 'GOLD',
      default_purity TEXT DEFAULT '22K',
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed default ornament master items
  const seedOrnament = db.prepare(`
    INSERT OR IGNORE INTO ornament_master (name, category, default_purity)
    VALUES (?, 'GOLD', ?)
  `);
  const defaultOrnaments = [
    ['Ring', '22K'],
    ['Chain', '22K'],
    ['Bangle', '22K'],
    ['Necklace', '22K'],
    ['Earring', '22K'],
    ['Stud', '22K'],
    ['Pendant', '22K'],
    ['Anklet', 'OTHER'],
    ['Bracelet', '22K'],
    ['Gold Coin', '24K']
  ];
  for (const [name, purity] of defaultOrnaments) {
    seedOrnament.run(name, purity);
  }

  // 4. Loans (Pawn Pledge) table
  db.exec(`
    CREATE TABLE IF NOT EXISTS loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_number TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      loan_date DATE NOT NULL,
      principal_amount_paise INTEGER NOT NULL CHECK(principal_amount_paise > 0),
      monthly_interest_rate_basis_points INTEGER NOT NULL CHECK(monthly_interest_rate_basis_points >= 0),
      monthly_interest_rate_pct REAL NOT NULL CHECK(monthly_interest_rate_pct >= 0),
      term_months INTEGER NOT NULL DEFAULT 12 CHECK(term_months > 0),
      due_date DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'CLOSED', 'DEFAULTED', 'AUCTIONED')),
      total_gross_weight_mg INTEGER NOT NULL CHECK(total_gross_weight_mg > 0),
      total_net_weight_mg INTEGER NOT NULL CHECK(total_net_weight_mg > 0 AND total_net_weight_mg <= total_gross_weight_mg),
      total_item_count INTEGER NOT NULL DEFAULT 1 CHECK(total_item_count > 0),
      appraised_market_value_paise INTEGER NOT NULL DEFAULT 0 CHECK(appraised_market_value_paise >= 0),
      notes TEXT,
      closed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_loans_number ON loans(loan_number);
    CREATE INDEX IF NOT EXISTS idx_loans_customer_id ON loans(customer_id);
    CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);
    CREATE INDEX IF NOT EXISTS idx_loans_date ON loans(loan_date);
  `);

  // 5. Loan items (Pledged Ornaments) table
  db.exec(`
    CREATE TABLE IF NOT EXISTS loan_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE ON UPDATE CASCADE,
      ornament_type TEXT NOT NULL,
      description TEXT,
      item_count INTEGER NOT NULL DEFAULT 1 CHECK(item_count > 0),
      gross_weight_mg INTEGER NOT NULL CHECK(gross_weight_mg > 0),
      stone_weight_mg INTEGER NOT NULL DEFAULT 0 CHECK(stone_weight_mg >= 0),
      net_weight_mg INTEGER NOT NULL CHECK(net_weight_mg > 0 AND net_weight_mg <= gross_weight_mg),
      purity TEXT NOT NULL DEFAULT '22K' CHECK(purity IN ('24K', '22K', '916', '20K', '18K', 'OTHER')),
      estimated_value_paise INTEGER NOT NULL DEFAULT 0 CHECK(estimated_value_paise >= 0),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_loan_items_loan_id ON loan_items(loan_id);
  `);

  // 6. Payments (Repayments & Receipts) table
  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_number TEXT NOT NULL UNIQUE,
      loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      payment_date DATE NOT NULL,
      total_amount_paise INTEGER NOT NULL CHECK(total_amount_paise > 0),
      principal_component_paise INTEGER NOT NULL DEFAULT 0 CHECK(principal_component_paise >= 0),
      interest_component_paise INTEGER NOT NULL DEFAULT 0 CHECK(interest_component_paise >= 0),
      penalty_component_paise INTEGER NOT NULL DEFAULT 0 CHECK(penalty_component_paise >= 0),
      payment_mode TEXT NOT NULL DEFAULT 'CASH' CHECK(payment_mode IN ('CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE')),
      reference_txn_id TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_payment_sum CHECK(total_amount_paise = (principal_component_paise + interest_component_paise + penalty_component_paise))
    );

    CREATE INDEX IF NOT EXISTS idx_payments_receipt_number ON payments(receipt_number);
    CREATE INDEX IF NOT EXISTS idx_payments_loan_id ON payments(loan_id);
    CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);
  `);

  // 7. Loan status history audit table
  db.exec(`
    CREATE TABLE IF NOT EXISTS loan_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE ON UPDATE CASCADE,
      previous_status TEXT,
      new_status TEXT NOT NULL,
      reason TEXT,
      changed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_loan_status_history_loan_id ON loan_status_history(loan_id);
  `);

  // 8. Audit logs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      action TEXT NOT NULL,
      details_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
  `);
}

module.exports = {
  targetVersion: TARGET_VERSION,
  up
};
