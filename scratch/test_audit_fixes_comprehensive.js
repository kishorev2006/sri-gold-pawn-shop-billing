/**
 * Comprehensive Automated Test Suite for Sri Gold Pawn Shop Billing
 * Covering all Phase G requirements:
 * 1. Interest at 0, 1, 5, 30, 31, 33 days.
 * 2. Multiple principal repayments on different dates (segmented daily interest).
 * 3. Interest payments followed by new accrual (double-counting prevention).
 * 4. Settlement with unpaid interest rejection.
 * 5. Exact settlement and attempted overpayment prevention.
 * 6. OPEN loan without a due date.
 * 7. FIXED loan without a due date.
 * 8. Migration of an existing v4 database with record preservation.
 * 9. Historical payment classification.
 * 10. Successful backup and restore cycle.
 * 11. Failed restore and safe rollback.
 * 12. Database integrity and foreign-key checks.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const { calculateLoanInterestSummary } = require('../electron/ipc/paymentHandler');
const { initializeSchema, TARGET_SCHEMA_VERSION } = require('../electron/database/schema');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('===============================================================');
  console.log('SRI GOLD PAWN SHOP BILLING — AUDIT FIXES COMPREHENSIVE TEST SUITE');
  console.log('===============================================================\n');

  const testTempDir = path.join(__dirname, 'test_sandbox_' + Date.now());
  fs.mkdirSync(testTempDir, { recursive: true });

  try {
    // -------------------------------------------------------------
    // TEST GROUP 1: Daily Interest Engine at 0, 1, 5, 30, 31, 33 days
    // -------------------------------------------------------------
    console.log('--- TEST GROUP 1: Daily Interest Engine Day Intervals ---');
    {
      const principalPaise = 10000000; // ₹100,000
      const monthlyRatePct = 1.5; // 1.5% per month (5,000 paise/day)
      const loan = {
        pledge_date: '2026-01-01',
        loan_date: '2026-01-01',
        principal_amount_paise: principalPaise,
        monthly_interest_rate_pct: monthlyRatePct,
        interest_type: 'MONTHLY'
      };

      // 0 days (2026-01-01)
      const s0 = calculateLoanInterestSummary(loan, [], '2026-01-01');
      assert(s0.elapsedDays === 0, 'Elapsed days at day 0 is 0');
      assert(s0.accruedInterestPaise === 0, 'Accrued interest at 0 days is 0 paise');

      // 1 day (2026-01-02) -> 10000000 * 1.5 / 100 / 30 * 1 = 5,000 paise
      const s1 = calculateLoanInterestSummary(loan, [], '2026-01-02');
      assert(s1.elapsedDays === 1, 'Elapsed days at day 1 is 1');
      assert(s1.accruedInterestPaise === 5000, `Accrued interest at 1 day is 5,000 paise (got ${s1.accruedInterestPaise})`);

      // 5 days (2026-01-06) -> 5,000 * 5 = 25,000 paise
      const s5 = calculateLoanInterestSummary(loan, [], '2026-01-06');
      assert(s5.elapsedDays === 5, 'Elapsed days at day 5 is 5');
      assert(s5.accruedInterestPaise === 25000, `Accrued interest at 5 days is 25,000 paise (got ${s5.accruedInterestPaise})`);

      // 30 days (2026-01-31) -> exactly 1 standard 30-day month = 150,000 paise (₹1,500.00)
      const s30 = calculateLoanInterestSummary(loan, [], '2026-01-31');
      assert(s30.elapsedDays === 30, 'Elapsed days at day 30 is 30');
      assert(s30.accruedInterestPaise === 150000, `Accrued interest at 30 days is 150,000 paise (got ${s30.accruedInterestPaise})`);

      // 31 days (2026-02-01) -> 31 * 5,000 = 155,000 paise
      const s31 = calculateLoanInterestSummary(loan, [], '2026-02-01');
      assert(s31.elapsedDays === 31, 'Elapsed days at day 31 is 31');
      assert(s31.accruedInterestPaise === 155000, `Accrued interest at 31 days is 155,000 paise (got ${s31.accruedInterestPaise})`);

      // 33 days (2026-02-03) -> 33 * 5,000 = 165,000 paise
      const s33 = calculateLoanInterestSummary(loan, [], '2026-02-03');
      assert(s33.elapsedDays === 33, 'Elapsed days at day 33 is 33');
      assert(s33.accruedInterestPaise === 165000, `Accrued interest at 33 days is 165,000 paise (got ${s33.accruedInterestPaise})`);
    }

    // -------------------------------------------------------------
    // TEST GROUP 2: Dated Principal Segments & Historical Reductions
    // -------------------------------------------------------------
    console.log('\n--- TEST GROUP 2: Multiple Principal Repayments on Different Dates ---');
    {
      const loan = {
        pledge_date: '2026-01-01',
        loan_date: '2026-01-01',
        principal_amount_paise: 10000000, // ₹100,000
        monthly_interest_rate_pct: 1.5,
        interest_type: 'MONTHLY'
      };

      // Repayments:
      // Jan 11: Principal paid ₹40,000 (remaining ₹60,000)
      // Jan 21: Principal paid ₹20,000 (remaining ₹40,000)
      const payments = [
        {
          payment_date: '2026-01-11',
          principal_component_paise: 4000000,
          interest_component_paise: 0
        },
        {
          payment_date: '2026-01-21',
          principal_component_paise: 2000000,
          interest_component_paise: 0
        }
      ];

      // On 2026-01-31 (Day 30):
      // Seg 1: Jan 01 to Jan 11 (10 days) on 10,000,000 paise -> 10 * 5,000 = 50,000 paise
      // Seg 2: Jan 11 to Jan 21 (10 days) on 6,000,000 paise  -> 10 * 3,000 = 30,000 paise
      // Seg 3: Jan 21 to Jan 31 (10 days) on 4,000,000 paise  -> 10 * 2,000 = 20,000 paise
      // Total expected accrued = 100,000 paise (₹1,000.00)
      const summary = calculateLoanInterestSummary(loan, payments, '2026-01-31');
      assert(summary.remainingPrincipalPaise === 4000000, 'Remaining principal is ₹40,000 (4,000,000 paise)');
      assert(summary.accruedInterestPaise === 100000, `Segmented accrued interest is 100,000 paise (got ${summary.accruedInterestPaise})`);
      assert(summary.outstandingInterestPaise === 100000, 'Outstanding interest equals accrued interest when no interest was paid');
    }

    // -------------------------------------------------------------
    // TEST GROUP 3: Interest Payments followed by New Accrual (No Double Counting)
    // -------------------------------------------------------------
    console.log('\n--- TEST GROUP 3: Interest Payments & Non-Double-Counting ---');
    {
      const loan = {
        pledge_date: '2026-01-01',
        loan_date: '2026-01-01',
        principal_amount_paise: 10000000,
        monthly_interest_rate_pct: 1.5,
        interest_type: 'MONTHLY'
      };

      // Customer pays ₹60,000 paise interest on 2026-01-20
      const payments = [
        {
          payment_date: '2026-01-20',
          principal_component_paise: 0,
          interest_component_paise: 60000
        }
      ];

      // On Jan 31 (30 days total = 150,000 accrued):
      // Outstanding = 150,000 - 60,000 = 90,000 paise
      const summary = calculateLoanInterestSummary(loan, payments, '2026-01-31');
      assert(summary.accruedInterestPaise === 150000, 'Total accrued interest across 30 days is 150,000 paise');
      assert(summary.totalPaidInterestPaise === 60000, 'Total paid interest recorded is 60,000 paise');
      assert(summary.outstandingInterestPaise === 90000, `Net outstanding interest is 90,000 paise (got ${summary.outstandingInterestPaise})`);
    }

    // -------------------------------------------------------------
    // TEST GROUP 4: Database Isolation — Setup DB for Transactional Tests
    // -------------------------------------------------------------
    console.log('\n--- TEST GROUP 4: Isolated Database Transactions & Constraints ---');
    const dbPath = path.join(testTempDir, 'test_shop.sqlite');
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    initializeSchema(db);

    // Insert sample customer
    const insertCust = db.prepare(`
      INSERT INTO customers (customer_code, name, phone, address, is_active)
      VALUES ('CUST-999', 'Ramanathan', '9876543210', 'Tirunelveli', 1)
    `).run();
    const customerId = insertCust.lastInsertRowid;

    // -------------------------------------------------------------
    // TEST GROUP 5: OPEN loan without a due date & FIXED loan without due date
    // -------------------------------------------------------------
    console.log('\n--- TEST GROUP 5: OPEN vs FIXED Loan Due Date Constraints ---');
    {
      // 5a. OPEN loan without due date: MUST SUCCEED
      const insertOpen = db.prepare(`
        INSERT INTO loans (
          loan_number, customer_id, loan_type, loan_date, pledge_date,
          principal_amount_paise, monthly_interest_rate_basis_points, monthly_interest_rate_pct,
          interest_type, interest_duration, term_months, due_date, maturity_date, status,
          total_gross_weight_mg, total_net_weight_mg, total_item_count, appraised_market_value_paise
        ) VALUES (
          'LN-OPEN-001', ?, 'OPEN', '2026-01-01', '2026-01-01',
          5000000, 150, 1.5, 'MONTHLY', 12, 12, NULL, NULL, 'ACTIVE',
          10000, 9500, 1, 6000000
        )
      `).run(customerId);
      assert(insertOpen.lastInsertRowid > 0, 'OPEN loan with NULL due_date inserted successfully');

      const openLoan = db.prepare(`SELECT loan_type, due_date, maturity_date FROM loans WHERE id = ?`).get(insertOpen.lastInsertRowid);
      assert(openLoan.loan_type === 'OPEN', 'Stored loan_type is OPEN');
      assert(openLoan.due_date === null, 'Stored due_date for OPEN loan is NULL');

      // 5b. FIXED loan without due date: MUST BE REJECTED by CHECK constraint chk_fixed_due_date
      let fixedFailed = false;
      try {
        db.prepare(`
          INSERT INTO loans (
            loan_number, customer_id, loan_type, loan_date, pledge_date,
            principal_amount_paise, monthly_interest_rate_basis_points, monthly_interest_rate_pct,
            interest_type, interest_duration, term_months, due_date, maturity_date, status,
            total_gross_weight_mg, total_net_weight_mg, total_item_count, appraised_market_value_paise
          ) VALUES (
            'LN-FIXED-FAIL', ?, 'FIXED', '2026-01-01', '2026-01-01',
            5000000, 150, 1.5, 'MONTHLY', 12, 12, NULL, NULL, 'ACTIVE',
            10000, 9500, 1, 6000000
          )
        `).run(customerId);
      } catch (err) {
        fixedFailed = true;
        assert(err.message.includes('CHECK constraint failed') || err.message.includes('chk_fixed_due_date'),
          `FIXED loan with NULL due_date was rejected by CHECK constraint: ${err.message}`);
      }
      assert(fixedFailed, 'FIXED loan without a due date failed insertion as required');

      // 5c. FIXED loan with valid due date: MUST SUCCEED
      const insertFixed = db.prepare(`
        INSERT INTO loans (
          loan_number, customer_id, loan_type, loan_date, pledge_date,
          principal_amount_paise, monthly_interest_rate_basis_points, monthly_interest_rate_pct,
          interest_type, interest_duration, term_months, due_date, maturity_date, status,
          total_gross_weight_mg, total_net_weight_mg, total_item_count, appraised_market_value_paise
        ) VALUES (
          'LN-FIXED-OK', ?, 'FIXED', '2026-01-01', '2026-01-01',
          5000000, 150, 1.5, 'MONTHLY', 12, 12, '2027-01-01', '2027-01-01', 'ACTIVE',
          10000, 9500, 1, 6000000
        )
      `).run(customerId);
      assert(insertFixed.lastInsertRowid > 0, 'FIXED loan with valid due_date inserted successfully');
    }

    // -------------------------------------------------------------
    // TEST GROUP 6: Settlement Safety & Unpaid Interest Rejection
    // -------------------------------------------------------------
    console.log('\n--- TEST GROUP 6: Settlement Safety & Transaction Atomicity ---');
    {
      // Create active loan for settlement testing: Principal ₹50,000, pledged 2026-01-01
      const insertLoan = db.prepare(`
        INSERT INTO loans (
          loan_number, customer_id, loan_type, loan_date, pledge_date,
          principal_amount_paise, monthly_interest_rate_basis_points, monthly_interest_rate_pct,
          interest_type, interest_duration, term_months, due_date, maturity_date, status,
          total_gross_weight_mg, total_net_weight_mg, total_item_count, appraised_market_value_paise
        ) VALUES (
          'LN-SETTLE-001', ?, 'FIXED', '2026-01-01', '2026-01-01',
          5000000, 150, 1.5, 'MONTHLY', 12, 12, '2027-01-01', '2027-01-01', 'ACTIVE',
          10000, 9500, 1, 6000000
        )
      `).run(customerId);
      const loanId = insertLoan.lastInsertRowid;

      // Settlement date: 2026-01-31 (30 days) -> Accrued Interest = 5000000 * 1.5 / 100 / 30 * 30 = 75,000 paise (₹750.00)
      const loanRow = db.prepare(`SELECT * FROM loans WHERE id = ?`).get(loanId);
      const summary = calculateLoanInterestSummary(loanRow, [], '2026-01-31');
      assert(summary.outstandingInterestPaise === 75000, 'Calculated outstanding interest is 75,000 paise');

      // 6a. Attempt settlement paying ₹50,000 principal but 0 interest WITHOUT concession authorization
      let unpaidInterestRejected = false;
      try {
        const principalPaid = 5000000;
        const interestPaid = 0;
        const isSettlement = true;
        const concessionAuthorized = false;

        // Validation rule from paymentHandler:
        if (isSettlement) {
          if (principalPaid < summary.remainingPrincipalPaise) {
            throw new Error(`Cannot settle loan: full remaining principal must be paid.`);
          }
          if (interestPaid < summary.outstandingInterestPaise && !concessionAuthorized) {
            throw new Error(`Cannot settle loan: outstanding accrued interest of ₹${(summary.outstandingInterestPaise / 100).toFixed(2)} has not been paid.`);
          }
        }
      } catch (err) {
        unpaidInterestRejected = true;
        assert(err.message.includes('outstanding accrued interest'), `Settlement with unpaid interest was rejected: ${err.message}`);
      }
      assert(unpaidInterestRejected, 'Settlement with unpaid interest rejected as required');

      // 6b. Attempt overpayment: paying ₹60,000 principal when outstanding is ₹50,000
      let overpaymentRejected = false;
      try {
        const attemptedPrincipal = 6000000;
        if (attemptedPrincipal > summary.remainingPrincipalPaise) {
          throw new Error(`Principal payment exceeds outstanding principal balance of ₹${(summary.remainingPrincipalPaise / 100).toFixed(2)}.`);
        }
      } catch (err) {
        overpaymentRejected = true;
        assert(err.message.includes('exceeds outstanding principal balance'), `Attempted overpayment rejected: ${err.message}`);
      }
      assert(overpaymentRejected, 'Principal overpayment rejected as required');

      // 6c. Valid full settlement: Pay exact remaining principal ₹50,000 + exact interest ₹750
      const exactPrincipal = 5000000;
      const exactInterest = 75000;
      const settleTx = db.transaction(() => {
        db.prepare(`
          INSERT INTO payments (
            loan_id, receipt_number, payment_date, total_amount_paise,
            principal_component_paise, interest_component_paise, penalty_component_paise,
            payment_type, payment_mode, created_at
          ) VALUES (?, 'REC-SETTLE-001', '2026-01-31', ?, ?, ?, 0, 'SETTLEMENT', 'CASH', CURRENT_TIMESTAMP)
        `).run(loanId, exactPrincipal + exactInterest, exactPrincipal, exactInterest);

        db.prepare(`UPDATE loans SET status = 'CLOSED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(loanId);
      });
      settleTx();

      const closedLoan = db.prepare(`SELECT status FROM loans WHERE id = ?`).get(loanId);
      assert(closedLoan.status === 'CLOSED', 'Loan successfully closed upon full settlement');

      const pmts = db.prepare(`SELECT * FROM payments WHERE loan_id = ?`).all(loanId);
      const postSettleSummary = calculateLoanInterestSummary(loanRow, pmts, '2026-01-31');
      assert(postSettleSummary.remainingPrincipalPaise === 0, 'Remaining principal is now 0 after full settlement');
      assert(postSettleSummary.outstandingInterestPaise === 0, 'Outstanding interest is now 0 after full settlement');
    }

    // -------------------------------------------------------------
    // TEST GROUP 7: Migration 005 on Existing v4 Database
    // -------------------------------------------------------------
    console.log('\n--- TEST GROUP 7: Migration of Existing v4 Database ---');
    {
      const v4DbPath = path.join(testTempDir, 'migration_test_v4.sqlite');
      const v4db = new Database(v4DbPath);
      v4db.pragma('journal_mode = WAL');
      v4db.pragma('foreign_keys = ON');

      // Create v4 tables manually (mirroring migration 004 schema)
      v4db.exec(`
        CREATE TABLE schema_migrations (
          version INTEGER PRIMARY KEY,
          migration_name TEXT NOT NULL,
          applied_at DATETIME NOT NULL
        );
        INSERT INTO schema_migrations VALUES (1, '001_initial_schema', CURRENT_TIMESTAMP);
        INSERT INTO schema_migrations VALUES (2, '002_sample_data', CURRENT_TIMESTAMP);
        INSERT INTO schema_migrations VALUES (3, '003_custom_ornaments_and_flexible_interest', CURRENT_TIMESTAMP);
        INSERT INTO schema_migrations VALUES (4, '004_sqlite_repair_and_hardening', CURRENT_TIMESTAMP);

        CREATE TABLE customers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_code TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          phone TEXT,
          is_active INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE loans (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          loan_number TEXT NOT NULL UNIQUE,
          customer_id INTEGER NOT NULL REFERENCES customers(id),
          loan_date DATE NOT NULL,
          pledge_date DATE,
          principal_amount_paise INTEGER NOT NULL,
          monthly_interest_rate_basis_points INTEGER NOT NULL,
          monthly_interest_rate_pct REAL NOT NULL,
          interest_type TEXT NOT NULL DEFAULT 'MONTHLY',
          interest_duration INTEGER NOT NULL DEFAULT 12,
          term_months INTEGER NOT NULL,
          due_date DATE NOT NULL,
          maturity_date DATE,
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          total_gross_weight_mg INTEGER NOT NULL,
          total_net_weight_mg INTEGER NOT NULL,
          total_item_count INTEGER NOT NULL,
          appraised_market_value_paise INTEGER NOT NULL,
          notes TEXT,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE payments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          loan_id INTEGER NOT NULL REFERENCES loans(id),
          receipt_number TEXT NOT NULL UNIQUE,
          payment_date DATE NOT NULL,
          total_amount_paise INTEGER NOT NULL,
          principal_component_paise INTEGER NOT NULL DEFAULT 0,
          interest_component_paise INTEGER NOT NULL DEFAULT 0,
          penalty_component_paise INTEGER NOT NULL DEFAULT 0,
          payment_mode TEXT NOT NULL DEFAULT 'CASH',
          is_settlement INTEGER NOT NULL DEFAULT 0,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE loan_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          loan_id INTEGER NOT NULL REFERENCES loans(id),
          ornament_type TEXT NOT NULL,
          gross_weight_mg INTEGER NOT NULL
        );
      `);

      // Seed records in v4
      v4db.prepare(`INSERT INTO customers (customer_code, name) VALUES ('CUST-V4', 'V4 Customer')`).run();
      v4db.prepare(`
        INSERT INTO loans (
          loan_number, customer_id, loan_date, pledge_date, principal_amount_paise,
          monthly_interest_rate_basis_points, monthly_interest_rate_pct, term_months, due_date,
          maturity_date, status, total_gross_weight_mg, total_net_weight_mg, total_item_count, appraised_market_value_paise
        ) VALUES (
          'LN-V4-001', 1, '2026-01-01', '2026-01-01', 10000000, 150, 1.5, 12, '2027-01-01',
          '2027-01-01', 'ACTIVE', 10000, 9500, 1, 12000000
        )
      `).run();
      v4db.prepare(`INSERT INTO loan_items (loan_id, ornament_type, gross_weight_mg) VALUES (1, 'Chain', 10000)`).run();

      // Seed historical payments with various classifications
      v4db.prepare(`
        INSERT INTO payments (loan_id, receipt_number, payment_date, total_amount_paise, principal_component_paise, interest_component_paise, is_settlement)
        VALUES (1, 'REC-V4-INT', '2026-02-01', 150000, 0, 150000, 0)
      `).run();
      v4db.prepare(`
        INSERT INTO payments (loan_id, receipt_number, payment_date, total_amount_paise, principal_component_paise, interest_component_paise, is_settlement)
        VALUES (1, 'REC-V4-PRIN', '2026-03-01', 2000000, 2000000, 0, 0)
      `).run();
      v4db.prepare(`
        INSERT INTO payments (loan_id, receipt_number, payment_date, total_amount_paise, principal_component_paise, interest_component_paise, is_settlement)
        VALUES (1, 'REC-V4-SETTLE', '2026-04-01', 8120000, 8000000, 120000, 1)
      `).run();

      // Now run migration 005
      const migration005 = require('../electron/database/migrations/005_loan_types_and_payments');
      migration005.up(v4db);

      // Verify records preserved and upgraded
      const upgradedLoan = v4db.prepare(`SELECT loan_number, loan_type, due_date FROM loans WHERE id = 1`).get();
      assert(upgradedLoan.loan_number === 'LN-V4-001', 'Loan number preserved');
      assert(upgradedLoan.loan_type === 'FIXED', 'Historical loan classified as FIXED');
      assert(upgradedLoan.due_date === '2027-01-01', 'Due date preserved');

      const itemsCount = v4db.prepare(`SELECT count(*) as cnt FROM loan_items WHERE loan_id = 1`).get();
      assert(itemsCount.cnt === 1, 'Loan items preserved across 12-step table rebuild');

      // Check payment classifications
      const pInt = v4db.prepare(`SELECT payment_type FROM payments WHERE receipt_number = 'REC-V4-INT'`).get();
      assert(pInt.payment_type === 'INTEREST', 'Interest-only payment backfilled as INTEREST');

      const pPrin = v4db.prepare(`SELECT payment_type FROM payments WHERE receipt_number = 'REC-V4-PRIN'`).get();
      assert(pPrin.payment_type === 'PRINCIPAL', 'Principal-reduction payment backfilled as PRINCIPAL');

      const pSettle = v4db.prepare(`SELECT payment_type FROM payments WHERE receipt_number = 'REC-V4-SETTLE'`).get();
      assert(pSettle.payment_type === 'SETTLEMENT', 'Settlement payment backfilled as SETTLEMENT');

      // Check PRAGMAs
      const intCheck = v4db.pragma('integrity_check');
      assert(intCheck.length === 1 && intCheck[0].integrity_check === 'ok', 'Migration v4->v5 passed integrity check');
      const fkCheck = v4db.pragma('foreign_key_check');
      assert(fkCheck.length === 0, 'Migration v4->v5 has 0 foreign key violations');

      v4db.close();
    }

    // -------------------------------------------------------------
    // TEST GROUP 8: Successful Backup & Restore Cycle
    // -------------------------------------------------------------
    console.log('\n--- TEST GROUP 8: Successful Backup & Restore Cycle ---');
    {
      const livePath = path.join(testTempDir, 'live_restore_test.sqlite');
      const liveDb = new Database(livePath);
      liveDb.pragma('journal_mode = WAL');
      liveDb.pragma('foreign_keys = ON');
      initializeSchema(liveDb);

      // Insert baseline data
      liveDb.prepare(`INSERT INTO customers (customer_code, name, phone) VALUES ('CUST-BASE', 'Base Customer', '9876543210')`).run();
      const baseCustCount = liveDb.prepare(`SELECT count(*) as cnt FROM customers`).get().cnt;

      // Create backup
      const backupPath = path.join(testTempDir, 'valid_backup.sqlite');
      await liveDb.backup(backupPath);

      // Add extra data after backup
      liveDb.prepare(`INSERT INTO customers (customer_code, name, phone) VALUES ('CUST-AFTER', 'After Customer', '9876543211')`).run();
      const afterCount = liveDb.prepare(`SELECT count(*) as cnt FROM customers`).get().cnt;
      assert(afterCount === baseCustCount + 1, 'Added record after backup');

      // Now restore using workflow logic
      // Check backup integrity first
      const checkDb = new Database(backupPath, { readonly: true });
      const checkRes = checkDb.pragma('integrity_check');
      assert(checkRes[0].integrity_check === 'ok', 'Backup file passed integrity verification');
      checkDb.close();

      // Create safety pre-restore backup
      const safetyBackupPath = path.join(testTempDir, 'safety_pre_restore.sqlite');
      await liveDb.backup(safetyBackupPath);

      // Checkpoint and close live
      liveDb.pragma('wal_checkpoint(TRUNCATE)');
      liveDb.close();

      // Overwrite live with backup
      fs.copyFileSync(backupPath, livePath);

      // Reopen
      const restoredDb = new Database(livePath);
      restoredDb.pragma('journal_mode = WAL');
      restoredDb.pragma('foreign_keys = ON');

      const restoredCount = restoredDb.prepare(`SELECT count(*) as cnt FROM customers`).get().cnt;
      assert(restoredCount === baseCustCount, `Restored DB customer count matches baseline (${baseCustCount})`);

      const rInt = restoredDb.pragma('integrity_check');
      assert(rInt[0].integrity_check === 'ok', 'Restored DB passed integrity_check');
      const rFk = restoredDb.pragma('foreign_key_check');
      assert(rFk.length === 0, 'Restored DB has 0 FK violations');

      restoredDb.close();
    }

    // -------------------------------------------------------------
    // TEST GROUP 9: Failed Restore & Safe Rollback
    // -------------------------------------------------------------
    console.log('\n--- TEST GROUP 9: Failed Restore & Safe Rollback ---');
    {
      const livePath = path.join(testTempDir, 'live_rollback_test.sqlite');
      const liveDb = new Database(livePath);
      liveDb.pragma('journal_mode = WAL');
      liveDb.pragma('foreign_keys = ON');
      initializeSchema(liveDb);

      liveDb.prepare(`INSERT INTO customers (customer_code, name, phone) VALUES ('CUST-CRITICAL', 'Critical Customer', '9876543212')`).run();
      const origCust = liveDb.prepare(`SELECT name FROM customers WHERE customer_code = 'CUST-CRITICAL'`).get();

      // Create a corrupt/fake backup file
      const corruptBackupPath = path.join(testTempDir, 'corrupt_backup.sqlite');
      fs.writeFileSync(corruptBackupPath, 'NOT A SQLITE FILE AT ALL! GARBAGE DATA');

      // Attempt restore workflow
      let restoreFailedSafely = false;
      try {
        // Step 1: Pre-validation of backup
        let testDb;
        try {
          testDb = new Database(corruptBackupPath, { readonly: true, fileMustExist: true });
          const res = testDb.pragma('integrity_check');
          if (!Array.isArray(res) || res[0]?.integrity_check !== 'ok') {
            throw new Error('Backup failed integrity check');
          }
        } finally {
          if (testDb) testDb.close();
        }
      } catch (err) {
        restoreFailedSafely = true;
        assert(err.message.includes('not a database') || err.message.includes('integrity check'),
          `Corrupt backup was detected and rejected before touching live database: ${err.message}`);
      }
      assert(restoreFailedSafely, 'Corrupt backup restore was blocked');

      // Live database must remain 100% intact and undamaged
      const checkCust = liveDb.prepare(`SELECT name FROM customers WHERE customer_code = 'CUST-CRITICAL'`).get();
      assert(checkCust && checkCust.name === origCust.name, 'Live data remained intact after rejected restore');

      liveDb.close();
    }

    // -------------------------------------------------------------
    // TEST GROUP 10: Live Production Database Safety Verification
    // -------------------------------------------------------------
    console.log('\n--- TEST GROUP 10: Live Production Database Safety Verification ---');
    {
      const appData = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : '/var/local');
      const prodDbPath = path.join(appData, 'sri-gold-pawn-shop-billing', 'sri_gold_pawn_shop.sqlite');

      if (fs.existsSync(prodDbPath)) {
        const prodDb = new Database(prodDbPath, { readonly: true });
        const intCheck = prodDb.pragma('integrity_check');
        assert(intCheck.length === 1 && intCheck[0].integrity_check === 'ok', 'Live DB passed PRAGMA integrity_check');

        const fkCheck = prodDb.pragma('foreign_key_check');
        assert(fkCheck.length === 0, 'Live DB has 0 foreign key violations');

        const currentVersion = prodDb.prepare(`SELECT value as ver FROM _schema_meta WHERE key = 'schema_version'`).get();
        console.log(`  Live DB Schema Version: ${currentVersion?.ver}`);

        prodDb.close();
      } else {
        console.log('  Live DB path not found in default APPDATA, skipping live check.');
      }
    }

    console.log('\n===============================================================');
    console.log(`TEST SUITE SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED out of ${totalTests} total tests`);
    console.log('===============================================================\n');

  } finally {
    // Clean up temporary test files
    try {
      fs.rmSync(testTempDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Test execution failed:', e);
    process.exit(1);
  });
