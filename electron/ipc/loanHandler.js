/**
 * Loan & Ornament IPC Handlers for Sri Gold Pawn Shop Billing.
 * Validates loan input, custom ornaments, flexible weekly/monthly interest,
 * and admin-selected maturity dates. Creates loans atomically along with items.
 */

const { ipcMain } = require('electron');
const { getDb } = require('../database/connection');
const { getNextSequence } = require('../database/schema');

function registerLoanIpcHandlers() {
  /**
   * Get ornament master items for dropdown selections
   * Channel: 'ornaments:get-master'
   */
  ipcMain.handle('ornaments:get-master', async () => {
    try {
      const db = getDb();
      const ornaments = db.prepare(`
        SELECT id, name, category, default_purity
        FROM ornament_master
        WHERE is_active = 1
        ORDER BY name ASC
      `).all();

      return { success: true, data: ornaments };
    } catch (error) {
      console.error('[IPC Handler ornaments:get-master Error]:', error);
      return { success: false, error: error.message || 'Failed to fetch ornament master' };
    }
  });

  /**
   * Add a custom ornament permanently to ornament_master
   * Channel: 'ornaments:add-custom'
   */
  ipcMain.handle('ornaments:add-custom', async (event, payload = {}) => {
    try {
      const rawName = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!rawName || rawName.length < 2) {
        return { success: false, error: 'Ornament name is required (minimum 2 characters)' };
      }

      // Title case format
      const formattedName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
      const defaultPurity = typeof payload.default_purity === 'string' && payload.default_purity ? payload.default_purity.trim().toUpperCase() : '22K';
      const category = typeof payload.category === 'string' && payload.category ? payload.category.trim().toUpperCase() : 'GOLD';

      const db = getDb();

      // Check if ornament already exists (case-insensitive)
      const existing = db.prepare(`
        SELECT id, name, default_purity, is_active FROM ornament_master WHERE LOWER(name) = LOWER(?)
      `).get(formattedName);

      if (existing) {
        if (existing.is_active === 1) {
          return {
            success: false,
            error: `Ornament '${existing.name}' already exists in master list.`
          };
        } else {
          // Reactivate if previously deactivated
          db.prepare(`UPDATE ornament_master SET is_active = 1, default_purity = ? WHERE id = ?`).run(defaultPurity, existing.id);
          return {
            success: true,
            data: { id: existing.id, name: existing.name, default_purity: defaultPurity, category }
          };
        }
      }

      const insert = db.prepare(`
        INSERT INTO ornament_master (name, category, default_purity, is_active, created_at)
        VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
      `).run(formattedName, category, defaultPurity);

      return {
        success: true,
        data: {
          id: insert.lastInsertRowid,
          name: formattedName,
          category,
          default_purity: defaultPurity
        }
      };
    } catch (error) {
      console.error('[IPC Handler ornaments:add-custom Error]:', error);
      return { success: false, error: error.message || 'Failed to add custom ornament' };
    }
  });

  /**
   * List loans with customer details and status filter
   * Channel: 'loans:list'
   */
  ipcMain.handle('loans:list', async (event, filters = {}) => {
    try {
      const db = getDb();
      const status = typeof filters.status === 'string' && filters.status ? filters.status : null;
      const search = typeof filters.search === 'string' ? filters.search.trim() : '';

      const today = new Date().toISOString().split('T')[0];

      let sql = `
        SELECT l.id, l.loan_number, l.loan_type, l.loan_date, COALESCE(l.pledge_date, l.loan_date) AS pledge_date,
               l.principal_amount_paise, l.monthly_interest_rate_pct,
               COALESCE(l.interest_type, 'MONTHLY') AS interest_type,
               COALESCE(l.interest_duration, l.term_months) AS interest_duration,
               l.term_months, l.due_date, COALESCE(l.maturity_date, l.due_date) AS maturity_date,
               CASE 
                 WHEN l.status = 'ACTIVE' AND COALESCE(l.maturity_date, l.due_date) IS NOT NULL AND COALESCE(l.maturity_date, l.due_date) < ? THEN 1
                 ELSE 0
               END AS is_overdue,
               l.status,
               l.total_gross_weight_mg, l.total_net_weight_mg, l.total_item_count,
               l.appraised_market_value_paise, l.notes, l.created_at,
               c.id AS customer_id, c.customer_code, c.name AS customer_name, c.phone AS customer_phone
        FROM loans l
        JOIN customers c ON l.customer_id = c.id
        WHERE 1=1
      `;
      const params = [today];

      if (status) {
        if (status === 'OVERDUE') {
          // Special virtual filter for overdue active loans
          sql += ` AND l.status = 'ACTIVE' AND COALESCE(l.maturity_date, l.due_date) IS NOT NULL AND COALESCE(l.maturity_date, l.due_date) < ?`;
          params.push(today);
        } else {
          sql += ` AND l.status = ?`;
          params.push(status);
        }
      }

      if (search) {
        sql += ` AND (l.loan_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR c.customer_code LIKE ?)`;
        const p = `%${search}%`;
        params.push(p, p, p, p);
      }

      sql += ` ORDER BY l.id DESC LIMIT 100`;

      const loans = db.prepare(sql).all(...params);
      return { success: true, data: loans };
    } catch (error) {
      console.error('[IPC Handler loans:list Error]:', error);
      return { success: false, error: error.message || 'Failed to fetch loans' };
    }
  });

  /**
   * Get complete loan details by ID including all pledged ornaments
   * Channel: 'loans:get-by-id'
   */
  ipcMain.handle('loans:get-by-id', async (event, loanId) => {
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
               CASE 
                 WHEN l.status = 'ACTIVE' AND COALESCE(l.maturity_date, l.due_date) < ? THEN 1
                 ELSE 0
               END AS is_overdue,
               c.customer_code, c.name AS customer_name, c.phone AS customer_phone, c.address AS customer_address
        FROM loans l
        JOIN customers c ON l.customer_id = c.id
        WHERE l.id = ?
      `).get(today, id);

      if (!loan) {
        return { success: false, error: 'Loan not found' };
      }

      const items = db.prepare(`
        SELECT id, ornament_type, description, item_count, gross_weight_mg, stone_weight_mg, net_weight_mg, purity, estimated_value_paise
        FROM loan_items
        WHERE loan_id = ?
        ORDER BY id ASC
      `).all(id);

      const payments = db.prepare(`
        SELECT id, receipt_number, payment_date, total_amount_paise, principal_component_paise, interest_component_paise, penalty_component_paise, payment_mode
        FROM payments
        WHERE loan_id = ?
        ORDER BY id DESC
      `).all(id);

      return {
        success: true,
        data: {
          ...loan,
          items,
          payments
        }
      };
    } catch (error) {
      console.error('[IPC Handler loans:get-by-id Error]:', error);
      return { success: false, error: error.message || 'Failed to fetch loan details' };
    }
  });

  /**
   * Create a new loan with multi-item pledged ornaments in a single atomic transaction.
   * Supports WEEKLY / MONTHLY interest and admin-defined maturity date.
   * Channel: 'loans:create'
   */
  ipcMain.handle('loans:create', async (event, payload = {}) => {
    try {
      const db = getDb();

      // 1. Validate Customer
      const customerId = parseInt(payload.customer_id, 10);
      if (!customerId || customerId <= 0) {
        return { success: false, error: 'A valid customer must be selected' };
      }

      const customer = db.prepare(`SELECT id, customer_code, name FROM customers WHERE id = ? AND is_active = 1`).get(customerId);
      if (!customer) {
        return { success: false, error: 'Selected customer not found or inactive' };
      }

      // 2. Validate Monetary values (Convert Rupees to Integer Paise)
      const principalPaise = parseInt(payload.principal_amount_paise, 10);
      if (isNaN(principalPaise) || principalPaise <= 0) {
        return { success: false, error: 'Principal amount must be greater than zero' };
      }

      // 3. Validate Interest Type & Rate
      const rawInterestType = typeof payload.interest_type === 'string' ? payload.interest_type.trim().toUpperCase() : 'MONTHLY';
      if (!['WEEKLY', 'MONTHLY'].includes(rawInterestType)) {
        return { success: false, error: "Interest type must be either 'WEEKLY' or 'MONTHLY'" };
      }
      const interestType = rawInterestType;

      const interestRatePct = parseFloat(payload.monthly_interest_rate_pct);
      if (isNaN(interestRatePct) || interestRatePct < 0) {
        return { success: false, error: 'Interest rate percentage must be a non-negative number' };
      }

      // Basis points: e.g. 1.5% = 150 basis points (rate * 100)
      const basisPoints = Math.round(interestRatePct * 100);

      // Interest Duration (Weeks or Months)
      const interestDuration = parseInt(payload.interest_duration, 10);
      if (isNaN(interestDuration) || interestDuration <= 0) {
        return { success: false, error: `Interest duration (${interestType === 'WEEKLY' ? 'weeks' : 'months'}) must be a positive integer` };
      }

      // Term months for backwards compatibility with reporting
      const termMonths = interestType === 'WEEKLY' ? Math.max(1, Math.round(interestDuration / 4)) : interestDuration;

      // 4. Validate Loan Type & Dates
      const rawLoanType = typeof payload.loan_type === 'string' ? payload.loan_type.trim().toUpperCase() : 'FIXED';
      if (!['FIXED', 'OPEN'].includes(rawLoanType)) {
        return { success: false, error: "Loan type must be either 'FIXED' or 'OPEN'" };
      }
      const loanType = rawLoanType;

      const pledgeDate = typeof payload.pledge_date === 'string' && payload.pledge_date ? payload.pledge_date.trim() : (payload.loan_date || new Date().toISOString().split('T')[0]);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(pledgeDate)) {
        return { success: false, error: 'Pledge date must be in YYYY-MM-DD format' };
      }

      // Handle due date and maturity date based on loan type
      const providedDueDate = (typeof payload.due_date === 'string' && payload.due_date.trim()) || 
                              (typeof payload.maturity_date === 'string' && payload.maturity_date.trim()) || null;

      let effectiveDueDate = null;
      let maturityDate = null;

      if (loanType === 'FIXED') {
        if (!providedDueDate) {
          return { success: false, error: 'A valid due date is required for FIXED loans' };
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(providedDueDate)) {
          return { success: false, error: 'Due date must be in YYYY-MM-DD format' };
        }
        if (providedDueDate < pledgeDate) {
          return { success: false, error: 'Due date cannot be earlier than the pledge date' };
        }
        effectiveDueDate = providedDueDate;
        maturityDate = providedDueDate;
      } else {
        // OPEN loan: due date can be null
        if (providedDueDate) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(providedDueDate)) {
            return { success: false, error: 'Due date must be in YYYY-MM-DD format' };
          }
          if (providedDueDate < pledgeDate) {
            return { success: false, error: 'Due date cannot be earlier than the pledge date' };
          }
          effectiveDueDate = providedDueDate;
          maturityDate = providedDueDate;
        } else {
          effectiveDueDate = null;
          maturityDate = null;
        }
      }

      // 5. Validate Pledged Ornaments
      const rawItems = Array.isArray(payload.items) ? payload.items : [];
      if (rawItems.length === 0) {
        return { success: false, error: 'At least one pledged gold ornament item is required' };
      }

      const validatedItems = [];
      let totalGrossWeightMg = 0;
      let totalNetWeightMg = 0;
      let totalItemCount = 0;
      let totalAppraisedValuePaise = 0;

      for (let i = 0; i < rawItems.length; i++) {
        const item = rawItems[i];
        const ornamentType = typeof item.ornament_type === 'string' ? item.ornament_type.trim() : '';
        if (!ornamentType) {
          return { success: false, error: `Item #${i + 1}: Ornament type is required` };
        }

        const count = parseInt(item.item_count, 10) || 1;
        if (count <= 0) {
          return { success: false, error: `Item #${i + 1}: Item quantity must be at least 1` };
        }

        const grossMg = parseInt(item.gross_weight_mg, 10);
        if (isNaN(grossMg) || grossMg <= 0) {
          return { success: false, error: `Item #${i + 1}: Gross weight must be greater than 0` };
        }

        const stoneMg = parseInt(item.stone_weight_mg, 10) || 0;
        if (stoneMg < 0) {
          return { success: false, error: `Item #${i + 1}: Stone weight cannot be negative` };
        }

        if (stoneMg >= grossMg) {
          return { success: false, error: `Item #${i + 1}: Stone weight cannot equal or exceed gross weight` };
        }

        const netMg = grossMg - stoneMg;
        const purity = typeof item.purity === 'string' && item.purity ? item.purity.trim().toUpperCase() : '22K';
        const estimatedValuePaise = parseInt(item.estimated_value_paise, 10) || 0;

        totalGrossWeightMg += grossMg;
        totalNetWeightMg += netMg;
        totalItemCount += count;
        totalAppraisedValuePaise += estimatedValuePaise;

        validatedItems.push({
          ornament_type: ornamentType,
          description: typeof item.description === 'string' ? item.description.trim() : '',
          item_count: count,
          gross_weight_mg: grossMg,
          stone_weight_mg: stoneMg,
          net_weight_mg: netMg,
          purity,
          estimated_value_paise: estimatedValuePaise
        });
      }

      const notes = typeof payload.notes === 'string' ? payload.notes.trim() : null;

      // 6. Execute atomic transaction (loan + items + sequence + history)
      const createLoanTx = db.transaction(() => {
        // Monotonic sequence number
        const loanNumber = getNextSequence(db, 'loan');

        // Insert Loan master
        const insertLoan = db.prepare(`
          INSERT INTO loans (
            loan_number, customer_id, loan_type, loan_date, pledge_date, principal_amount_paise,
            monthly_interest_rate_basis_points, monthly_interest_rate_pct,
            interest_type, interest_duration,
            term_months, due_date, maturity_date, status, total_gross_weight_mg, total_net_weight_mg,
            total_item_count, appraised_market_value_paise, notes,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(
          loanNumber,
          customerId,
          loanType,
          pledgeDate,
          pledgeDate,
          principalPaise,
          basisPoints,
          interestRatePct,
          interestType,
          interestDuration,
          termMonths,
          effectiveDueDate,
          maturityDate,
          totalGrossWeightMg,
          totalNetWeightMg,
          totalItemCount,
          totalAppraisedValuePaise,
          notes
        );

        const newLoanId = insertLoan.lastInsertRowid;

        // Insert Loan items
        const insertItem = db.prepare(`
          INSERT INTO loan_items (
            loan_id, ornament_type, description, item_count, gross_weight_mg,
            stone_weight_mg, net_weight_mg, purity, estimated_value_paise, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);

        for (const it of validatedItems) {
          insertItem.run(
            newLoanId,
            it.ornament_type,
            it.description,
            it.item_count,
            it.gross_weight_mg,
            it.stone_weight_mg,
            it.net_weight_mg,
            it.purity,
            it.estimated_value_paise
          );
        }

        // Record initial status history
        db.prepare(`
          INSERT INTO loan_status_history (loan_id, previous_status, new_status, reason, changed_at)
          VALUES (?, NULL, 'ACTIVE', 'Initial loan creation', CURRENT_TIMESTAMP)
        `).run(newLoanId);

        // Audit log
        db.prepare(`
          INSERT INTO audit_logs (entity_type, entity_id, action, details_json, created_at)
          VALUES ('loan', ?, 'CREATE', ?, CURRENT_TIMESTAMP)
        `).run(newLoanId, JSON.stringify({
          loan_number: loanNumber,
          customer_code: customer.customer_code,
          loan_type: loanType,
          principal_amount_paise: principalPaise,
          interest_type: interestType,
          interest_rate_pct: interestRatePct,
          interest_duration: interestDuration,
          due_date: effectiveDueDate,
          maturity_date: maturityDate,
          items_count: validatedItems.length
        }));

        return {
          id: newLoanId,
          loan_number: loanNumber,
          customer_id: customerId,
          customer_name: customer.name,
          customer_code: customer.customer_code,
          loan_type: loanType,
          principal_amount_paise: principalPaise,
          interest_type: interestType,
          interest_duration: interestDuration,
          pledge_date: pledgeDate,
          due_date: effectiveDueDate,
          maturity_date: maturityDate,
          total_gross_weight_mg: totalGrossWeightMg,
          total_net_weight_mg: totalNetWeightMg,
          items_count: validatedItems.length
        };
      });

      const createdLoan = createLoanTx();
      return { success: true, data: createdLoan };
    } catch (error) {
      console.error('[IPC Handler loans:create Error]:', error);
      return { success: false, error: error.message || 'Failed to create loan' };
    }
  });
}

module.exports = {
  registerLoanIpcHandlers
};
