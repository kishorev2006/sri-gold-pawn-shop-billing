/**
 * Payment & Settlement IPC Handlers for Sri Gold Pawn Shop Billing.
 * 
 * Implements:
 * 1. Agreed Daily Interest Engine:
 *    Daily interest = outstanding principal * monthly rate / 100 / 30
 *    Calculated across dated segments defined by historical principal repayments.
 *    Rounding defined as cumulative gross accrued rounded to nearest integer paise.
 * 2. Settlement Guardrails:
 *    A loan cannot close while required principal or accrued interest remains unpaid.
 *    Explicit interest concessions require justification and audit logging.
 * 3. Payment Classification:
 *    payment_type in ('INTEREST', 'PRINCIPAL', 'SETTLEMENT').
 * 4. Monotonic sequential receipts and atomic rollback.
 */

const { ipcMain } = require('electron');
const { getDb } = require('../database/connection');
const { getNextSequence } = require('../database/schema');

/**
 * Pure calculation function to compute loan interest and financial standing.
 * Exported for automated unit/regression testing.
 *
 * @param {object} loan 
 * @param {Array<object>} payments 
 * @param {string} [calculationDateStr] Optional YYYY-MM-DD
 * @returns {object}
 */
function calculateLoanInterestSummary(loan, payments = [], calculationDateStr = '') {
  const calcDate = calculationDateStr || new Date().toISOString().split('T')[0];
  const pledgeDate = loan.pledge_date || loan.loan_date;

  // Aggregate past payments made so far
  let totalPaidPrincipalPaise = 0;
  let totalPaidInterestPaise = 0;
  let totalPaidPenaltyPaise = 0;

  for (const p of payments) {
    totalPaidPrincipalPaise += (p.principal_component_paise || 0);
    totalPaidInterestPaise += (p.interest_component_paise || 0);
    totalPaidPenaltyPaise += (p.penalty_component_paise || 0);
  }

  const remainingPrincipalPaise = Math.max(0, loan.principal_amount_paise - totalPaidPrincipalPaise);

  const pledgeDateObj = new Date(pledgeDate);
  const calcDateObj = new Date(calcDate);
  const totalDiffMs = Math.max(0, calcDateObj.getTime() - pledgeDateObj.getTime());
  const totalElapsedDays = Math.floor(totalDiffMs / (1000 * 60 * 60 * 24));

  let estimatedTotalAccruedInterestPaise = 0;
  const segmentBreakdown = [];

  if (loan.interest_type === 'WEEKLY') {
    // Preserve existing weekly logic until explicit business policy is given
    const elapsedWeeks = totalElapsedDays === 0 ? 0 : Math.max(1, Math.ceil(totalElapsedDays / 7));
    const ratePct = loan.monthly_interest_rate_pct;
    estimatedTotalAccruedInterestPaise = Math.round(
      (remainingPrincipalPaise * (ratePct / 100)) * elapsedWeeks
    );
    segmentBreakdown.push({
      type: 'WEEKLY',
      elapsedWeeks,
      elapsedDays: totalElapsedDays,
      principalPaise: remainingPrincipalPaise,
      accruedPaise: estimatedTotalAccruedInterestPaise
    });
  } else {
    // Agreed Monthly Interest Rule:
    // Daily interest = outstanding principal * monthly rate / 100 / 30
    const monthlyRatePct = loan.monthly_interest_rate_pct;
    const dailyRate = (monthlyRatePct / 100) / 30; // exact daily rate multiplier

    // Extract dated principal reduction events up to calcDate
    const principalEvents = payments
      .filter(p => (p.principal_component_paise || 0) > 0 && p.payment_date <= calcDate && p.payment_date >= pledgeDate)
      .map(p => ({ date: p.payment_date, amount: p.principal_component_paise }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    let currentPrincipal = loan.principal_amount_paise;
    let currentSegmentStart = pledgeDate;
    let grossAccrued = 0;

    for (const evt of principalEvents) {
      if (evt.date > currentSegmentStart) {
        const segStartObj = new Date(currentSegmentStart);
        const segEndObj = new Date(evt.date);
        const segDays = Math.floor((segEndObj.getTime() - segStartObj.getTime()) / (1000 * 60 * 60 * 24));

        if (segDays > 0) {
          const segInterest = currentPrincipal * dailyRate * segDays;
          grossAccrued += segInterest;
          segmentBreakdown.push({
            startDate: currentSegmentStart,
            endDate: evt.date,
            days: segDays,
            principalPaise: currentPrincipal,
            segmentInterestPaise: Math.round(segInterest)
          });
        }
        currentSegmentStart = evt.date;
      }
      currentPrincipal = Math.max(0, currentPrincipal - evt.amount);
    }

    // Final segment from last event (or pledgeDate) to calcDate
    if (calcDate > currentSegmentStart) {
      const segStartObj = new Date(currentSegmentStart);
      const segEndObj = new Date(calcDate);
      const segDays = Math.floor((segEndObj.getTime() - segStartObj.getTime()) / (1000 * 60 * 60 * 24));

      if (segDays > 0 && currentPrincipal > 0) {
        const segInterest = currentPrincipal * dailyRate * segDays;
        grossAccrued += segInterest;
        segmentBreakdown.push({
          startDate: currentSegmentStart,
          endDate: calcDate,
          days: segDays,
          principalPaise: currentPrincipal,
          segmentInterestPaise: Math.round(segInterest)
        });
      }
    }

    // Rounding: Round cumulative gross interest to nearest integer paise
    estimatedTotalAccruedInterestPaise = Math.round(grossAccrued);
  }

  // Prevent double-counting previously paid interest
  const outstandingInterestPaise = Math.max(0, estimatedTotalAccruedInterestPaise - totalPaidInterestPaise);
  const totalOutstandingPaise = remainingPrincipalPaise + outstandingInterestPaise;

  return {
    loan,
    payments,
    totalPaidPrincipalPaise,
    totalPaidInterestPaise,
    totalPaidPenaltyPaise,
    remainingPrincipalPaise,
    elapsedDays: totalElapsedDays,
    accruedInterestPaise: estimatedTotalAccruedInterestPaise,
    estimatedTotalAccruedInterestPaise,
    outstandingInterestPaise,
    totalOutstandingPaise,
    segmentBreakdown,
    isClosed: loan.status === 'CLOSED'
  };
}

function registerPaymentIpcHandlers() {
  /**
   * Get loan financial summary and calculate accrued interest & balance
   * Channel: 'payments:get-loan-summary'
   */
  ipcMain.handle('payments:get-loan-summary', async (event, loanId) => {
    try {
      const id = parseInt(loanId, 10);
      if (!id || id <= 0) {
        return { success: false, error: 'Valid loan ID is required' };
      }

      const db = getDb();
      const today = new Date().toISOString().split('T')[0];

      const loan = db.prepare(`
        SELECT l.*, 
               COALESCE(l.pledge_date, l.loan_date) AS pledge_date,
               COALESCE(l.maturity_date, l.due_date) AS maturity_date,
               COALESCE(l.interest_type, 'MONTHLY') AS interest_type,
               COALESCE(l.interest_duration, l.term_months) AS interest_duration,
               c.customer_code, c.name AS customer_name, c.phone AS customer_phone
        FROM loans l
        JOIN customers c ON l.customer_id = c.id
        WHERE l.id = ?
      `).get(id);

      if (!loan) {
        return { success: false, error: 'Loan not found' };
      }

      const payments = db.prepare(`
        SELECT id, receipt_number, payment_date, total_amount_paise,
               principal_component_paise, interest_component_paise, penalty_component_paise,
               payment_type, payment_mode, reference_txn_id, notes, created_at
        FROM payments
        WHERE loan_id = ?
        ORDER BY id ASC
      `).all(id);

      const summary = calculateLoanInterestSummary(loan, payments, today);
      return { success: true, data: summary };
    } catch (error) {
      console.error('[IPC Handler payments:get-loan-summary Error]:', error);
      return { success: false, error: error.message || 'Failed to calculate loan summary' };
    }
  });

  /**
   * Record a payment (Interest repayment, partial principal, or full settlement)
   * Channel: 'payments:record'
   */
  ipcMain.handle('payments:record', async (event, payload = {}) => {
    try {
      const db = getDb();

      const loanId = parseInt(payload.loan_id, 10);
      if (!loanId || loanId <= 0) {
        return { success: false, error: 'Valid loan ID is required' };
      }

      const loan = db.prepare(`SELECT * FROM loans WHERE id = ?`).get(loanId);
      if (!loan) {
        return { success: false, error: 'Loan not found' };
      }

      if (loan.status === 'CLOSED') {
        return { success: false, error: 'Cannot record payment on an already closed/settled loan' };
      }

      const paymentDate = payload.payment_date || new Date().toISOString().split('T')[0];
      const paymentMode = payload.payment_mode || 'CASH';
      const referenceTxnId = payload.reference_txn_id ? payload.reference_txn_id.trim() : null;
      const notes = payload.notes ? payload.notes.trim() : null;

      // Payment allocations
      const principalPaise = parseInt(payload.principal_component_paise, 10) || 0;
      const interestPaise = parseInt(payload.interest_component_paise, 10) || 0;
      const penaltyPaise = parseInt(payload.penalty_component_paise, 10) || 0;
      const totalAmountPaise = parseInt(payload.total_amount_paise, 10) || 0;

      // Optional interest concession / waiver
      const concessionPaise = parseInt(payload.interest_concession_paise, 10) || 0;
      const concessionReason = payload.concession_reason ? payload.concession_reason.trim() : '';

      if (principalPaise < 0 || interestPaise < 0 || penaltyPaise < 0) {
        return { success: false, error: 'Payment components cannot be negative' };
      }

      if (concessionPaise < 0) {
        return { success: false, error: 'Interest concession cannot be negative' };
      }

      if (concessionPaise > 0 && concessionReason.length < 3) {
        return { success: false, error: 'Explicit concession reason is required when applying an interest concession/waiver' };
      }

      if (totalAmountPaise <= 0) {
        return { success: false, error: 'Total payment amount must be greater than zero' };
      }

      if (totalAmountPaise !== (principalPaise + interestPaise + penaltyPaise)) {
        return { success: false, error: 'Total payment amount must exactly equal principal + interest + penalty components' };
      }

      // Fetch past payments to evaluate interest & balances accurately
      const pastPayments = db.prepare(`
        SELECT id, receipt_number, payment_date, total_amount_paise,
               principal_component_paise, interest_component_paise, penalty_component_paise
        FROM payments WHERE loan_id = ?
        ORDER BY id ASC
      `).all(loanId);

      const summary = calculateLoanInterestSummary(loan, pastPayments, paymentDate);
      const remainingPrincipal = summary.remainingPrincipalPaise;
      const outstandingInterest = summary.outstandingInterestPaise;

      // Validate Principal Overpayment
      if (principalPaise > remainingPrincipal) {
        return {
          success: false,
          error: `Principal payment of ₹${(principalPaise / 100).toLocaleString('en-IN')} exceeds the remaining balance of ₹${(remainingPrincipal / 100).toLocaleString('en-IN')}`
        };
      }

      // Determine requested or inferred payment type
      const requestedType = payload.payment_type ? payload.payment_type.trim().toUpperCase() : '';
      const isSettlementRequested = Boolean(payload.is_settlement) || requestedType === 'SETTLEMENT';

      // SETTLEMENT SAFETY GUARDRAILS:
      // A loan can ONLY close if:
      // 1. Principal payment clears all remaining principal.
      // 2. Interest payment + authorized concession fully clears all outstanding accrued interest.
      const isSettlingPrincipal = (principalPaise === remainingPrincipal);
      const isSettlingInterest = ((interestPaise + concessionPaise) >= outstandingInterest);

      if (isSettlementRequested || isSettlingPrincipal) {
        if (!isSettlingPrincipal) {
          return {
            success: false,
            error: `Settlement requires paying full remaining principal of ₹${(remainingPrincipal / 100).toFixed(2)}`
          };
        }

        if (!isSettlingInterest) {
          const unpaidInterest = outstandingInterest - (interestPaise + concessionPaise);
          return {
            success: false,
            error: `Cannot settle and close loan while ₹${(unpaidInterest / 100).toFixed(2)} of accrued interest remains unpaid. To close the loan, collect the outstanding interest or provide an authorized interest concession.`
          };
        }
      }

      const shouldCloseLoan = isSettlingPrincipal && isSettlingInterest && (isSettlementRequested || (principalPaise > 0 && interestPaise >= 0));

      // Determine sanitized payment_type
      let finalPaymentType = 'PRINCIPAL';
      if (shouldCloseLoan) {
        finalPaymentType = 'SETTLEMENT';
      } else if (interestPaise > 0 && principalPaise === 0) {
        finalPaymentType = 'INTEREST';
      } else if (principalPaise > 0 && interestPaise === 0) {
        finalPaymentType = 'PRINCIPAL';
      } else if (['INTEREST', 'PRINCIPAL', 'SETTLEMENT'].includes(requestedType)) {
        finalPaymentType = requestedType;
      } else {
        finalPaymentType = 'PRINCIPAL';
      }

      // Execute transactionally
      const recordPaymentTx = db.transaction(() => {
        const receiptNumber = getNextSequence(db, 'receipt');

        const insertPayment = db.prepare(`
          INSERT INTO payments (
            receipt_number, loan_id, payment_date, total_amount_paise,
            principal_component_paise, interest_component_paise, penalty_component_paise,
            payment_type, payment_mode, reference_txn_id, notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(
          receiptNumber,
          loanId,
          paymentDate,
          totalAmountPaise,
          principalPaise,
          interestPaise,
          penaltyPaise,
          finalPaymentType,
          paymentMode,
          referenceTxnId,
          notes
        );

        const newPaymentId = insertPayment.lastInsertRowid;

        // If settlement conditions met, atomically close loan
        if (shouldCloseLoan) {
          db.prepare(`
            UPDATE loans
            SET status = 'CLOSED', closed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(loanId);

          db.prepare(`
            INSERT INTO loan_status_history (loan_id, previous_status, new_status, reason, changed_at)
            VALUES (?, 'ACTIVE', 'CLOSED', ?, CURRENT_TIMESTAMP)
          `).run(loanId, concessionPaise > 0 ? `Loan full settlement with ₹${(concessionPaise/100).toFixed(2)} concession: ${concessionReason}` : 'Loan full settlement and closure');
        }

        // Audit log
        db.prepare(`
          INSERT INTO audit_logs (entity_type, entity_id, action, details_json, created_at)
          VALUES ('payment', ?, 'CREATE', ?, CURRENT_TIMESTAMP)
        `).run(newPaymentId, JSON.stringify({
          receipt_number: receiptNumber,
          loan_number: loan.loan_number,
          payment_type: finalPaymentType,
          total_amount_paise: totalAmountPaise,
          principal_component_paise: principalPaise,
          interest_component_paise: interestPaise,
          penalty_component_paise: penaltyPaise,
          concession_paise: concessionPaise,
          concession_reason: concessionReason,
          closed_loan: shouldCloseLoan
        }));

        return {
          id: newPaymentId,
          receipt_number: receiptNumber,
          loan_id: loanId,
          loan_number: loan.loan_number,
          payment_date: paymentDate,
          payment_type: finalPaymentType,
          total_amount_paise: totalAmountPaise,
          principal_component_paise: principalPaise,
          interest_component_paise: interestPaise,
          penalty_component_paise: penaltyPaise,
          concession_paise: concessionPaise,
          is_closed: shouldCloseLoan
        };
      });

      const result = recordPaymentTx();
      return { success: true, data: result };
    } catch (error) {
      console.error('[IPC Handler payments:record Error]:', error);
      return { success: false, error: error.message || 'Failed to record payment' };
    }
  });

  /**
   * List payments with date filtering, loan/customer details
   * Channel: 'payments:list'
   */
  ipcMain.handle('payments:list', async (event, filters = {}) => {
    try {
      const db = getDb();
      const startDate = filters.start_date || '';
      const endDate = filters.end_date || '';
      const search = filters.search ? filters.search.trim() : '';

      let sql = `
        SELECT p.id, p.receipt_number, p.payment_date, p.total_amount_paise,
               p.principal_component_paise, p.interest_component_paise, p.penalty_component_paise,
               p.payment_type, p.payment_mode, p.reference_txn_id, p.notes, p.created_at,
               l.id AS loan_id, l.loan_number, l.status AS loan_status,
               c.id AS customer_id, c.customer_code, c.name AS customer_name, c.phone AS customer_phone
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
      if (search) {
        sql += ` AND (p.receipt_number LIKE ? OR l.loan_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)`;
        const p = `%${search}%`;
        params.push(p, p, p, p);
      }

      sql += ` ORDER BY p.id DESC LIMIT 100`;

      const rows = db.prepare(sql).all(...params);
      return { success: true, data: rows };
    } catch (error) {
      console.error('[IPC Handler payments:list Error]:', error);
      return { success: false, error: error.message || 'Failed to list payments' };
    }
  });
}

module.exports = {
  calculateLoanInterestSummary,
  registerPaymentIpcHandlers
};
