/**
 * Customer IPC Handlers for Sri Gold Pawn Shop Billing.
 * Validates all inputs in the Electron main process, generates monotonic
 * customer codes via getNextSequence, and executes queries securely via better-sqlite3.
 */

const { ipcMain } = require('electron');
const { getDb } = require('../database/connection');
const { getNextSequence } = require('../database/schema');

function registerCustomerIpcHandlers() {
  /**
   * Search customers by query string (matches name, phone, or customer_code)
   * Channel: 'customers:search'
   */
  ipcMain.handle('customers:search', async (event, query = '') => {
    try {
      const db = getDb();
      const sanitized = (typeof query === 'string' ? query.trim() : '');

      if (!sanitized) {
        // Return latest 50 active customers if query is blank
        const customers = db.prepare(`
          SELECT id, customer_code, name, phone, alternate_phone, address, city, id_proof_type, id_proof_number, created_at
          FROM customers
          WHERE is_active = 1
          ORDER BY id DESC
          LIMIT 50
        `).all();

        return { success: true, data: customers };
      }

      const pattern = `%${sanitized}%`;
      const customers = db.prepare(`
        SELECT id, customer_code, name, phone, alternate_phone, address, city, id_proof_type, id_proof_number, created_at
        FROM customers
        WHERE is_active = 1
          AND (name LIKE ? OR phone LIKE ? OR customer_code LIKE ?)
        ORDER BY id DESC
        LIMIT 50
      `).all(pattern, pattern, pattern);

      return { success: true, data: customers };
    } catch (error) {
      console.error('[IPC Handler customers:search Error]:', error);
      return { success: false, error: error.message || 'Failed to search customers' };
    }
  });

  /**
   * Get customer details by ID with active loans count and loan summary
   * Channel: 'customers:get-by-id'
   */
  ipcMain.handle('customers:get-by-id', async (event, customerId) => {
    try {
      const id = parseInt(customerId, 10);
      if (!id || id <= 0) {
        return { success: false, error: 'Valid Customer ID is required' };
      }

      const db = getDb();
      const customer = db.prepare(`
        SELECT id, customer_code, name, phone, alternate_phone, address, city, id_proof_type, id_proof_number, photo_path, is_active, created_at, updated_at
        FROM customers
        WHERE id = ?
      `).get(id);

      if (!customer) {
        return { success: false, error: 'Customer not found' };
      }

      // Fetch customer loans
      const loans = db.prepare(`
        SELECT id, loan_number, loan_date, principal_amount_paise, monthly_interest_rate_pct, due_date, status, total_gross_weight_mg, total_net_weight_mg, total_item_count
        FROM loans
        WHERE customer_id = ?
        ORDER BY id DESC
      `).all(id);

      return {
        success: true,
        data: {
          ...customer,
          loans
        }
      };
    } catch (error) {
      console.error('[IPC Handler customers:get-by-id Error]:', error);
      return { success: false, error: error.message || 'Failed to fetch customer details' };
    }
  });

  /**
   * Create a new customer with auto-generated monotonic customer code
   * Channel: 'customers:create'
   */
  ipcMain.handle('customers:create', async (event, payload = {}) => {
    try {
      const db = getDb();

      // Input Validation
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      const phone = typeof payload.phone === 'string' ? payload.phone.trim() : '';
      const alternatePhone = typeof payload.alternate_phone === 'string' ? payload.alternate_phone.trim() : null;
      const address = typeof payload.address === 'string' ? payload.address.trim() : null;
      const city = typeof payload.city === 'string' && payload.city.trim() ? payload.city.trim() : null;
      const idProofType = typeof payload.id_proof_type === 'string' ? payload.id_proof_type.trim().toUpperCase() : null;
      const idProofNumber = typeof payload.id_proof_number === 'string' ? payload.id_proof_number.trim() : null;

      if (!name || name.length < 2) {
        return { success: false, error: 'Customer name is required and must be at least 2 characters' };
      }

      if (!phone || !/^\d{10}$/.test(phone)) {
        return { success: false, error: 'A valid 10-digit mobile number is required' };
      }

      if (alternatePhone && !/^\d{10}$/.test(alternatePhone)) {
        return { success: false, error: 'Alternate phone number must be a valid 10-digit number' };
      }

      const validProofTypes = ['AADHAAR', 'PAN', 'VOTER_ID', 'DRIVING_LICENSE', 'RATION_CARD', 'OTHER'];
      if (idProofType && !validProofTypes.includes(idProofType)) {
        return { success: false, error: `Invalid ID proof type. Allowed: ${validProofTypes.join(', ')}` };
      }

      // Check if phone number already exists among active customers
      const existingPhone = db.prepare(`
        SELECT id, customer_code, name FROM customers WHERE phone = ? AND is_active = 1
      `).get(phone);

      if (existingPhone) {
        return {
          success: false,
          error: `A customer with this phone number already exists (${existingPhone.customer_code} - ${existingPhone.name})`
        };
      }

      // Atomic customer creation in single transaction
      const createTx = db.transaction(() => {
        const customerCode = getNextSequence(db, 'customer');

        const insert = db.prepare(`
          INSERT INTO customers (
            customer_code, name, phone, alternate_phone, address, city,
            id_proof_type, id_proof_number, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(customerCode, name, phone, alternatePhone, address, city, idProofType, idProofNumber);

        const newId = insert.lastInsertRowid;

        // Audit log
        db.prepare(`
          INSERT INTO audit_logs (entity_type, entity_id, action, details_json)
          VALUES ('customer', ?, 'CREATE', ?)
        `).run(newId, JSON.stringify({ customer_code: customerCode, name, phone }));

        return {
          id: newId,
          customer_code: customerCode,
          name,
          phone,
          alternate_phone: alternatePhone,
          address,
          city,
          id_proof_type: idProofType,
          id_proof_number: idProofNumber
        };
      });

      const newCustomer = createTx();
      return { success: true, data: newCustomer };
    } catch (error) {
      console.error('[IPC Handler customers:create Error]:', error);
      return { success: false, error: error.message || 'Failed to create customer' };
    }
  });

  /**
   * Update an existing customer
   * Channel: 'customers:update'
   */
  ipcMain.handle('customers:update', async (event, payload = {}) => {
    try {
      const id = parseInt(payload.id, 10);
      if (!id || id <= 0) {
        return { success: false, error: 'Valid customer ID is required for update' };
      }

      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      const phone = typeof payload.phone === 'string' ? payload.phone.trim() : '';
      const alternatePhone = typeof payload.alternate_phone === 'string' ? payload.alternate_phone.trim() : null;
      const address = typeof payload.address === 'string' ? payload.address.trim() : null;
      const city = typeof payload.city === 'string' && payload.city.trim() ? payload.city.trim() : null;
      const idProofType = typeof payload.id_proof_type === 'string' ? payload.id_proof_type.trim().toUpperCase() : null;
      const idProofNumber = typeof payload.id_proof_number === 'string' ? payload.id_proof_number.trim() : null;

      if (!name || name.length < 2) {
        return { success: false, error: 'Customer name is required' };
      }

      if (!phone || !/^\d{10}$/.test(phone)) {
        return { success: false, error: 'A valid 10-digit mobile number is required' };
      }

      const db = getDb();

      // Check duplicate phone with another customer
      const duplicatePhone = db.prepare(`
        SELECT id, customer_code FROM customers WHERE phone = ? AND id != ? AND is_active = 1
      `).get(phone, id);

      if (duplicatePhone) {
        return { success: false, error: `Phone number is already associated with another customer (${duplicatePhone.customer_code})` };
      }

      const updateTx = db.transaction(() => {
        db.prepare(`
          UPDATE customers
          SET name = ?, phone = ?, alternate_phone = ?, address = ?, city = ?,
              id_proof_type = ?, id_proof_number = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(name, phone, alternatePhone, address, city, idProofType, idProofNumber, id);

        db.prepare(`
          INSERT INTO audit_logs (entity_type, entity_id, action, details_json)
          VALUES ('customer', ?, 'UPDATE', ?)
        `).run(id, JSON.stringify({ name, phone }));
      });

      updateTx();
      return { success: true, message: 'Customer updated successfully' };
    } catch (error) {
      console.error('[IPC Handler customers:update Error]:', error);
      return { success: false, error: error.message || 'Failed to update customer' };
    }
  });
}

module.exports = {
  registerCustomerIpcHandlers
};
