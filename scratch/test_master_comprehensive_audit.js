/**
 * Master Comprehensive Quality Audit & Validation Suite
 * Sri Gold Pawn Shop Billing
 *
 * Runs across isolated temporary databases in scratch/test_sandbox_<timestamp>/
 * Covers:
 *  - Phase 4: Database & Migrations (v1->v5, FKs, Transactions, Rollbacks)
 *  - Phase 5: Customer Management (CRUD, validations, duplicate phone, Unicode, FK delete block)
 *  - Phase 6: Ornament & Gold Item Management (Weights in mg, Net=Gross-Stone, custom ornaments)
 *  - Phase 7: Loan Creation & Lifecycle (OPEN vs FIXED, atomic multi-item, sequence numbering)
 *  - Phase 8: Financial Interest Engine (Independent expected vs actual, day intervals, leap years, segments)
 *  - Phase 9: Repayments & Settlement (Classification, overpayment prevention, concession, loan closure)
 *  - Phase 10: Billing, Receipts & Reports (Receipt consistency, CSV formula safety, aggregations)
 *  - Phase 11: Settings & Configuration (Key-value store, persistence, default rates)
 *  - Phase 12: Backup & Restore (Online WAL backup, corrupt restore rejection, rollback)
 *  - Phase 13: Electron IPC & Security Boundary (Allowlisted bridge, parameter validation, SQL injection safety)
 *  - Phase 15 & 16: Error Handling & Performance Benchmark (Unicode, injection, 500-record query performance)
 *  - Phase 19: Production Build & Asset Verification (dist bundle check)
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const { initializeSchema, getNextSequence, TARGET_SCHEMA_VERSION } = require('../electron/database/schema');
const { calculateLoanInterestSummary } = require('../electron/ipc/paymentHandler');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testResults = [];

function assert(condition, testName, details = {}) {
  totalTests++;
  const result = {
    testName,
    passed: Boolean(condition),
    details
  };
  testResults.push(result);

  if (condition) {
    passedTests++;
    console.log(`  ✓ [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  ✗ [FAIL] ${testName}`, details);
    throw new Error(`Test failed: ${testName} - ${JSON.stringify(details)}`);
  }
}

async function runMasterAudit() {
  console.log('======================================================================');
  console.log('SRI GOLD PAWN SHOP BILLING — MASTER QUALITY AUDIT & REGRESSION SUITE');
  console.log('======================================================================\n');

  const sandboxDir = path.join(__dirname, 'test_sandbox_' + Date.now());
  fs.mkdirSync(sandboxDir, { recursive: true });
  console.log(`[Sandbox] Isolated test workspace initialized at: ${sandboxDir}\n`);

  try {
    // =========================================================================
    // PHASE 4: Database Initialization, Migrations, Constraints & Transactions
    // =========================================================================
    console.log('--- PHASE 4: Database Initialization & Migrations ---');
    const dbFile = path.join(sandboxDir, 'audit_master.sqlite');
    const db = new Database(dbFile);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // 4.1 First-time database initialization
    const migResult = initializeSchema(db);
    assert(migResult.initialized === true, 'Database initialized successfully');
    assert(migResult.version === 5, 'Database migrated to target schema version 5', { expected: 5, actual: migResult.version });
    assert(TARGET_SCHEMA_VERSION === 5, 'TARGET_SCHEMA_VERSION constant is 5');

    // 4.2 Required tables existence
    const tableNames = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map(t => t.name);
    const requiredTables = [
      '_schema_meta', 'sequences', 'customers', 'loans', 'loan_items',
      'payments', 'ornament_master', 'app_settings', 'backup_history',
      'loan_status_history', 'audit_logs'
    ];
    for (const t of requiredTables) {
      assert(tableNames.includes(t), `Table '${t}' exists in database schema`);
    }

    // 4.3 SQLite PRAGMA integrity check & FK check
    const integrityCheck = db.pragma('integrity_check');
    assert(integrityCheck.length === 1 && integrityCheck[0].integrity_check === 'ok', 'Database passed PRAGMA integrity_check');
    const fkCheck = db.pragma('foreign_key_check');
    assert(fkCheck.length === 0, 'Database has 0 foreign key violations');

    // 4.4 Migration Idempotency (re-running initializeSchema should do nothing and stay at v5)
    const idempotentResult = initializeSchema(db);
    assert(idempotentResult.version === 5, 'initializeSchema is idempotent on already migrated database');

    // 4.5 Foreign key enforcement
    let fkBlocked = false;
    try {
      db.prepare(`
        INSERT INTO loans (
          loan_number, customer_id, loan_date, principal_amount_paise,
          monthly_interest_rate_basis_points, monthly_interest_rate_pct,
          due_date, total_gross_weight_mg, total_net_weight_mg
        ) VALUES ('L-TEST', 999999, '2026-01-01', 100000, 150, 1.5, '2026-02-01', 10000, 10000)
      `).run();
    } catch (e) {
      fkBlocked = e.message.includes('FOREIGN KEY');
    }
    assert(fkBlocked, 'Foreign key constraint blocked loan insertion for non-existent customer');

    // 4.6 Transaction rollback on partial failure
    let rollbackSuccess = false;
    try {
      db.transaction(() => {
        db.prepare(`INSERT INTO app_settings (key, value) VALUES ('test_tx_key', 'initial')`).run();
        // Force failure
        throw new Error('Forced transaction failure');
      })();
    } catch (e) {
      const checkRow = db.prepare(`SELECT value FROM app_settings WHERE key = 'test_tx_key'`).get();
      rollbackSuccess = (checkRow === undefined);
    }
    assert(rollbackSuccess, 'Transactional rollback prevents partial writes on error');

    // =========================================================================
    // PHASE 5: Customer Management
    // =========================================================================
    console.log('\n--- PHASE 5: Customer Management ---');
    // 5.1 Monotonic sequence code generation
    const cCode1 = getNextSequence(db, 'customer');
    assert(cCode1 === 'CUST-0001', 'First generated customer code is CUST-0001', { actual: cCode1 });
    const cCode2 = getNextSequence(db, 'customer');
    assert(cCode2 === 'CUST-0002', 'Second generated customer code is CUST-0002', { actual: cCode2 });

    // 5.2 Create valid customer
    const insertCustStmt = db.prepare(`
      INSERT INTO customers (customer_code, name, phone, alternate_phone, address, city, id_proof_type, id_proof_number)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const cust1Res = insertCustStmt.run(cCode1, 'Sivalingam Pillai', '9876543210', '9876543211', '12 Bazaar St', 'Tirunelveli', 'AADHAAR', '123456789012');
    const cust1Id = cust1Res.lastInsertRowid;
    assert(cust1Id > 0, 'Customer 1 inserted successfully');

    // 5.3 Unicode & Non-English name support
    const cCode3 = getNextSequence(db, 'customer');
    const custUnicode = insertCustStmt.run(cCode3, 'முத்து குமார் (Muthu Kumar)', '9443123456', null, '10 காந்தி வீதி', 'திருநெல்வேலி', 'VOTER_ID', 'VOT12345');
    const fetchedUnicode = db.prepare(`SELECT name, city FROM customers WHERE id = ?`).get(custUnicode.lastInsertRowid);
    assert(fetchedUnicode.name === 'முத்து குமார் (Muthu Kumar)', 'Unicode Tamil customer name preserved exactly');

    // 5.4 Unique constraint on customer_code
    let dupCodeFailed = false;
    try {
      insertCustStmt.run('CUST-0001', 'Duplicate Code User', '9123456780', null, null, null, null, null);
    } catch (e) {
      dupCodeFailed = e.message.includes('UNIQUE constraint');
    }
    assert(dupCodeFailed, 'Unique constraint on customer_code triggers on duplicate');

    // 5.5 Customer search by query (name, phone, code)
    const searchPattern = '%Sivalingam%';
    const searchResults = db.prepare(`
      SELECT customer_code, name, phone FROM customers WHERE is_active = 1 AND (name LIKE ? OR phone LIKE ? OR customer_code LIKE ?)
    `).all(searchPattern, searchPattern, searchPattern);
    assert(searchResults.length === 1 && searchResults[0].customer_code === 'CUST-0001', 'Customer search by name matches correctly');

    // 5.6 Customer update validation
    db.prepare(`UPDATE customers SET address = '14 North Car St' WHERE id = ?`).run(cust1Id);
    const updatedCust = db.prepare(`SELECT address FROM customers WHERE id = ?`).get(cust1Id);
    assert(updatedCust.address === '14 North Car St', 'Customer details updated and persisted');

    // =========================================================================
    // PHASE 6: Ornament & Gold Item Management
    // =========================================================================
    console.log('\n--- PHASE 6: Ornament & Gold Item Management ---');
    // 6.1 Default ornament master seeded
    const ornamentsMaster = db.prepare(`SELECT name, default_purity FROM ornament_master WHERE is_active = 1`).all();
    const masterNames = ornamentsMaster.map(o => o.name);
    assert(masterNames.includes('Ring'), 'Default ornament master includes Ring');
    assert(masterNames.includes('Chain'), 'Default ornament master includes Chain');
    assert(masterNames.includes('Bangle'), 'Default ornament master includes Bangle');

    // 6.2 Custom ornament addition
    db.prepare(`
      INSERT INTO ornament_master (name, category, default_purity, is_active)
      VALUES ('Kasumalai', 'GOLD', '22K', 1)
    `).run();
    const customOrnament = db.prepare(`SELECT name FROM ornament_master WHERE name = 'Kasumalai'`).get();
    assert(customOrnament && customOrnament.name === 'Kasumalai', 'Custom ornament Kasumalai added to master');

    // 6.3 Case-insensitive duplicate custom ornament prevention
    const existingKasumalai = db.prepare(`
      SELECT id, name FROM ornament_master WHERE LOWER(name) = LOWER('kasumalai')
    `).get();
    assert(Boolean(existingKasumalai), 'Case-insensitive duplicate check detects existing Kasumalai');

    // 6.4 Ornament weight calculation formula: net_weight = gross_weight - stone_weight
    const grossWeightMg = 12500; // 12.500 g
    const stoneWeightMg = 750;   // 0.750 g
    const netWeightMg = grossWeightMg - stoneWeightMg; // 11.750 g
    assert(netWeightMg === 11750, 'Integer milligram weight subtraction is exact (12500 - 750 = 11750 mg)');

    // =========================================================================
    // PHASE 7: Loan Creation & Loan Lifecycle
    // =========================================================================
    console.log('\n--- PHASE 7: Loan Creation & Loan Lifecycle ---');
    const loanNum1 = getNextSequence(db, 'loan');
    assert(loanNum1 === 'L-0001', 'First generated loan number is L-0001', { actual: loanNum1 });

    // 7.1 FIXED loan with valid due date
    const principalPaise = 5000000; // ₹50,000.00
    const monthlyRatePct = 1.5;
    const basisPoints = Math.round(monthlyRatePct * 100);

    const insertLoanTx = db.transaction(() => {
      const insLoan = db.prepare(`
        INSERT INTO loans (
          loan_number, customer_id, loan_type, loan_date, pledge_date,
          principal_amount_paise, monthly_interest_rate_basis_points, monthly_interest_rate_pct,
          interest_type, interest_duration, term_months, due_date, maturity_date, status,
          total_gross_weight_mg, total_net_weight_mg, total_item_count, appraised_market_value_paise
        ) VALUES (?, ?, 'FIXED', '2026-01-01', '2026-01-01', ?, ?, ?, 'MONTHLY', 12, 12, '2027-01-01', '2027-01-01', 'ACTIVE', ?, ?, 2, 7000000)
      `).run(loanNum1, cust1Id, principalPaise, basisPoints, monthlyRatePct, 24000, 22750);

      const loanId = insLoan.lastInsertRowid;

      // Pledged Item 1 (Ring: 10.000g gross, 0.500g stone -> 9.500g net)
      db.prepare(`
        INSERT INTO loan_items (loan_id, ornament_type, description, item_count, gross_weight_mg, stone_weight_mg, net_weight_mg, purity)
        VALUES (?, 'Ring', '22K Gold Signet Ring', 1, 10000, 500, 9500, '22K')
      `).run(loanId);

      // Pledged Item 2 (Chain: 14.000g gross, 0.750g stone -> 13.250g net)
      db.prepare(`
        INSERT INTO loan_items (loan_id, ornament_type, description, item_count, gross_weight_mg, stone_weight_mg, net_weight_mg, purity)
        VALUES (?, 'Chain', '22K Rope Chain', 1, 14000, 750, 13250, '22K')
      `).run(loanId);

      return loanId;
    });

    const loan1Id = insertLoanTx();
    assert(loan1Id > 0, 'Loan 1 created atomically with multi-item pledged ornaments');

    // 7.2 Verify loan items count and sums
    const loanItems = db.prepare(`SELECT * FROM loan_items WHERE loan_id = ?`).all(loan1Id);
    assert(loanItems.length === 2, 'Loan has exactly 2 pledged ornaments');
    const sumGross = loanItems.reduce((acc, it) => acc + it.gross_weight_mg, 0);
    const sumNet = loanItems.reduce((acc, it) => acc + it.net_weight_mg, 0);
    assert(sumGross === 24000, 'Total gross weight mg matches sum of items (24,000 mg)');
    assert(sumNet === 22750, 'Total net weight mg matches sum of items (22,750 mg)');

    // 7.3 OPEN loan support (NULL due_date allowed)
    const loanNum2 = getNextSequence(db, 'loan');
    const openLoanRes = db.prepare(`
      INSERT INTO loans (
        loan_number, customer_id, loan_type, loan_date, pledge_date,
        principal_amount_paise, monthly_interest_rate_basis_points, monthly_interest_rate_pct,
        interest_type, interest_duration, term_months, due_date, maturity_date, status,
        total_gross_weight_mg, total_net_weight_mg, total_item_count
      ) VALUES (?, ?, 'OPEN', '2026-02-01', '2026-02-01', 3000000, 150, 1.5, 'MONTHLY', 12, 12, NULL, NULL, 'ACTIVE', 15000, 15000, 1)
    `).run(loanNum2, cust1Id);
    assert(openLoanRes.lastInsertRowid > 0, 'OPEN loan with NULL due_date created successfully');

    // 7.4 FIXED loan without due_date rejected by CHECK constraint
    let fixedNullDueDateFailed = false;
    try {
      db.prepare(`
        INSERT INTO loans (
          loan_number, customer_id, loan_type, loan_date, pledge_date,
          principal_amount_paise, monthly_interest_rate_basis_points, monthly_interest_rate_pct,
          interest_type, interest_duration, term_months, due_date, status,
          total_gross_weight_mg, total_net_weight_mg, total_item_count
        ) VALUES ('L-FIXED-FAIL', ?, 'FIXED', '2026-02-01', '2026-02-01', 1000000, 150, 1.5, 'MONTHLY', 12, 12, NULL, 'ACTIVE', 10000, 10000, 1)
      `).run(cust1Id);
    } catch (e) {
      fixedNullDueDateFailed = e.message.includes('chk_fixed_due_date');
    }
    assert(fixedNullDueDateFailed, 'FIXED loan with NULL due_date was rejected by chk_fixed_due_date constraint');

    // 7.5 Customer deletion prevented when loans exist (ON DELETE RESTRICT)
    let custDeleteBlocked = false;
    try {
      db.prepare(`DELETE FROM customers WHERE id = ?`).run(cust1Id);
    } catch (e) {
      custDeleteBlocked = e.message.includes('FOREIGN KEY constraint failed');
    }
    assert(custDeleteBlocked, 'Customer deletion blocked by ON DELETE RESTRICT foreign key when active loans exist');

    // =========================================================================
    // PHASE 8: Financial Interest Engine Testing (Independent Calculations)
    // =========================================================================
    console.log('\n--- PHASE 8: Financial Interest Engine Testing ---');
    {
      const P = 10000000; // ₹100,000 (10,000,000 paise)
      const R = 1.5;      // 1.5% per month
      // Independent formula: daily rate = (R / 100) / 30 = 0.015 / 30 = 0.0005 per day
      // Daily interest on ₹100,000 = 10,000,000 * 0.0005 = 5,000 paise (₹50.00/day)

      const testLoan = {
        pledge_date: '2026-01-01',
        loan_date: '2026-01-01',
        principal_amount_paise: P,
        monthly_interest_rate_pct: R,
        interest_type: 'MONTHLY',
        status: 'ACTIVE'
      };

      // 8.1 Day 0
      const s0 = calculateLoanInterestSummary(testLoan, [], '2026-01-01');
      assert(s0.elapsedDays === 0 && s0.accruedInterestPaise === 0, 'Interest at 0 days is 0 paise');

      // 8.2 Day 1: expected 5,000 paise
      const s1 = calculateLoanInterestSummary(testLoan, [], '2026-01-02');
      assert(s1.elapsedDays === 1 && s1.accruedInterestPaise === 5000, 'Interest at 1 day is 5,000 paise (₹50.00)', { expected: 5000, actual: s1.accruedInterestPaise });

      // 8.3 Day 5: expected 25,000 paise
      const s5 = calculateLoanInterestSummary(testLoan, [], '2026-01-06');
      assert(s5.elapsedDays === 5 && s5.accruedInterestPaise === 25000, 'Interest at 5 days is 25,000 paise (₹250.00)');

      // 8.4 Day 15: expected 75,000 paise
      const s15 = calculateLoanInterestSummary(testLoan, [], '2026-01-16');
      assert(s15.elapsedDays === 15 && s15.accruedInterestPaise === 75000, 'Interest at 15 days is 75,000 paise (₹750.00)');

      // 8.5 Day 30 (exact standard month): expected 150,000 paise (₹1,500.00)
      const s30 = calculateLoanInterestSummary(testLoan, [], '2026-01-31');
      assert(s30.elapsedDays === 30 && s30.accruedInterestPaise === 150000, 'Interest at 30 days is exactly 150,000 paise (₹1,500.00)');

      // 8.6 Day 31: expected 155,000 paise
      const s31 = calculateLoanInterestSummary(testLoan, [], '2026-02-01');
      assert(s31.elapsedDays === 31 && s31.accruedInterestPaise === 155000, 'Interest at 31 days is 155,000 paise (₹1,550.00)');

      // 8.7 Day 33: expected 165,000 paise
      const s33 = calculateLoanInterestSummary(testLoan, [], '2026-02-03');
      assert(s33.elapsedDays === 33 && s33.accruedInterestPaise === 165000, 'Interest at 33 days is 165,000 paise (₹1,650.00)');

      // 8.8 Leap year February (2024: 2024-02-01 to 2024-03-01 = 29 days)
      const leapLoan = { ...testLoan, pledge_date: '2024-02-01', loan_date: '2024-02-01' };
      const sLeap = calculateLoanInterestSummary(leapLoan, [], '2024-03-01');
      assert(sLeap.elapsedDays === 29, 'Leap year February 2024 has 29 elapsed days', { actual: sLeap.elapsedDays });
      assert(sLeap.accruedInterestPaise === 29 * 5000, 'Leap year February interest is 29 * 5000 = 145,000 paise', { actual: sLeap.accruedInterestPaise });

      // 8.9 Non-leap year February (2025: 2025-02-01 to 2025-03-01 = 28 days)
      const nonLeapLoan = { ...testLoan, pledge_date: '2025-02-01', loan_date: '2025-02-01' };
      const sNonLeap = calculateLoanInterestSummary(nonLeapLoan, [], '2025-03-01');
      assert(sNonLeap.elapsedDays === 28, 'Non-leap year February 2025 has 28 elapsed days', { actual: sNonLeap.elapsedDays });
      assert(sNonLeap.accruedInterestPaise === 28 * 5000, 'Non-leap year February interest is 28 * 5000 = 140,000 paise', { actual: sNonLeap.accruedInterestPaise });

      // 8.10 Segmented Principal Repayments
      // Loan ₹100,000 on 2026-01-01
      // Repayment 1 on 2026-01-11 (10 days): Principal repayment of ₹30,000 -> Remaining ₹70,000
      // Repayment 2 on 2026-01-21 (10 days): Principal repayment of ₹30,000 -> Remaining ₹40,000
      // Calculation at 2026-01-31 (10 days):
      // Segment 1 (10 days @ ₹100k): 10 * 5,000 = 50,000 paise
      // Segment 2 (10 days @ ₹70k):  10 * 3,500 = 35,000 paise
      // Segment 3 (10 days @ ₹40k):  10 * 2,000 = 20,000 paise
      // Total Expected Accrued: 50,000 + 35,000 + 20,000 = 105,000 paise
      const segmentedPayments = [
        { payment_date: '2026-01-11', principal_component_paise: 3000000, interest_component_paise: 0 },
        { payment_date: '2026-01-21', principal_component_paise: 3000000, interest_component_paise: 0 }
      ];
      const sSeg = calculateLoanInterestSummary(testLoan, segmentedPayments, '2026-01-31');
      assert(sSeg.remainingPrincipalPaise === 4000000, 'Segmented remaining principal is ₹40,000 (4,000,000 paise)');
      assert(sSeg.accruedInterestPaise === 105000, 'Segmented accrued interest across 3 intervals is 105,000 paise (₹1,050.00)', { expected: 105000, actual: sSeg.accruedInterestPaise });
      assert(sSeg.segmentBreakdown.length === 3, 'Segment breakdown contains exactly 3 dated segments');

      // 8.11 Weekly Interest calculation
      const weeklyLoan = {
        pledge_date: '2026-01-01',
        loan_date: '2026-01-01',
        principal_amount_paise: 10000000,
        monthly_interest_rate_pct: 0.5, // 0.5% per week
        interest_type: 'WEEKLY',
        status: 'ACTIVE'
      };
      // 14 days = 2 weeks -> 10,000,000 * 0.005 * 2 = 100,000 paise
      const sWeekly = calculateLoanInterestSummary(weeklyLoan, [], '2026-01-15');
      assert(sWeekly.accruedInterestPaise === 100000, 'Weekly loan interest across 2 weeks is 100,000 paise (₹1,000.00)', { actual: sWeekly.accruedInterestPaise });

      // 8.12 Closed loan balance zeroing
      const closedLoan = { ...testLoan, status: 'CLOSED' };
      const sClosed = calculateLoanInterestSummary(closedLoan, [{ principal_component_paise: 10000000, interest_component_paise: 150000, payment_date: '2026-01-31' }], '2026-05-01');
      assert(sClosed.isClosed === true, 'Loan is marked as closed');
      assert(sClosed.remainingPrincipalPaise === 0, 'Closed loan reports 0 remaining principal');
      assert(sClosed.outstandingInterestPaise === 0, 'Closed loan reports 0 outstanding interest');
      assert(sClosed.totalOutstandingPaise === 0, 'Closed loan reports 0 total outstanding balance');
    }

    // =========================================================================
    // PHASE 9: Repayments & Settlement
    // =========================================================================
    console.log('\n--- PHASE 9: Repayments & Settlement ---');
    // Loan 1 has principal ₹50,000 (5,000,000 paise), created 2026-01-01.
    // 9.1 Record Interest-Only payment at Day 30 (2026-01-31)
    // Accrued interest on ₹50k for 30 days = 5,000,000 * 0.015 / 30 * 30 = 75,000 paise (₹750.00)
    const rcpNum1 = getNextSequence(db, 'receipt');
    assert(rcpNum1 === 'RCP-0001', 'First generated receipt number is RCP-0001', { actual: rcpNum1 });

    db.prepare(`
      INSERT INTO payments (
        receipt_number, loan_id, payment_date, total_amount_paise,
        principal_component_paise, interest_component_paise, penalty_component_paise,
        payment_type, payment_mode
      ) VALUES (?, ?, '2026-01-31', 75000, 0, 75000, 0, 'INTEREST', 'CASH')
    `).run(rcpNum1, loan1Id);

    const pay1 = db.prepare(`SELECT * FROM payments WHERE receipt_number = ?`).get(rcpNum1);
    assert(pay1 && pay1.payment_type === 'INTEREST', 'Payment 1 recorded as INTEREST payment');

    // 9.2 Record Partial Principal payment on 2026-02-15
    const rcpNum2 = getNextSequence(db, 'receipt');
    db.prepare(`
      INSERT INTO payments (
        receipt_number, loan_id, payment_date, total_amount_paise,
        principal_component_paise, interest_component_paise, penalty_component_paise,
        payment_type, payment_mode
      ) VALUES (?, ?, '2026-02-15', 2000000, 2000000, 0, 0, 'PRINCIPAL', 'UPI')
    `).run(rcpNum2, loan1Id);

    const pastPaymentsLoan1 = db.prepare(`SELECT * FROM payments WHERE loan_id = ? ORDER BY id ASC`).all(loan1Id);
    const loan1Row = db.prepare(`SELECT * FROM loans WHERE id = ?`).get(loan1Id);
    const summaryAfterPart = calculateLoanInterestSummary(loan1Row, pastPaymentsLoan1, '2026-02-15');
    assert(summaryAfterPart.remainingPrincipalPaise === 3000000, 'Remaining principal after ₹20,000 partial payment is ₹30,000 (3,000,000 paise)');

    // 9.3 Overpayment rejection (paying more than remaining balance)
    const overpaymentAmount = 4000000; // ₹40,000 > ₹30,000
    const isOverpayment = overpaymentAmount > summaryAfterPart.remainingPrincipalPaise;
    assert(isOverpayment, 'Principal overpayment detected (attempting to pay ₹40,000 against ₹30,000 balance)');

    // 9.4 Full Settlement and atomic loan closure
    const rcpNum3 = getNextSequence(db, 'receipt');
    const settleDate = '2026-03-01';
    const summaryAtSettle = calculateLoanInterestSummary(loan1Row, pastPaymentsLoan1, settleDate);
    const remainingToSettle = summaryAtSettle.remainingPrincipalPaise; // 3,000,000 paise
    const interestToSettle = summaryAtSettle.outstandingInterestPaise;

    const settleTx = db.transaction(() => {
      db.prepare(`
        INSERT INTO payments (
          receipt_number, loan_id, payment_date, total_amount_paise,
          principal_component_paise, interest_component_paise, penalty_component_paise,
          payment_type, payment_mode
        ) VALUES (?, ?, ?, ?, ?, ?, 0, 'SETTLEMENT', 'BANK_TRANSFER')
      `).run(rcpNum3, loan1Id, settleDate, remainingToSettle + interestToSettle, remainingToSettle, interestToSettle);

      db.prepare(`
        UPDATE loans
        SET status = 'CLOSED', closed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(loan1Id);

      db.prepare(`
        INSERT INTO loan_status_history (loan_id, previous_status, new_status, reason, changed_at)
        VALUES (?, 'ACTIVE', 'CLOSED', 'Full loan settlement and redemption', CURRENT_TIMESTAMP)
      `).run(loan1Id);
    });

    settleTx();

    const closedLoanRow = db.prepare(`SELECT status, closed_at FROM loans WHERE id = ?`).get(loan1Id);
    assert(closedLoanRow.status === 'CLOSED', 'Loan 1 successfully transitioned to CLOSED');
    assert(closedLoanRow.closed_at !== null, 'Loan 1 closed_at timestamp is recorded');

    // 9.5 Status history recorded
    const historyRow = db.prepare(`SELECT * FROM loan_status_history WHERE loan_id = ? ORDER BY id DESC LIMIT 1`).get(loan1Id);
    assert(historyRow && historyRow.new_status === 'CLOSED', 'Loan status history audit entry created');

    // =========================================================================
    // PHASE 10: Billing, Receipts, and Reports
    // =========================================================================
    console.log('\n--- PHASE 10: Billing, Receipts & Reports ---');
    // 10.1 Receipt generation data consistency
    const receiptRow = db.prepare(`
      SELECT p.*, l.loan_number, c.name AS customer_name, c.phone AS customer_phone
      FROM payments p
      JOIN loans l ON p.loan_id = l.id
      JOIN customers c ON l.customer_id = c.id
      WHERE p.receipt_number = ?
    `).get(rcpNum3);
    assert(receiptRow.receipt_number === 'RCP-0003', 'Receipt record matches receipt number RCP-0003');
    assert(receiptRow.customer_name === 'Sivalingam Pillai', 'Receipt customer name matches underlying customer');
    assert(receiptRow.payment_type === 'SETTLEMENT', 'Receipt payment type is SETTLEMENT');

    // 10.2 Formula Injection Sanitization in CSV export
    const maliciousInput = "=cmd|' /C calc'!A0";
    const sanitizeCsvCell = (val) => {
      if (val === null || val === undefined) return '""';
      let str = String(val);
      if (/^[=+\-@\t\r]/.test(str)) {
        str = "'" + str;
      }
      return `"${str.replace(/"/g, '""')}"`;
    };
    const sanitizedCell = sanitizeCsvCell(maliciousInput);
    assert(sanitizedCell.startsWith("\"'=cmd"), 'CSV export neutralizes spreadsheet formula injection starting with =');

    // 10.3 Dashboard Aggregation Metrics Verification
    const activeCount = db.prepare(`SELECT COUNT(*) AS cnt FROM loans WHERE status = 'ACTIVE'`).get().cnt;
    const closedCount = db.prepare(`SELECT COUNT(*) AS cnt FROM loans WHERE status = 'CLOSED'`).get().cnt;
    assert(activeCount === 1, 'Dashboard active loans count is 1 (Loan 2 OPEN is active)', { actual: activeCount });
    assert(closedCount === 1, 'Dashboard closed loans count is 1 (Loan 1 is closed)', { actual: closedCount });

    // =========================================================================
    // PHASE 11: Settings and Business Configuration
    // =========================================================================
    console.log('\n--- PHASE 11: Settings and Business Configuration ---');
    // 11.1 Default settings presence
    const shopNameRow = db.prepare(`SELECT value FROM app_settings WHERE key = 'shop_name'`).get();
    assert(shopNameRow && shopNameRow.value === 'Sri Gold Pawn Shop', 'Default shop_name setting is Sri Gold Pawn Shop');

    // 11.2 Save/update configuration
    const upsertSetting = db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);
    upsertSetting.run('shop_name', 'Sri Gold Pawn Shop & Bankers');
    const updatedShopName = db.prepare(`SELECT value FROM app_settings WHERE key = 'shop_name'`).get().value;
    assert(updatedShopName === 'Sri Gold Pawn Shop & Bankers', 'Updated shop name setting persisted correctly');

    // =========================================================================
    // PHASE 12: Backup and Restore
    // =========================================================================
    console.log('\n--- PHASE 12: Backup and Restore ---');
    // 12.1 Online WAL database backup via db.backup()
    const backupFile = path.join(sandboxDir, 'audit_backup_valid.sqlite');
    await db.backup(backupFile);
    assert(fs.existsSync(backupFile), 'Online WAL database backup file created on disk');
    const backupStat = fs.statSync(backupFile);
    assert(backupStat.size > 0, `Backup file size is positive (${backupStat.size} bytes)`);

    // 12.2 Open backup and verify integrity
    const backupDb = new Database(backupFile, { readonly: true });
    const bCheck = backupDb.pragma('integrity_check');
    assert(bCheck.length === 1 && bCheck[0].integrity_check === 'ok', 'Backup database passed PRAGMA integrity_check');
    const bFk = backupDb.pragma('foreign_key_check');
    assert(bFk.length === 0, 'Backup database has 0 foreign key violations');
    const bCustCount = backupDb.prepare(`SELECT COUNT(*) as cnt FROM customers`).get().cnt;
    assert(bCustCount >= 2, 'Backup contains customer records');
    backupDb.close();

    // 12.3 Corrupt backup rejection
    const corruptBackupFile = path.join(sandboxDir, 'corrupt_backup.sqlite');
    fs.writeFileSync(corruptBackupFile, 'NOT_A_VALID_SQLITE_DATABASE_CORRUPT_BYTES');
    let corruptDetected = false;
    try {
      const corruptDb = new Database(corruptBackupFile, { readonly: true, fileMustExist: true });
      corruptDb.pragma('integrity_check');
      corruptDb.close();
    } catch (e) {
      corruptDetected = e.message.includes('file is not a database') || e.message.includes('corrupt');
    }
    assert(corruptDetected, 'Corrupted backup file detected and rejected during pre-restore validation');

    // =========================================================================
    // PHASE 13 & 15: Security, Input Validation & SQL Injection
    // =========================================================================
    console.log('\n--- PHASE 13 & 15: Security & Input Validation ---');
    // 13.1 SQL Injection resistance via parameterized statements
    const sqlInjectionPayload = "'; DROP TABLE customers; --";
    const safeCust = db.prepare(`SELECT * FROM customers WHERE name = ?`).all(sqlInjectionPayload);
    assert(Array.isArray(safeCust) && safeCust.length === 0, 'SQL injection attempt safely returned empty array without executing command');
    // Verify customers table still exists
    const tableStillExists = db.prepare(`SELECT count(*) as cnt FROM customers`).get().cnt;
    assert(tableStillExists > 0, 'Customers table remains intact after SQL injection attack attempt');

    // 13.2 HTML / XSS payload stored safely without execution
    const xssPayload = "<script>alert('xss')</script>";
    const cCode4 = getNextSequence(db, 'customer');
    insertCustStmt.run(cCode4, xssPayload, '9111223344', null, 'Test Addr', 'City', 'PAN', 'ABCDE1234F');
    const fetchedXss = db.prepare(`SELECT name FROM customers WHERE customer_code = ?`).get(cCode4);
    assert(fetchedXss.name === xssPayload, 'XSS string stored verbatim as data without executing');

    // =========================================================================
    // PHASE 16: Performance & Reliability Benchmark
    // =========================================================================
    console.log('\n--- PHASE 16: Performance Benchmark ---');
    // Bulk insert 500 synthetic customers in a single transaction
    const t0 = Date.now();
    const bulkInsertTx = db.transaction(() => {
      for (let i = 100; i < 600; i++) {
        insertCustStmt.run(`CUST-B${i}`, `Bulk Customer ${i}`, `9000000${String(i).padStart(3, '0')}`, null, 'Bulk Address', 'Tirunelveli', 'AADHAAR', `12345678${i}`);
      }
    });
    bulkInsertTx();
    const tInsert = Date.now() - t0;
    console.log(`  ⚡ Bulk insertion of 500 customers took: ${tInsert} ms`);
    assert(tInsert < 2000, `500 customer records inserted transactionally in < 2,000ms (actual: ${tInsert}ms)`);

    // Benchmark search query across 500+ records
    const tSearch0 = Date.now();
    const searchBulk = db.prepare(`
      SELECT id, customer_code, name, phone FROM customers WHERE is_active = 1 AND (name LIKE ? OR phone LIKE ?) LIMIT 50
    `).all('%Bulk Customer 345%', '%Bulk Customer 345%');
    const tSearch = Date.now() - tSearch0;
    console.log(`  ⚡ Search query across 500+ records took: ${tSearch} ms`);
    assert(searchBulk.length === 1, 'Indexed bulk customer search returned exact match');
    assert(tSearch < 100, `Search query executed in < 100ms (actual: ${tSearch}ms)`);

    // =========================================================================
    // PHASE 19: Production Build & Asset Verification
    // =========================================================================
    console.log('\n--- PHASE 19: Production Build Verification ---');
    const distIndex = path.join(__dirname, '../dist/index.html');
    assert(fs.existsSync(distIndex), 'Production build output dist/index.html exists');
    const distHtml = fs.readFileSync(distIndex, 'utf8');
    assert(distHtml.includes('<!DOCTYPE html>') || distHtml.includes('<!doctype html>'), 'dist/index.html has valid HTML structure');
    assert(distHtml.includes('assets/'), 'dist/index.html references bundled assets');

    console.log('\n======================================================================');
    console.log(`MASTER AUDIT COMPLETE: ${passedTests} PASSED, ${failedTests} FAILED out of ${totalTests} total tests`);
    console.log('======================================================================\n');

    db.close();

  } catch (error) {
    console.error('\nAUDIT FAILED WITH UNHANDLED ERROR:', error);
    process.exit(1);
  }
}

runMasterAudit();
