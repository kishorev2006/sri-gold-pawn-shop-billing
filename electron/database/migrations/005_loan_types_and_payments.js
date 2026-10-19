/**
 * Migration 005: Loan Types (OPEN vs FIXED) and Payment Classification
 * Target Version: 5
 *
 * Requirements:
 * 1. Add `loan_type` to `loans` with 'OPEN' and 'FIXED' values.
 *    - 'OPEN' loans allow NULL due_date.
 *    - 'FIXED' loans require a valid non-empty due_date.
 *    - Uses SQLite safe table rebuild procedure with foreign key preservation.
 * 2. Add `payment_type` to `payments` with 'INTEREST', 'PRINCIPAL', 'SETTLEMENT'.
 *    - Reliable historical payment type backfill based on component values.
 */

const TARGET_VERSION = 5;

function up(db) {
  // 1. Add payment_type column to payments if not present
  const paymentCols = db.prepare(`PRAGMA table_info(payments)`).all().map(c => c.name);
  if (!paymentCols.includes('payment_type')) {
    db.exec(`
      ALTER TABLE payments
      ADD COLUMN payment_type TEXT CHECK(payment_type IN ('INTEREST', 'PRINCIPAL', 'SETTLEMENT'));
    `);

    // Backfill historical payments reliably:
    // - Only interest paid: 'INTEREST'
    // - Only principal paid: 'PRINCIPAL'
    // - Both principal and interest paid: 'SETTLEMENT'
    db.exec(`
      UPDATE payments
      SET payment_type = CASE
        WHEN principal_component_paise > 0 AND interest_component_paise = 0 THEN 'PRINCIPAL'
        WHEN interest_component_paise > 0 AND principal_component_paise = 0 THEN 'INTEREST'
        WHEN principal_component_paise > 0 AND interest_component_paise > 0 THEN 'SETTLEMENT'
        ELSE 'PRINCIPAL'
      END
      WHERE payment_type IS NULL;
    `);
  }

  // 2. Check if loan_type already exists on loans
  const loanCols = db.prepare(`PRAGMA table_info(loans)`).all().map(c => c.name);
  if (!loanCols.includes('loan_type')) {
    // Disable foreign keys outside transaction for table recreation
    db.pragma('foreign_keys = OFF');

    const rebuildLoansTx = db.transaction(() => {
      // Create loans_new with loan_type and conditional due_date check
      db.exec(`
        CREATE TABLE loans_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          loan_number TEXT NOT NULL UNIQUE,
          customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT ON UPDATE CASCADE,
          loan_type TEXT NOT NULL DEFAULT 'FIXED' CHECK(loan_type IN ('OPEN', 'FIXED')),
          loan_date DATE NOT NULL,
          pledge_date DATE,
          principal_amount_paise INTEGER NOT NULL CHECK(principal_amount_paise > 0),
          monthly_interest_rate_basis_points INTEGER NOT NULL CHECK(monthly_interest_rate_basis_points >= 0),
          monthly_interest_rate_pct REAL NOT NULL CHECK(monthly_interest_rate_pct >= 0),
          interest_type TEXT NOT NULL DEFAULT 'MONTHLY' CHECK(interest_type IN ('WEEKLY', 'MONTHLY')),
          interest_duration INTEGER NOT NULL DEFAULT 12 CHECK(interest_duration > 0),
          term_months INTEGER NOT NULL DEFAULT 12 CHECK(term_months > 0),
          due_date DATE,
          maturity_date DATE,
          status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'CLOSED', 'DEFAULTED', 'AUCTIONED')),
          total_gross_weight_mg INTEGER NOT NULL CHECK(total_gross_weight_mg > 0),
          total_net_weight_mg INTEGER NOT NULL CHECK(total_net_weight_mg > 0 AND total_net_weight_mg <= total_gross_weight_mg),
          total_item_count INTEGER NOT NULL DEFAULT 1 CHECK(total_item_count > 0),
          appraised_market_value_paise INTEGER NOT NULL DEFAULT 0 CHECK(appraised_market_value_paise >= 0),
          notes TEXT,
          closed_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT chk_fixed_due_date CHECK(
            (loan_type = 'OPEN') OR 
            (loan_type = 'FIXED' AND due_date IS NOT NULL AND due_date != '')
          )
        );
      `);

      // Inspect existing columns in loans table
      const loanCols = db.prepare(`PRAGMA table_info(loans)`).all().map(c => c.name);
      const closedAtSelect = loanCols.includes('closed_at') ? 'closed_at' : 'NULL AS closed_at';

      // Copy existing loans into loans_new, preserving all records and setting loan_type = 'FIXED'
      db.exec(`
        INSERT INTO loans_new (
          id, loan_number, customer_id, loan_type, loan_date, pledge_date,
          principal_amount_paise, monthly_interest_rate_basis_points, monthly_interest_rate_pct,
          interest_type, interest_duration, term_months, due_date, maturity_date, status,
          total_gross_weight_mg, total_net_weight_mg, total_item_count, appraised_market_value_paise,
          notes, closed_at, created_at, updated_at
        )
        SELECT 
          id, loan_number, customer_id, 'FIXED', loan_date, pledge_date,
          principal_amount_paise, monthly_interest_rate_basis_points, monthly_interest_rate_pct,
          interest_type, interest_duration, term_months, due_date, maturity_date, status,
          total_gross_weight_mg, total_net_weight_mg, total_item_count, appraised_market_value_paise,
          notes, ${closedAtSelect}, created_at, updated_at
        FROM loans;
      `);

      // Drop old loans table
      db.exec('DROP TABLE loans;');

      // Rename loans_new to loans
      db.exec('ALTER TABLE loans_new RENAME TO loans;');

      // Recreate all indexes
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_loans_number ON loans(loan_number);
        CREATE INDEX IF NOT EXISTS idx_loans_customer_id ON loans(customer_id);
        CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);
        CREATE INDEX IF NOT EXISTS idx_loans_date ON loans(loan_date);
        CREATE INDEX IF NOT EXISTS idx_loans_maturity_date ON loans(maturity_date);
        CREATE INDEX IF NOT EXISTS idx_loans_type ON loans(loan_type);
      `);
    });

    rebuildLoansTx();

    // Re-enable foreign keys
    db.pragma('foreign_keys = ON');
  }
}

module.exports = {
  targetVersion: TARGET_VERSION,
  up
};
