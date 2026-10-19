/**
 * Frontend Service for Payments & Settlement via window.api.payments
 */

export const paymentService = {
  getLoanSummary: async (loanId) => {
    if (!window.api?.payments?.getLoanSummary) {
      throw new Error('Payment IPC bridge is not available. Please run inside Electron.');
    }
    const res = await window.api.payments.getLoanSummary(loanId);
    if (!res.success) {
      throw new Error(res.error || 'Failed to fetch loan settlement summary');
    }
    return res.data;
  },

  record: async (paymentPayload) => {
    if (!window.api?.payments?.record) {
      throw new Error('Payment IPC bridge is not available.');
    }
    const res = await window.api.payments.record(paymentPayload);
    if (!res.success) {
      throw new Error(res.error || 'Failed to record payment');
    }
    return res.data;
  },

  list: async (filters = {}) => {
    if (!window.api?.payments?.list) {
      throw new Error('Payment IPC bridge is not available.');
    }
    const res = await window.api.payments.list(filters);
    if (!res.success) {
      throw new Error(res.error || 'Failed to list payments');
    }
    return res.data;
  }
};
