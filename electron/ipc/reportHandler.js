/**
 * Reports & Dashboard IPC Handlers for Sri Gold Pawn Shop Billing.
 * Provides live aggregated metrics, loan registers, overdue reports,
 * and collection registers with precise integer calculations.
 */

const { ipcMain } = require('electron');
const { getDb } = require('../database/connection');

function registerReportIpcHandlers() {
  /**
   * Fetch live dashboard metrics
   * Channel: 'reports:get-dashboard-metrics'
   */
  ipcMain.handle('reports:get-dashboard-metrics', async () => {
    try {
      const db = getDb();
      const today = new Date().toISOString().split('T')[0];

      // 1. Total customers
      const custRow = db.prepare(`SELECT COUNT(*) AS total_customers FROM customers`).get();
      const totalCustomers = custRow.total_customers || 0;

      // 2. Active & Closed Loans count
      const activeLoansRow = db.prepare(`SELECT COUNT(*) AS count FROM loans WHERE status = 'ACTIVE'`).get();
      const closedLoansRow = db.prepare(`SELECT COUNT(*) AS count FROM loans WHERE status = 'CLOSED'`).get();
      const totalActiveLoans = activeLoansRow.count || 0;
      const totalClosedLoans = closedLoansRow.count || 0;

      // 3. Dynamic overdue loans count (only ACTIVE loans where maturity_date is set and < today)
      const overdueRow = db.prepare(`
        SELECT COUNT(*) AS count 
        FROM loans 
        WHERE status = 'ACTIVE' 
          AND maturity_date IS NOT NULL 
          AND maturity_date != '' 
          AND maturity_date < ?
      `).get(today);
      const totalOverdueLoans = overdueRow.count || 0;

      // 4. Principal outstanding calculation:
      // Original principal of ACTIVE loans minus principal payments already received on those active loans
      const activeLoansPrincipalRow = db.prepare(`
        SELECT COALESCE(SUM(principal_amount_paise), 0) AS total_original_principal
        FROM loans
        WHERE status = 'ACTIVE'
      `).get();

      const activeLoansRepaidPrincipalRow = db.prepare(`
        SELECT COALESCE(SUM(p.principal_component_paise), 0) AS total_repaid_principal
        FROM payments p
        JOIN loans l ON p.loan_id = l.id
        WHERE l.status = 'ACTIVE'
      `).get();

      const totalPrincipalOutstandingPaise = Math.max(
        0,
        (activeLoansPrincipalRow.total_original_principal || 0) - (activeLoansRepaidPrincipalRow.total_repaid_principal || 0)
      );

      // 5. Today's collections
      const todayCollectionsRow = db.prepare(`
        SELECT 
          COUNT(*) AS count,
          COALESCE(SUM(total_amount_paise), 0) AS total_paise,
          COALESCE(SUM(principal_component_paise), 0) AS principal_paise,
          COALESCE(SUM(interest_component_paise), 0) AS interest_paise
        FROM payments
        WHERE payment_date = ?
      `).get(today);

      // 6. Total collections all time
      const totalCollectionsRow = db.prepare(`
        SELECT 
          COUNT(*) AS count,
          COALESCE(SUM(total_amount_paise), 0) AS total_paise,
          COALESCE(SUM(interest_component_paise), 0) AS total_interest_paise
        FROM payments
      `).get();

      // 7. Recent 5 loans
      const recentLoans = db.prepare(`
        SELECT l.id, l.loan_number, l.principal_amount_paise, l.status,
               COALESCE(l.pledge_date, l.loan_date) AS pledge_date,
               l.maturity_date,
               c.name AS customer_name, c.customer_code, c.phone AS customer_phone
        FROM loans l
        JOIN customers c ON l.customer_id = c.id
        ORDER BY l.id DESC
        LIMIT 5
      `).all();

      // 8. Recent 5 payments
      const recentPayments = db.prepare(`
        SELECT p.id, p.receipt_number, p.payment_date, p.total_amount_paise,
               p.payment_mode, l.loan_number, c.name AS customer_name
        FROM payments p
        JOIN loans l ON p.loan_id = l.id
        JOIN customers c ON l.customer_id = c.id
        ORDER BY p.id DESC
        LIMIT 5
      `).all();

      return {
        success: true,
        data: {
          totalCustomers,
          totalActiveLoans,
          totalClosedLoans,
          totalOverdueLoans,
          totalPrincipalOutstandingPaise,
          todayCollections: {
            count: todayCollectionsRow.count || 0,
            totalPaise: todayCollectionsRow.total_paise || 0,
            principalPaise: todayCollectionsRow.principal_paise || 0,
            interestPaise: todayCollectionsRow.interest_paise || 0
          },
          totalCollectionsAllTimePaise: totalCollectionsRow.total_paise || 0,
          totalInterestEarnedPaise: totalCollectionsRow.total_interest_paise || 0,
          recentLoans,
          recentPayments
        }
      };
    } catch (error) {
      console.error('[IPC Handler reports:get-dashboard-metrics Error]:', error);
      return { success: false, error: error.message || 'Failed to fetch dashboard metrics' };
    }
  });

  /**
   * Loan Register / Active / Overdue Report
   * Channel: 'reports:get-loan-register'
   */
  ipcMain.handle('reports:get-loan-register', async (event, filters = {}) => {
    try {
      const db = getDb();
      const today = new Date().toISOString().split('T')[0];

      const status = filters.status || 'ALL'; // ALL, ACTIVE, CLOSED, OVERDUE
      const startDate = filters.start_date || '';
      const endDate = filters.end_date || '';
      const interestType = filters.interest_type || 'ALL';
      const search = filters.search ? filters.search.trim() : '';

      let sql = `
        SELECT l.id, l.loan_number, l.principal_amount_paise, l.monthly_interest_rate_pct,
               COALESCE(l.interest_type, 'MONTHLY') AS interest_type,
               COALESCE(l.interest_duration, l.term_months) AS interest_duration,
               COALESCE(l.pledge_date, l.loan_date) AS pledge_date,
               l.maturity_date, l.status, l.created_at,
               c.id AS customer_id, c.customer_code, c.name AS customer_name, c.phone AS customer_phone,
               COALESCE((
                 SELECT SUM(net_weight_mg) FROM loan_items WHERE loan_id = l.id
               ), 0) AS total_net_weight_mg,

               COALESCE((
                 SELECT SUM(principal_component_paise) FROM payments WHERE loan_id = l.id
               ), 0) AS total_paid_principal_paise,
               COALESCE((
                 SELECT SUM(interest_component_paise) FROM payments WHERE loan_id = l.id
               ), 0) AS total_paid_interest_paise
        FROM loans l
        JOIN customers c ON l.customer_id = c.id
        WHERE 1=1
      `;
      const params = [];

      if (status === 'ACTIVE') {
        sql += ` AND l.status = 'ACTIVE'`;
      } else if (status === 'CLOSED') {
        sql += ` AND l.status = 'CLOSED'`;
      } else if (status === 'OVERDUE') {
        sql += ` AND l.status = 'ACTIVE' AND l.maturity_date IS NOT NULL AND l.maturity_date != '' AND l.maturity_date < ?`;
        params.push(today);
      }

      if (startDate) {
        sql += ` AND COALESCE(l.pledge_date, l.loan_date) >= ?`;
        params.push(startDate);
      }
      if (endDate) {
        sql += ` AND COALESCE(l.pledge_date, l.loan_date) <= ?`;
        params.push(endDate);
      }
      if (interestType !== 'ALL') {
        sql += ` AND COALESCE(l.interest_type, 'MONTHLY') = ?`;
        params.push(interestType);
      }
      if (search) {
        sql += ` AND (l.loan_number LIKE ? OR c.name LIKE ? OR c.customer_code LIKE ? OR c.phone LIKE ?)`;
        const p = `%${search}%`;
        params.push(p, p, p, p);
      }

      sql += ` ORDER BY l.id DESC`;

      const rows = db.prepare(sql).all(...params);

      // Decorate with computed fields
      let sumPrincipalPaise = 0;
      let sumPaidPrincipalPaise = 0;
      let sumOutstandingPrincipalPaise = 0;
      let sumNetWeightMg = 0;

      const decorated = rows.map((r) => {
        const remainingPrincipalPaise = Math.max(0, r.principal_amount_paise - r.total_paid_principal_paise);
        const isOverdue = r.status === 'ACTIVE' && Boolean(r.maturity_date) && r.maturity_date < today;

        sumPrincipalPaise += r.principal_amount_paise;
        sumPaidPrincipalPaise += r.total_paid_principal_paise;
        sumOutstandingPrincipalPaise += remainingPrincipalPaise;
        sumNetWeightMg += r.total_net_weight_mg;

        return {
          ...r,
          remaining_principal_paise: remainingPrincipalPaise,
          is_overdue: isOverdue
        };
      });

      return {
        success: true,
        data: {
          items: decorated,
          totals: {
            count: decorated.length,
            sumPrincipalPaise,
            sumPaidPrincipalPaise,
            sumOutstandingPrincipalPaise,
            sumNetWeightMg
          }
        }
      };
    } catch (error) {
      console.error('[IPC Handler reports:get-loan-register Error]:', error);
      return { success: false, error: error.message || 'Failed to generate loan register' };
    }
  });

  /**
   * Collection & Repayment Register
   * Channel: 'reports:get-collection-report'
   */
  ipcMain.handle('reports:get-collection-report', async (event, filters = {}) => {
    try {
      const db = getDb();
      const startDate = filters.start_date || '';
      const endDate = filters.end_date || '';
      const paymentMode = filters.payment_mode || 'ALL';
      const search = filters.search ? filters.search.trim() : '';

      let sql = `
        SELECT p.id, p.receipt_number, p.payment_date, p.total_amount_paise,
               p.principal_component_paise, p.interest_component_paise, p.penalty_component_paise,
               p.payment_mode, p.reference_txn_id, p.notes, p.created_at,
               l.loan_number, l.status AS loan_status,
               c.customer_code, c.name AS customer_name, c.phone AS customer_phone
        FROM payments p
        JOIN loans l ON p.loan_id = l.id
        JOIN customers c ON l.customer_id = c.id
        WHERE 1=1
      `;
      const params = [];

      if (startDate) {
        sql += ` AND p.payment_date >= ?`;
        params.push(startDate);
      }
      if (endDate) {
        sql += ` AND p.payment_date <= ?`;
        params.push(endDate);
      }
      if (paymentMode !== 'ALL') {
        sql += ` AND p.payment_mode = ?`;
        params.push(paymentMode);
      }
      if (search) {
        sql += ` AND (p.receipt_number LIKE ? OR l.loan_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)`;
        const p = `%${search}%`;
        params.push(p, p, p, p);
      }

      sql += ` ORDER BY p.id DESC`;

      const rows = db.prepare(sql).all(...params);

      let sumTotalPaise = 0;
      let sumPrincipalPaise = 0;
      let sumInterestPaise = 0;
      let sumPenaltyPaise = 0;

      for (const r of rows) {
        sumTotalPaise += r.total_amount_paise;
        sumPrincipalPaise += r.principal_component_paise;
        sumInterestPaise += r.interest_component_paise;
        sumPenaltyPaise += r.penalty_component_paise;
      }

      return {
        success: true,
        data: {
          items: rows,
          totals: {
            count: rows.length,
            sumTotalPaise,
            sumPrincipalPaise,
            sumInterestPaise,
            sumPenaltyPaise
          }
        }
      };
    } catch (error) {
      console.error('[IPC Handler reports:get-collection-report Error]:', error);
      return { success: false, error: error.message || 'Failed to generate collection report' };
    }
  });

  /**
   * Customer detailed loan and payment ledger
   * Channel: 'reports:get-customer-ledger'
   */
  ipcMain.handle('reports:get-customer-ledger', async (event, customerId) => {
    try {
      const id = parseInt(customerId, 10);
      if (!id || id <= 0) {
        return { success: false, error: 'Valid customer ID is required' };
      }

      const db = getDb();
      const customer = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(id);
      if (!customer) {
        return { success: false, error: 'Customer not found' };
      }

      const loans = db.prepare(`
        SELECT l.*,
               COALESCE((
                 SELECT SUM(principal_component_paise) FROM payments WHERE loan_id = l.id
               ), 0) AS total_paid_principal_paise,
               COALESCE((
                 SELECT SUM(interest_component_paise) FROM payments WHERE loan_id = l.id
               ), 0) AS total_paid_interest_paise
        FROM loans l
        WHERE l.customer_id = ?
        ORDER BY l.id DESC
      `).all(id);

      const payments = db.prepare(`
        SELECT p.*, l.loan_number
        FROM payments p
        JOIN loans l ON p.loan_id = l.id
        WHERE l.customer_id = ?
        ORDER BY p.id DESC
      `).all(id);

      return {
        success: true,
        data: {
          customer,
          loans,
          payments
        }
      };
    } catch (error) {
      console.error('[IPC Handler reports:get-customer-ledger Error]:', error);
      return { success: false, error: error.message || 'Failed to fetch customer ledger' };
    }
  });
}

module.exports = {
  registerReportIpcHandlers
};
