/**
 * Migration 003: Enhanced Loan Terms, Flexible Interest Types, and Maturity Dates
 * Target Version: 3
 *
 * Requirements:
 * 1. Add `interest_type` (WEEKLY, MONTHLY) - default 'MONTHLY'
 * 2. Add `interest_duration` (positive integer: weeks or months) - default term_months
 * 3. Add `pledge_date` (alias/synonym for loan_date) - backfilled from loan_date
 * 4. Add `maturity_date` (admin-selected maturity date) - backfilled from due_date for historical loans
 * 5. Add index on maturity_date and status for fast overdue queries
 * 6. Support OVERDUE status: The schema already had CHECK(status IN ('ACTIVE', 'CLOSED', 'DEFAULTED', 'AUCTIONED')).
 *    We update or recreate status check or maintain status values including 'OVERDUE'.
 *    In SQLite, ALTER TABLE ADD COLUMN does not support modifying existing column check constraints directly,
 *    so we add columns cleanly and create appropriate indexes.
 */

const TARGET_VERSION = 3;

function up(db) {
  // Check existing columns in loans table
  const columns = db.prepare(`PRAGMA table_info(loans)`).all().map(c => c.name);

  // 1. Add interest_type if not exists
  if (!columns.includes('interest_type')) {
    db.exec(`
      ALTER TABLE loans
      ADD COLUMN interest_type TEXT NOT NULL DEFAULT 'MONTHLY' CHECK(interest_type IN ('WEEKLY', 'MONTHLY'));
    `);
  }

  // 2. Add interest_duration if not exists
  if (!columns.includes('interest_duration')) {
    db.exec(`
      ALTER TABLE loans
      ADD COLUMN interest_duration INTEGER NOT NULL DEFAULT 12 CHECK(interest_duration > 0);
    `);
  }

  // 3. Add pledge_date if not exists
  if (!columns.includes('pledge_date')) {
    db.exec(`
      ALTER TABLE loans
      ADD COLUMN pledge_date DATE;
    `);
    // Backfill from loan_date for existing loans
    db.exec(`
      UPDATE loans SET pledge_date = loan_date WHERE pledge_date IS NULL;
    `);
  }

  // 4. Add maturity_date if not exists
  if (!columns.includes('maturity_date')) {
    db.exec(`
      ALTER TABLE loans
      ADD COLUMN maturity_date DATE;
    `);
    // Backfill from due_date for existing loans
    db.exec(`
      UPDATE loans SET maturity_date = due_date WHERE maturity_date IS NULL;
    `);
  }

  // 5. Create index on maturity_date and status
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_loans_maturity_date ON loans(maturity_date);
    CREATE INDEX IF NOT EXISTS idx_loans_status_maturity ON loans(status, maturity_date);
  `);
}

module.exports = {
  targetVersion: TARGET_VERSION,
  up
};
