/**
 * Comprehensive Automated Test Suite for Phase 3:
 * Customer Backend, Loan Creation, Pledged Items, and Transaction Rollbacks.
 *
 * Rules:
 *  - Runs against isolated in-memory & temporary databases first.
 *  - Tests atomic rollback of loans if any item fails.
 *  - Tests foreign key integrity and sequence numbers.
 *  - Verifies monetary values stored as paise, weights as mg.
 */

const Database = require('better-sqlite3');
const { initializeSchema, getNextSequence } = require('../electron/database/schema');

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED]: ${message}`);
  }
}

function runPhase3Tests() {
  console.log('====================================================');
  console.log('       PHASE 3 CUSTOMER & LOAN TEST SUITE           ');
  console.log('====================================================\n');

  // -------------------------------------------------------------------------
  // TEST 1: Customer Creation, Duplicate Validation & Search
  // -------------------------------------------------------------------------
  console.log('TEST 1: Customer creation and duplicate validation...');
  {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);

    // 1a: Create customer with sequence
    const code1 = getNextSequence(db, 'customer');
    assert(code1 === 'CUST-0001', `Expected CUST-0001, got ${code1}`);

    db.prepare(`
      INSERT INTO customers (customer_code, name, phone, address, city, id_proof_type, id_proof_number)
      VALUES (?, 'Muthu Kumar', '9840123456', '12 Bazaar St', 'Tirunelveli', 'AADHAAR', '123456789012')
    `).run(code1);

    // 1b: Verify retrieval
    const row = db.prepare(`SELECT * FROM customers WHERE customer_code = ?`).get(code1);
    assert(row && row.name === 'Muthu Kumar', 'Customer retrieval failed');
    assert(row.phone === '9840123456', 'Phone mismatch');

    // 1c: Unique constraint on customer_code
    let duplicateCodeThrown = false;
    try {
      db.prepare(`
        INSERT INTO customers (customer_code, name, phone)
        VALUES ('CUST-0001', 'Duplicate Man', '9999999999')
      `).run();
    } catch (e) {
      duplicateCodeThrown = true;
    }
    assert(duplicateCodeThrown, 'Unique constraint on customer_code did not trigger');

    // 1d: Search query test
    const pattern = '%Muthu%';
    const searchResults = db.prepare(`
      SELECT * FROM customers WHERE is_active = 1 AND (name LIKE ? OR phone LIKE ? OR customer_code LIKE ?)
    `).all(pattern, pattern, pattern);
    assert(searchResults.length === 1 && searchResults[0].customer_code === 'CUST-0001', 'Search failed to match customer');

    db.close();
    console.log('  PASSED: Customer creation, duplicate check, and search verified.');
  }

  // -------------------------------------------------------------------------
  // TEST 2: Atomic Loan Creation with Multiple Ornaments
  // -------------------------------------------------------------------------
  console.log('\nTEST 2: Atomic Loan Creation with Multiple Ornaments...');
  {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);

    // Seed customer
    const custCode = getNextSequence(db, 'customer');
    const custInsert = db.prepare(`
      INSERT INTO customers (customer_code, name, phone) VALUES (?, 'Siva Sankaran', '9443322110')
    `).run(custCode);
    const customerId = custInsert.lastInsertRowid;

    // Create loan with 2 items in transaction
    const loanTx = db.transaction(() => {
      const loanNum = getNextSequence(db, 'loan');
      assert(loanNum === 'L-0001', `Expected L-0001, got ${loanNum}`);

      // Gross: 12.500g (12500mg) + 8.200g (8200mg) = 20700mg
      // Stone: 0.500g (500mg) + 0.200g (200mg) = 700mg
      // Net: 12000mg + 8000mg = 20000mg (20.000g)
      // Principal: ₹60,000 = 6000000 paise
      const insertLoan = db.prepare(`
        INSERT INTO loans (
          loan_number, customer_id, loan_date, principal_amount_paise,
          monthly_interest_rate_basis_points, monthly_interest_rate_pct,
          term_months, due_date, status, total_gross_weight_mg, total_net_weight_mg,
          total_item_count, appraised_market_value_paise
        ) VALUES (?, ?, '2026-10-11', 6000000, 150, 1.5, 12, '2027-10-11', 'ACTIVE', 20700, 20000, 2, 10000000)
      `).run(loanNum, customerId);

      const loanId = insertLoan.lastInsertRowid;

      const insertItem = db.prepare(`
        INSERT INTO loan_items (
          loan_id, ornament_type, description, item_count, gross_weight_mg, stone_weight_mg, net_weight_mg, purity, estimated_value_paise
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // Item 1: Gold Chain
      insertItem.run(loanId, 'Chain', '22K Rope Chain', 1, 12500, 500, 12000, '22K', 6000000);
      // Item 2: Gold Ring
      insertItem.run(loanId, 'Ring', 'Stone Ring', 1, 8200, 200, 8000, '22K', 4000000);

      return loanId;
    });

    const createdLoanId = loanTx();
    assert(createdLoanId > 0, 'Loan ID was not generated');

    // Verify stored loan & items
    const loanRecord = db.prepare(`SELECT * FROM loans WHERE id = ?`).get(createdLoanId);
    assert(loanRecord.principal_amount_paise === 6000000, 'Principal paise mismatch');
    assert(loanRecord.total_gross_weight_mg === 20700, 'Gross weight mg mismatch');
    assert(loanRecord.total_net_weight_mg === 20000, 'Net weight mg mismatch');

    const items = db.prepare(`SELECT * FROM loan_items WHERE loan_id = ? ORDER BY id ASC`).all(createdLoanId);
    assert(items.length === 2, `Expected 2 loan items, got ${items.length}`);
    assert(items[0].ornament_type === 'Chain' && items[0].net_weight_mg === 12000, 'Item 1 net weight mismatch');
    assert(items[1].ornament_type === 'Ring' && items[1].net_weight_mg === 8000, 'Item 2 net weight mismatch');

    db.close();
    console.log('  PASSED: Loan and multi-ornament items created atomically with exact paise and mg.');
  }

  // -------------------------------------------------------------------------
  // TEST 3: Transaction Rollback on Item Failure
  // -------------------------------------------------------------------------
  console.log('\nTEST 3: Transaction Rollback if any part of loan creation fails...');
  {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);

    const custCode = getNextSequence(db, 'customer');
    const custInsert = db.prepare(`INSERT INTO customers (customer_code, name, phone) VALUES (?, 'Ramesh', '9112233445')`).run(custCode);
    const customerId = custInsert.lastInsertRowid;

    let transactionFailed = false;
    try {
      db.transaction(() => {
        const loanNum = getNextSequence(db, 'loan');
        const insertLoan = db.prepare(`
          INSERT INTO loans (
            loan_number, customer_id, loan_date, principal_amount_paise,
            monthly_interest_rate_basis_points, monthly_interest_rate_pct,
            term_months, due_date, status, total_gross_weight_mg, total_net_weight_mg,
            total_item_count
          ) VALUES (?, ?, '2026-10-11', 2500000, 150, 1.5, 12, '2027-10-11', 'ACTIVE', 10000, 10000, 2)
        `).run(loanNum, customerId);

        const loanId = insertLoan.lastInsertRowid;

        // Insert first item successfully
        db.prepare(`
          INSERT INTO loan_items (loan_id, ornament_type, item_count, gross_weight_mg, net_weight_mg)
          VALUES (?, 'Bangle', 1, 5000, 5000)
        `).run(loanId);

        // Intentionally violate check constraint on item 2: net_weight_mg > gross_weight_mg
        db.prepare(`
          INSERT INTO loan_items (loan_id, ornament_type, item_count, gross_weight_mg, net_weight_mg)
          VALUES (?, 'Bangle', 1, 5000, 7000)
        `).run(loanId);
      })();
    } catch (e) {
      transactionFailed = true;
    }

    assert(transactionFailed, 'Transaction was expected to fail and throw');

    // Verify that NO loans or partial items exist in the database
    const loansCount = db.prepare(`SELECT count(*) as count FROM loans`).get().count;
    const itemsCount = db.prepare(`SELECT count(*) as count FROM loan_items`).get().count;
    assert(loansCount === 0, `Expected 0 loans after rollback, found ${loansCount}`);
    assert(itemsCount === 0, `Expected 0 loan items after rollback, found ${itemsCount}`);

    db.close();
    console.log('  PASSED: Failed loan creation completely and atomically rolled back.');
  }

  // -------------------------------------------------------------------------
  // TEST 4: Live App Database Smoke Test
  // -------------------------------------------------------------------------
  console.log('\nTEST 4: Live App Database Schema & Sequences verification...');
  {
    const path = require('path');
    const dbPath = path.join(process.env.APPDATA, 'sri-gold-pawn-shop-billing', 'sri_gold_pawn_shop.sqlite');
    const db = new Database(dbPath);
    db.pragma('foreign_keys = ON');

    // Verify sequences exist and can generate numbers
    const seqRow = db.prepare(`SELECT * FROM sequences WHERE name = 'loan'`).get();
    assert(seqRow && seqRow.prefix === 'L-', 'Sequence row for loan missing');

    const ornaments = db.prepare(`SELECT count(*) as count FROM ornament_master`).get();
    assert(ornaments.count >= 10, 'Ornament master seed missing');

    db.close();
    console.log('  PASSED: Live SQLite database configured with master data and sequence generators.');
  }

  console.log('\n====================================================');
  console.log('   ALL PHASE 3 TESTS COMPLETED SUCCESSFULLY!        ');
  console.log('====================================================');
}

try {
  runPhase3Tests();
} catch (e) {
  console.error('\nTEST FAILED:', e);
  process.exit(1);
}
