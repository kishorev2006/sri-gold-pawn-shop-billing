/**
 * Frontend Service for Customer Management via window.api.customers
 */

export const customerService = {
  search: async (query = '') => {
    if (!window.api?.customers?.search) {
      throw new Error('Customer IPC bridge is not available. Please run inside Electron.');
    }
    const res = await window.api.customers.search(query);
    if (!res.success) {
      throw new Error(res.error || 'Failed to search customers');
    }
    return res.data;
  },

  getById: async (id) => {
    if (!window.api?.customers?.getById) {
      throw new Error('Customer IPC bridge is not available.');
    }
    const res = await window.api.customers.getById(id);
    if (!res.success) {
      throw new Error(res.error || 'Failed to fetch customer');
    }
    return res.data;
  },

  create: async (customerData) => {
    if (!window.api?.customers?.create) {
      throw new Error('Customer IPC bridge is not available.');
    }
    const res = await window.api.customers.create(customerData);
    if (!res.success) {
      throw new Error(res.error || 'Failed to create customer');
    }
    return res.data;
  },

  update: async (customerData) => {
    if (!window.api?.customers?.update) {
      throw new Error('Customer IPC bridge is not available.');
    }
    const res = await window.api.customers.update(customerData);
    if (!res.success) {
      throw new Error(res.error || 'Failed to update customer');
    }
    return res.message;
  }
};
