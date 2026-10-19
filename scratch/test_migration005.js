const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Test table rebuild and migration 005 logic on a temporary copy
function testMigration005() {
  const tmpDir = path.join(__dirname, 'test_tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const testDbFile = path.join(tmpDir, `migration005_test_${Date.now()}.sqlite`);
  const db = new Database(testDbFile);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Set up schema v1-v4
  const { initializeSchema } = require('../electron/database/schema');
  initializeSchema(db);

  // Insert a test customer, a loan, an item, a payment
  db.exec(`
    INSERT INTO customers (customer_code, name, phone) VALUES ('CUST-0001', 'Test User', '9876543210');
    INSERT INTO loans (
      loan_number, customer_id, loan_date, pledge_date, maturity_date,
      principal_amount_paise, monthly_interest_rate_basis_points, monthly_interest_rate_pct,
      interest_type, interest_duration, term_months, due_date, status,
      total_gross_weight_mg, total_net_weight_mg, total_item_count
    ) VALUES (
      'L-0001', 1, '2026-09-01', '2026-09-01', '2026-10-01',
      1000000, 150, 1.5, 'MONTHLY', 1, 1, '2026-10-01', 'ACTIVE',
      10000, 9500, 1
    );
    INSERT INTO loan_items (loan_id, ornament_type, item_count, gross_weight_mg, stone_weight_mg, net_weight_mg, purity)
    VALUES (1, 'Ring', 1, 10000, 500, 9500, '22K');
    INSERT INTO payments (receipt_number, loan_id, payment_date, total_amount_paise, principal_component_paise, interest_component_paise, penalty_component_paise)
    VALUES ('RCP-0001', 1, '2026-09-15', 15000, 0, 15000, 0);
  `);

  console.log('Setup completed. Now testing migration 005...');

  // Test 1: Add payment_type column to payments
  db.exec(`
    ALTER TABLE payments ADD COLUMN payment_type TEXT CHECK(payment_type IN ('INTEREST', 'PRINCIPAL', 'SETTLEMENT'));
  `);

  // Backfill existing payments:
  // If principal_component_paise > 0 and interest == 0 -> 'PRINCIPAL'
  // If interest_component_paise > 0 and principal == 0 -> 'INTEREST'
  // If loan status was closed by this payment or (principal > 0 and interest > 0) -> 'SETTLEMENT'
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

  console.log('Payments backfilled:', db.prepare('SELECT id, payment_type FROM payments').all());

  // Test 2: Table rebuild for loans to support OPEN (due_date NULL) and FIXED (due_date NOT NULL)
  // 1. Disable foreign keys before table recreation transaction
  db.pragma('foreign_keys = OFF');

  const rebuildTx = db.transaction(() => {
    // 2. Create new table
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

    // 3. Copy data from loans to loans_new (defaulting loan_type = 'FIXED')
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
        notes, closed_at, created_at, updated_at
      FROM loans;
    `);

    // 4. Drop old table
    db.exec('DROP TABLE loans;');

    // 5. Rename new table
    db.exec('ALTER TABLE loans_new RENAME TO loans;');

    // 6. Recreate indexes
    db.exec(`
      CREATE INDEX idx_loans_number ON loans(loan_number);
      CREATE INDEX idx_loans_customer_id ON loans(customer_id);
      CREATE INDEX idx_loans_status ON loans(status);
      CREATE INDEX idx_loans_date ON loans(loan_date);
      CREATE INDEX idx_loans_maturity_date ON loans(maturity_date);
      CREATE INDEX idx_loans_type ON loans(loan_type);
    `);
  });

  rebuildTx();

  // 7. Re-enable foreign keys after transaction
  db.pragma('foreign_keys = ON');
  console.log('Table rebuild transaction succeeded.');


  // Test PRAGMA integrity_check and foreign_key_check
  const integrity = db.pragma('integrity_check');
  const fk = db.pragma('foreign_key_check');
  console.log('Integrity check:', integrity);
  console.log('FK check violations count:', fk.length);

  // Test inserting an OPEN loan (due_date NULL is allowed)
  db.exec(`
    INSERT INTO loans (
      loan_number, customer_id, loan_type, loan_date, pledge_date,
      principal_amount_paise, monthly_interest_rate_basis_points, monthly_interest_rate_pct,
      interest_type, interest_duration, term_months, due_date, maturity_date, status,
      total_gross_weight_mg, total_net_weight_mg, total_item_count
    ) VALUES (
      'L-0002', 1, 'OPEN', '2026-10-01', '2026-10-01',
      500000, 150, 1.5, 'MONTHLY', 12, 12, NULL, NULL, 'ACTIVE',
      5000, 4800, 1
    );
  `);
  console.log('OPEN loan with NULL due_date inserted successfully.');

  // Test inserting a FIXED loan without due_date (MUST FAIL)
  let fixedFailed = false;
  try {
    db.exec(`
      INSERT INTO loans (
        loan_number, customer_id, loan_type, loan_date, pledge_date,
        principal_amount_paise, monthly_interest_rate_basis_points, monthly_interest_rate_pct,
        interest_type, interest_duration, term_months, due_date, maturity_date, status,
        total_gross_weight_mg, total_net_weight_mg, total_item_count
      ) VALUES (
        'L-0003', 1, 'FIXED', '2026-10-01', '2026-10-01',
        500000, 150, 1.5, 'MONTHLY', 12, 12, NULL, NULL, 'ACTIVE',
        5000, 4800, 1
      );
    `);
  } catch (err) {
    fixedFailed = true;
    console.log('FIXED loan with NULL due_date correctly rejected by CHECK constraint:', err.message);
  }

  if (!fixedFailed) throw new Error('Expected FIXED loan without due_date to fail');

  db.close();
  console.log('ALL MIGRATION 005 TESTS PASSED.');
}

testMigration005();
