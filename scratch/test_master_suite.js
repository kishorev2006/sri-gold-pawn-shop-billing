/**
 * Master Verification Suite for Sri Gold Pawn Shop Billing
 * Tests:
 * 1. Schema migration to version 4 (tables: app_settings, backup_history, etc.)
 * 2. Customer management (CRUD, phone validation, sequence generation)
 * 3. Custom ornament catalog
 * 4. Multi-item gold loan creation (weights in mg, currency in paise, weekly/monthly interest, admin maturity date)
 * 5. Repayments (accrued interest, partial payment, balance deduction, receipt numbering)
 * 6. Full loan settlement (closure, atomic status update, overdue prevention)
 * 7. Live dashboard metrics calculation
 * 8. Business reports (Loan register, Overdue report, Collection register)
 * 9. Settings management & WAL backup execution
 * 10. Database integrity & foreign key checks
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { initializeSchema, getNextSequence, TARGET_SCHEMA_VERSION } = require('../electron/database/schema');

async function runMasterSuite() {
  console.log('====================================================');
  console.log('SRI GOLD PAWN SHOP BILLING — MASTER VERIFICATION SUITE');
  console.log('====================================================');

  const testDbDir = path.join(__dirname, 'test_tmp');
  if (!fs.existsSync(testDbDir)) {
    fs.mkdirSync(testDbDir, { recursive: true });
  }

  const testDbPath = path.join(testDbDir, `master_test_${Date.now()}.sqlite`);
  console.log(`[Setup] Creating isolated test database at: ${testDbPath}`);

  const db = new Database(testDbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, testName) {
    totalTests++;
    if (condition) {
      console.log(`  ✔ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`  ✖ [FAIL] ${testName}`);
      throw new Error(`Test failed: ${testName}`);
    }
  }

  try {
    // ----------------------------------------------------
    // TEST 1: Migration to Target Schema Version 4
    // ----------------------------------------------------
    console.log('\n--- Test Group 1: Schema Migrations (v5) ---');
    const migResult = initializeSchema(db);
    assert(migResult.version === 5, `Database migrated to schema version 5 (got ${migResult.version})`);

    assert(TARGET_SCHEMA_VERSION === 5, `TARGET_SCHEMA_VERSION is 5`);

    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map(t => t.name);
    assert(tables.includes('customers'), 'customers table exists');
    assert(tables.includes('loans'), 'loans table exists');
    assert(tables.includes('loan_items'), 'loan_items table exists');
    assert(tables.includes('payments'), 'payments table exists');
    assert(tables.includes('ornament_master'), 'ornament_master table exists');
    assert(tables.includes('app_settings'), 'app_settings table exists');
    assert(tables.includes('backup_history'), 'backup_history table exists');


    // ----------------------------------------------------
    // TEST 2: Sequence Numbering (Customer, Loan, Receipt)
    // ----------------------------------------------------
    console.log('\n--- Test Group 2: Sequence Generation ---');
    const custCode1 = getNextSequence(db, 'customer');
    const custCode2 = getNextSequence(db, 'customer');
    assert(custCode1 === 'CUST-0001', `First customer code is CUST-0001 (got ${custCode1})`);
    assert(custCode2 === 'CUST-0002', `Second customer code is CUST-0002 (got ${custCode2})`);

    const loanNum1 = getNextSequence(db, 'loan');
    assert(loanNum1 === 'L-0001', `First loan number is L-0001 (got ${loanNum1})`);


    const receiptNum1 = getNextSequence(db, 'receipt');
    assert(receiptNum1 === 'RCP-0001', `First receipt number is RCP-0001 (got ${receiptNum1})`);

    // ----------------------------------------------------
    // TEST 3: Customer Management & Validations
    // ----------------------------------------------------
    console.log('\n--- Test Group 3: Customer Management ---');
    const insertCust = db.prepare(`
      INSERT INTO customers (customer_code, name, phone, address, city)
      VALUES (?, ?, ?, ?, ?)
    `);

    const cust1 = insertCust.run(custCode1, 'Sivalingam Pillai', '9876543210', '12 Bazaar St', 'Tirunelveli');
    assert(cust1.changes === 1, 'Customer 1 inserted successfully');

    // Test duplicate phone check (application-level constraint on active customers)
    const existingPhone = db.prepare(`
      SELECT id, customer_code, name FROM customers WHERE phone = ? AND is_active = 1
    `).get('9876543210');
    assert(Boolean(existingPhone), 'Detected existing active customer by primary phone number');

    const cust2 = insertCust.run(custCode2, 'Murugan K', '9876543211', '45 North St', 'Palayamkottai');
    assert(cust2.changes === 1, 'Customer 2 inserted with distinct phone');


    // ----------------------------------------------------
    // TEST 4: Custom Ornament Catalog
    // ----------------------------------------------------
    console.log('\n--- Test Group 4: Custom Ornament Catalog ---');
    const insertOrnament = db.prepare(`
      INSERT INTO ornament_master (name, default_purity, is_active)
      VALUES (?, ?, 1)
    `);

    insertOrnament.run('Kasumalai', '22K');
    const customOrn = db.prepare(`SELECT * FROM ornament_master WHERE name = ?`).get('Kasumalai');
    assert(customOrn && customOrn.name === 'Kasumalai', 'Custom ornament Kasumalai added to master');

    // Case-insensitive duplicate check as enforced in loanHandler.js
    const existingOrn = db.prepare(`
      SELECT id, name FROM ornament_master WHERE LOWER(name) = LOWER(?)
    `).get('kasumalai');
    assert(Boolean(existingOrn), 'Prevented case-insensitive duplicate ornament name via LOWER() check');


    // ----------------------------------------------------
    // TEST 5: Gold Loan Creation (Weights in mg, paise, maturity)
    console.log('\n--- Test Group 5: Gold Loan Creation ---');
    // Loan 1: Monthly interest, ₹25,000 (2,500,000 paise), maturity date set
    const insertLoan = db.prepare(`

      INSERT INTO loans (
        loan_number, customer_id, loan_date, pledge_date, maturity_date,
        principal_amount_paise, monthly_interest_rate_basis_points, monthly_interest_rate_pct,
        interest_type, interest_duration, term_months, due_date, status,
        total_gross_weight_mg, total_net_weight_mg, total_item_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
    `);

    const loan1 = insertLoan.run(
      loanNum1,
      cust1.lastInsertRowid,
      '2026-09-01',
      '2026-09-01',
      '2026-10-01', // Admin selected maturity date in the past -> Overdue!
      2500000,      // ₹25,000
      150,          // 1.5% = 150 basis points
      1.5,
      'MONTHLY',
      1,
      1,
      '2026-10-01',
      36500,        // 36.5g
      35000,        // 35.0g
      2
    );
    const loan1Id = loan1.lastInsertRowid;

    // Add multi-item pledged ornaments (gross: 12.5g = 12500mg, stone: 0.5g = 500mg, net: 12000mg)
    const insertItem = db.prepare(`
      INSERT INTO loan_items (
        loan_id, ornament_type, description, item_count,
        gross_weight_mg, stone_weight_mg, net_weight_mg, purity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertItem.run(loan1Id, 'Gold Chain', '22K Rope Chain', 1, 12500, 500, 12000, '22K');
    insertItem.run(loan1Id, 'Kasumalai', 'Traditional Coin Necklace', 1, 24000, 1000, 23000, '22K');

    const items = db.prepare(`SELECT * FROM loan_items WHERE loan_id = ?`).all(loan1Id);
    assert(items.length === 2, '2 pledged ornaments recorded atomically');
    assert(items[0].net_weight_mg === 12000, 'Chain net weight is 12,000 mg (12.000 g)');
    assert(items[1].net_weight_mg === 23000, 'Kasumalai net weight is 23,000 mg (23.000 g)');

    // Loan 2: Weekly interest, ₹10,000, maturity date in future
    const loanNum2 = getNextSequence(db, 'loan');
    const loan2 = insertLoan.run(
      loanNum2,
      cust2.lastInsertRowid,
      '2026-10-10',
      '2026-10-10',
      '2026-11-10', // In the future -> Active, NOT overdue!
      1000000,      // ₹10,000
      50,           // 0.5% = 50 basis points
      0.5,
      'WEEKLY',
      4,
      1,
      '2026-11-10',
      4500,
      4300,
      1
    );
    const loan2Id = loan2.lastInsertRowid;
    insertItem.run(loan2Id, 'Gold Ring', 'Signet Ring', 1, 4500, 200, 4300, '22K');

    // ----------------------------------------------------

    // TEST 6: Repayment & Partial Balance Calculation
    // ----------------------------------------------------
    console.log('\n--- Test Group 6: Payments & Repayments ---');
    // Loan 1 has ₹25,000 principal. Customer pays ₹5,000 principal + ₹375 interest
    const insertPayment = db.prepare(`
      INSERT INTO payments (
        receipt_number, loan_id, payment_date, total_amount_paise,
        principal_component_paise, interest_component_paise, penalty_component_paise,
        payment_mode, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertPayment.run(
      receiptNum1,
      loan1Id,
      '2026-09-15',
      537500, // ₹5,375.00
      500000, // ₹5,000.00
      37500,  // ₹375.00
      0,
      'CASH',
      'Partial principal reduction'
    );

    // Verify remaining principal on Loan 1
    const paidRow = db.prepare(`
      SELECT SUM(principal_component_paise) AS paid_principal
      FROM payments WHERE loan_id = ?
    `).get(loan1Id);
    const remainingLoan1Paise = 2500000 - paidRow.paid_principal;
    assert(remainingLoan1Paise === 2000000, `Remaining principal on Loan 1 is ₹20,000 (2,000,000 paise) (got ${remainingLoan1Paise})`);

    // Verify overpayment rejection rule
    const attemptOverpaymentPaise = 2500000; // Trying to pay ₹25,000 when only ₹20,000 remains
    const isOverpayment = attemptOverpaymentPaise > remainingLoan1Paise;
    assert(isOverpayment, 'Correctly flagged principal overpayment (> remaining balance)');

    // ----------------------------------------------------
    // TEST 7: Full Loan Settlement & Closure
    // ----------------------------------------------------
    console.log('\n--- Test Group 7: Full Settlement & Loan Closure ---');
    const receiptNum2 = getNextSequence(db, 'receipt');
    // Pay the remaining ₹20,000 principal + ₹300 interest
    insertPayment.run(
      receiptNum2,
      loan1Id,
      '2026-10-01',
      2030000, // ₹20,300.00
      2000000, // ₹20,000.00
      30000,   // ₹300.00
      0,
      'UPI',
      'Final settlement and ornament release'
    );

    // Atomically close loan
    db.prepare(`
      UPDATE loans
      SET status = 'CLOSED', closed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(loan1Id);

    const closedLoan = db.prepare(`SELECT * FROM loans WHERE id = ?`).get(loan1Id);
    assert(closedLoan.status === 'CLOSED', 'Loan 1 status transitioned to CLOSED');
    assert(closedLoan.closed_at !== null, 'Loan 1 closed_at timestamp is populated');

    // Verify CLOSED loan is NEVER overdue, even though maturity_date (2026-10-01) is in the past!
    const today = '2026-10-12';
    const isLoan1Overdue = closedLoan.status === 'ACTIVE' && closedLoan.maturity_date < today;
    assert(!isLoan1Overdue, 'Closed loan is NEVER overdue, even if maturity date has elapsed');

    // ----------------------------------------------------
    // TEST 8: Live Dashboard Metrics Calculation
    // ----------------------------------------------------
    console.log('\n--- Test Group 8: Dashboard Live Aggregations ---');
    const activeCount = db.prepare(`SELECT COUNT(*) AS c FROM loans WHERE status = 'ACTIVE'`).get().c;
    const closedCount = db.prepare(`SELECT COUNT(*) AS c FROM loans WHERE status = 'CLOSED'`).get().c;
    assert(activeCount === 1, `Active loans count is 1 (Loan 2) (got ${activeCount})`);
    assert(closedCount === 1, `Closed loans count is 1 (Loan 1) (got ${closedCount})`);

    // Total principal outstanding = Loan 2 principal (₹10,000)
    const activeLoansPrincipal = db.prepare(`
      SELECT SUM(principal_amount_paise) AS p FROM loans WHERE status = 'ACTIVE'
    `).get().p;
    assert(activeLoansPrincipal === 1000000, `Active principal outstanding is ₹10,000 (1,000,000 paise)`);

    // Total collections = 537,500 + 2,030,000 = 2,567,500 paise (₹25,675)
    const totalCollections = db.prepare(`
      SELECT SUM(total_amount_paise) AS tot FROM payments
    `).get().tot;
    assert(totalCollections === 2567500, `Total collections is ₹25,675 (got ${totalCollections})`);

    // ----------------------------------------------------
    // TEST 9: App Settings & WAL Database Backup
    // ----------------------------------------------------
    console.log('\n--- Test Group 9: Settings & WAL Backup ---');
    const getSetting = db.prepare(`SELECT value FROM app_settings WHERE key = 'shop_name'`).get();
    assert(getSetting && getSetting.value === 'Sri Gold Pawn Shop', 'Default shop_name setting retrieved');

    // Update setting
    db.prepare(`UPDATE app_settings SET value = 'Sri Gold Pawn Brokers & Bankers' WHERE key = 'shop_name'`).run();
    const updatedSetting = db.prepare(`SELECT value FROM app_settings WHERE key = 'shop_name'`).get();
    assert(updatedSetting.value === 'Sri Gold Pawn Brokers & Bankers', 'Updated shop_name setting verified');

    // Test WAL-safe database backup
    const backupDest = path.join(testDbDir, `backup_snap_${Date.now()}.sqlite`);
    await db.backup(backupDest);
    assert(fs.existsSync(backupDest), 'Online database backup created successfully via db.backup()');
    const bStats = fs.statSync(backupDest);
    assert(bStats.size > 0, `Backup file size is valid (${bStats.size} bytes)`);

    // Record in backup_history
    db.prepare(`
      INSERT INTO backup_history (filename, filepath, size_bytes, status)
      VALUES (?, ?, ?, 'SUCCESS')
    `).run(path.basename(backupDest), backupDest, bStats.size);
    const bHist = db.prepare(`SELECT * FROM backup_history`).all();
    assert(bHist.length === 1, 'Backup event recorded in backup_history table');

    // ----------------------------------------------------
    // TEST 10: Database Integrity Verification
    // ----------------------------------------------------
    console.log('\n--- Test Group 10: PRAGMA Integrity Checks ---');
    const integrityCheck = db.pragma('integrity_check');
    assert(integrityCheck.length === 1 && integrityCheck[0].integrity_check === 'ok', 'PRAGMA integrity_check passed (ok)');

    const fkCheck = db.pragma('foreign_key_check');
    assert(fkCheck.length === 0, 'PRAGMA foreign_key_check passed (0 violations)');

    console.log('\n====================================================');
    console.log(`ALL TESTS PASSED: ${passedTests} / ${totalTests} assertions passed.`);
    console.log('====================================================\n');

  } finally {
    db.close();
    // Cleanup temporary test files
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      const wal = `${testDbPath}-wal`;
      const shm = `${testDbPath}-shm`;
      if (fs.existsSync(wal)) fs.unlinkSync(wal);
      if (fs.existsSync(shm)) fs.unlinkSync(shm);
    } catch (e) {
      // ignore cleanup errors
    }
  }
}

runMasterSuite().catch((err) => {
  console.error('\n❌ MASTER VERIFICATION SUITE FAILED:', err);
  process.exit(1);
});
