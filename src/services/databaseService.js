/**
 * React Database Service wrapper over window.api IPC calls.
 */

export const databaseService = {
  async getStatus() {
    if (typeof window !== 'undefined' && window.api && window.api.database) {
      return await window.api.database.getStatus();
    }
    
    // Fallback for isolated browser development testing
    return {
      success: false,
      error: 'Electron IPC bridge (window.api) not detected. Ensure app is launched via Electron.'
    };
  }
};

