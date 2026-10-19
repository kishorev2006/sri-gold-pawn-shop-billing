/**
 * Frontend Service for Loan Management via window.api.loans & window.api.ornaments
 */

export const loanService = {
  list: async (filters = {}) => {
    if (!window.api?.loans?.list) {
      throw new Error('Loan IPC bridge is not available. Please run inside Electron.');
    }
    const res = await window.api.loans.list(filters);
    if (!res.success) {
      throw new Error(res.error || 'Failed to fetch loans');
    }
    return res.data;
  },

  getById: async (id) => {
    if (!window.api?.loans?.getById) {
      throw new Error('Loan IPC bridge is not available.');
    }
    const res = await window.api.loans.getById(id);
    if (!res.success) {
      throw new Error(res.error || 'Failed to fetch loan details');
    }
    return res.data;
  },

  create: async (loanPayload) => {
    if (!window.api?.loans?.create) {
      throw new Error('Loan IPC bridge is not available.');
    }
    const res = await window.api.loans.create(loanPayload);
    if (!res.success) {
      throw new Error(res.error || 'Failed to create loan');
    }
    return res.data;
  },

  getOrnamentsMaster: async () => {
    if (!window.api?.ornaments?.getMaster) {
      throw new Error('Ornament master IPC bridge is not available.');
    }
    const res = await window.api.ornaments.getMaster();
    if (!res.success) {
      throw new Error(res.error || 'Failed to fetch ornament master');
    }
    return res.data;
  },

  addCustomOrnament: async (ornamentPayload) => {
    if (!window.api?.ornaments?.addCustom) {
      throw new Error('Ornament add custom IPC bridge is not available.');
    }
    const res = await window.api.ornaments.addCustom(ornamentPayload);
    if (!res.success) {
      throw new Error(res.error || 'Failed to add custom ornament');
    }
    return res.data;
  }
};
