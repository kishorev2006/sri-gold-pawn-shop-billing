/**
 * Frontend Service for Reports and Dashboard via window.api.reports
 */

export const reportService = {
  getDashboardMetrics: async () => {
    if (!window.api?.reports?.getDashboardMetrics) {
      throw new Error('Report IPC bridge is not available. Please run inside Electron.');
    }
    const res = await window.api.reports.getDashboardMetrics();
    if (!res.success) {
      throw new Error(res.error || 'Failed to fetch dashboard metrics');
    }
    return res.data;
  },

  getLoanRegister: async (filters = {}) => {
    if (!window.api?.reports?.getLoanRegister) {
      throw new Error('Report IPC bridge is not available.');
    }
    const res = await window.api.reports.getLoanRegister(filters);
    if (!res.success) {
      throw new Error(res.error || 'Failed to generate loan register');
    }
    return res.data;
  },

  getCollectionReport: async (filters = {}) => {
    if (!window.api?.reports?.getCollectionReport) {
      throw new Error('Report IPC bridge is not available.');
    }
    const res = await window.api.reports.getCollectionReport(filters);
    if (!res.success) {
      throw new Error(res.error || 'Failed to generate collection report');
    }
    return res.data;
  },

  getCustomerLedger: async (customerId) => {
    if (!window.api?.reports?.getCustomerLedger) {
      throw new Error('Report IPC bridge is not available.');
    }
    const res = await window.api.reports.getCustomerLedger(customerId);
    if (!res.success) {
      throw new Error(res.error || 'Failed to fetch customer ledger');
    }
    return res.data;
  }
};
