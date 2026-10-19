/**
 * Frontend Service for Settings & Database Backups via window.api.settings
 */

export const settingService = {
  getAll: async () => {
    if (!window.api?.settings?.getAll) {
      throw new Error('Settings IPC bridge is not available. Please run inside Electron.');
    }
    const res = await window.api.settings.getAll();
    if (!res.success) {
      throw new Error(res.error || 'Failed to fetch settings');
    }
    return res.data;
  },

  save: async (settingsObj) => {
    if (!window.api?.settings?.save) {
      throw new Error('Settings IPC bridge is not available.');
    }
    const res = await window.api.settings.save(settingsObj);
    if (!res.success) {
      throw new Error(res.error || 'Failed to save settings');
    }
    return res;
  },

  createBackup: async () => {
    if (!window.api?.settings?.createBackup) {
      throw new Error('Settings IPC bridge is not available.');
    }
    const res = await window.api.settings.createBackup();
    if (!res.success) {
      throw new Error(res.error || 'Failed to create database backup');
    }
    return res.data;
  },

  listBackups: async () => {
    if (!window.api?.settings?.listBackups) {
      throw new Error('Settings IPC bridge is not available.');
    }
    const res = await window.api.settings.listBackups();
    if (!res.success) {
      throw new Error(res.error || 'Failed to fetch backup history');
    }
    return res.data;
  },

  verifyIntegrity: async () => {
    if (!window.api?.settings?.verifyIntegrity) {
      throw new Error('Settings IPC bridge is not available.');
    }
    const res = await window.api.settings.verifyIntegrity();
    if (!res.success) {
      throw new Error(res.error || 'Failed to verify database integrity');
    }
    return res.data;
  },

  restoreBackup: async (filepath, confirmed) => {
    if (!window.api?.settings?.restoreBackup) {
      throw new Error('Settings IPC bridge is not available.');
    }
    const res = await window.api.settings.restoreBackup({ filepath, confirmed });
    if (!res.success) {
      throw new Error(res.error || 'Failed to restore database backup');
    }
    return res.data;
  }
};
