const { contextBridge, ipcRenderer } = require('electron');

/**
 * Preload script exposing secure, allowlisted IPC bridge to React renderer.
 * Direct Node.js modules or SQLite instances are NEVER exposed to the window.
 */
contextBridge.exposeInMainWorld('api', {
  database: {
    getStatus: () => ipcRenderer.invoke('db:get-status')
  },
  customers: {
    search: (query) => ipcRenderer.invoke('customers:search', query),
    getById: (id) => ipcRenderer.invoke('customers:get-by-id', id),
    create: (payload) => ipcRenderer.invoke('customers:create', payload),
    update: (payload) => ipcRenderer.invoke('customers:update', payload)
  },
  loans: {
    list: (filters) => ipcRenderer.invoke('loans:list', filters),
    getById: (id) => ipcRenderer.invoke('loans:get-by-id', id),
    create: (payload) => ipcRenderer.invoke('loans:create', payload)
  },
  ornaments: {
    getMaster: () => ipcRenderer.invoke('ornaments:get-master'),
    addCustom: (payload) => ipcRenderer.invoke('ornaments:add-custom', payload)
  },
  payments: {
    getLoanSummary: (loanId) => ipcRenderer.invoke('payments:get-loan-summary', loanId),
    record: (payload) => ipcRenderer.invoke('payments:record', payload),
    list: (filters) => ipcRenderer.invoke('payments:list', filters)
  },
  reports: {
    getDashboardMetrics: () => ipcRenderer.invoke('reports:get-dashboard-metrics'),
    getLoanRegister: (filters) => ipcRenderer.invoke('reports:get-loan-register', filters),
    getCollectionReport: (filters) => ipcRenderer.invoke('reports:get-collection-report', filters),
    getCustomerLedger: (customerId) => ipcRenderer.invoke('reports:get-customer-ledger', customerId)
  },
  settings: {
    getAll: () => ipcRenderer.invoke('settings:get-all'),
    save: (payload) => ipcRenderer.invoke('settings:save', payload),
    createBackup: () => ipcRenderer.invoke('settings:create-backup'),
    listBackups: () => ipcRenderer.invoke('settings:list-backups'),
    verifyIntegrity: () => ipcRenderer.invoke('settings:verify-integrity'),
    restoreBackup: (payload) => ipcRenderer.invoke('settings:restore-backup', payload)
  }
});

