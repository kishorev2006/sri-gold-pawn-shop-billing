import React, { useState, useEffect } from 'react';
import { settingService } from '../services/settingService';

export function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  // Form State
  const [shopName, setShopName] = useState('Sri Gold Pawn Shop');
  const [shopTagline, setShopTagline] = useState('Trusted Gold Loan & Pawn Services');
  const [shopPhone, setShopPhone] = useState('9840123456');
  const [shopAddress, setShopAddress] = useState('124, Main Road, Tirunelveli, Tamil Nadu - 627001');
  const [defaultMonthlyRate, setDefaultMonthlyRate] = useState('1.5');
  const [defaultWeeklyRate, setDefaultWeeklyRate] = useState('0.5');
  const [receiptFooterNotes, setReceiptFooterNotes] = useState('Pledged ornaments can be redeemed upon full repayment of principal and accrued interest.');

  // Backups, Restore and Integrity
  const [backups, setBackups] = useState([]);
  const [integrityStatus, setIntegrityStatus] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [selectedBackupForRestore, setSelectedBackupForRestore] = useState(null);
  const [confirmCheckbox, setConfirmCheckbox] = useState(false);

  const loadSettingsAndBackups = async () => {
    setLoading(true);
    setError(null);
    try {
      const [settings, bList] = await Promise.all([
        settingService.getAll(),
        settingService.listBackups()
      ]);

      if (settings) {
        if (settings.shop_name) setShopName(settings.shop_name);
        if (settings.shop_tagline) setShopTagline(settings.shop_tagline);
        if (settings.shop_phone) setShopPhone(settings.shop_phone);
        if (settings.shop_address) setShopAddress(settings.shop_address);
        if (settings.default_monthly_interest_pct) setDefaultMonthlyRate(settings.default_monthly_interest_pct);
        if (settings.default_weekly_interest_pct) setDefaultWeeklyRate(settings.default_weekly_interest_pct);
        if (settings.receipt_footer_notes) setReceiptFooterNotes(settings.receipt_footer_notes);
      }

      setBackups(bList || []);
    } catch (err) {
      console.error('Failed to load settings:', err);
      setError(err.message || 'Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettingsAndBackups();
  }, []);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    setError(null);
    try {
      await settingService.save({
        shop_name: shopName,
        shop_tagline: shopTagline,
        shop_phone: shopPhone,
        shop_address: shopAddress,
        default_monthly_interest_pct: defaultMonthlyRate,
        default_weekly_interest_pct: defaultWeeklyRate,
        receipt_footer_notes: receiptFooterNotes
      });
      setMsg('Settings saved successfully!');
    } catch (err) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateBackup = async () => {
    setBackingUp(true);
    setMsg(null);
    setError(null);
    try {
      const res = await settingService.createBackup();
      setMsg(`Database backed up successfully! File: ${res.filename} (${(res.size_bytes / 1024).toFixed(1)} KB)`);
      const bList = await settingService.listBackups();
      setBackups(bList || []);
    } catch (err) {
      setError(err.message || 'Backup failed');
    } finally {
      setBackingUp(false);
    }
  };

  const handleVerifyIntegrity = async () => {
    setVerifying(true);
    setError(null);
    try {
      const res = await settingService.verifyIntegrity();
      setIntegrityStatus(res);
    } catch (err) {
      setError(err.message || 'Integrity check failed');
    } finally {
      setVerifying(false);
    }
  };

  const handleExecuteRestore = async () => {
    if (!selectedBackupForRestore) return;
    if (!confirmCheckbox) {
      alert('Please check the confirmation box before proceeding with restore.');
      return;
    }
    setRestoring(true);
    setMsg(null);
    setError(null);
    try {
      await settingService.restoreBackup(selectedBackupForRestore.filepath, true);
      setMsg(`Database successfully restored from ${selectedBackupForRestore.filename}! Safety pre-restore backup created.`);
      setSelectedBackupForRestore(null);
      setConfirmCheckbox(false);
      await loadSettingsAndBackups();
    } catch (err) {
      setError(err.message || 'Database restore failed');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">Shop Settings & Database Maintenance</h2>
        <p className="page-subtitle">Configure business profile, interest defaults, WAL database backups, and health verification</p>
      </div>

      {msg && (
        <div className="alert" style={{ backgroundColor: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', marginBottom: '1.25rem' }}>
          {msg}
        </div>
      )}

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '1.25rem' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1.5rem' }}>
        {/* Settings Form */}
        <div className="card">
          <h3 className="card-title">Shop Profile & Business Defaults</h3>
          <form onSubmit={handleSaveSettings}>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Shop Name *</label>
              <input
                type="text"
                className="form-control"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Shop Tagline</label>
              <input
                type="text"
                className="form-control"
                value={shopTagline}
                onChange={(e) => setShopTagline(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Contact Phone</label>
                <input
                  type="text"
                  className="form-control"
                  value={shopPhone}
                  onChange={(e) => setShopPhone(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Default Monthly Interest %</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  value={defaultMonthlyRate}
                  onChange={(e) => setDefaultMonthlyRate(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Default Weekly Interest %</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  value={defaultWeeklyRate}
                  onChange={(e) => setDefaultWeeklyRate(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Shop Address</label>
              <textarea
                className="form-control"
                rows="2"
                value={shopAddress}
                onChange={(e) => setShopAddress(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="form-label">Receipt Header / Terms Footer Note</label>
              <textarea
                className="form-control"
                rows="2"
                value={receiptFooterNotes}
                onChange={(e) => setReceiptFooterNotes(e.target.value)}
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={saving || loading}>
              {saving ? 'Saving...' : '💾 Save Settings'}
            </button>
          </form>
        </div>

        {/* Database Backup & Health Maintenance */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Instant Backup Card */}
          <div className="card">
            <h3 className="card-title">Database Backup (WAL-Safe)</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Captures a complete, consistent snapshot of the active SQLite database and all uncheckpointed WAL transactions.
            </p>

            <button
              className="btn btn-primary"
              style={{ width: '100%', marginBottom: '1rem' }}
              onClick={handleCreateBackup}
              disabled={backingUp}
            >
              {backingUp ? 'Creating Backup...' : '📦 Create Instant Database Backup'}
            </button>

            <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
              {backups.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0.5rem' }}>
                  No previous backups recorded.
                </div>
              ) : (
                <div style={{ fontSize: '0.8rem' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
                    Recent Backup Snapshots ({backups.length})
                  </div>
                  {backups.slice(0, 5).map((b) => (
                    <div key={b.id} style={{ padding: '0.4rem 0', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ maxWidth: '65%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 500 }} title={b.filepath}>{b.filename}</span>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{(b.size_bytes / 1024).toFixed(0)} KB | {b.status}</div>
                      </div>
                      <button
                        className="btn btn-sm btn-outline"
                        style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                        onClick={() => { setSelectedBackupForRestore(b); setConfirmCheckbox(false); }}
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Database Health & Integrity Verification */}
          <div className="card">
            <h3 className="card-title">Data Integrity Check</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Executes PRAGMA integrity_check and PRAGMA foreign_key_check to verify database b-trees and relational references.
            </p>

            <button
              className="btn btn-secondary"
              style={{ width: '100%', marginBottom: '1rem' }}
              onClick={handleVerifyIntegrity}
              disabled={verifying}
            >
              {verifying ? 'Checking...' : '🛡 Run SQLite Integrity Verification'}
            </button>

            {integrityStatus && (
              <div style={{ backgroundColor: integrityStatus.healthy ? '#dcfce7' : '#fee2e2', padding: '0.75rem', borderRadius: '6px', fontSize: '0.85rem' }}>
                <div style={{ fontWeight: 600, color: integrityStatus.healthy ? '#166534' : '#991b1b' }}>
                  {integrityStatus.healthy ? '✔ Database is 100% Healthy' : '✖ Issues Detected'}
                </div>
                <div style={{ marginTop: '0.25rem', color: '#334155' }}>
                  Integrity Check: {integrityStatus.integrity} | Foreign Keys: {integrityStatus.foreign_keys}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Restore Confirmation Modal */}
      {selectedBackupForRestore && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h3 style={{ color: '#b91c1c' }}>⚠ Confirm Database Restore</h3>
              <button className="close-btn" onClick={() => !restoring && setSelectedBackupForRestore(null)}>&times;</button>
            </div>
            <div className="modal-body" style={{ padding: '1.25rem' }}>
              <div className="alert alert-danger" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
                <strong>CRITICAL WARNING:</strong> Restoring this backup will replace the live database with data from snapshot:
                <div style={{ marginTop: '4px', fontFamily: 'monospace', fontWeight: 600 }}>{selectedBackupForRestore.filename}</div>
                Any transactions, loans, or payments recorded after this snapshot will be replaced.
              </div>

              <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '1rem' }}>
                A safety pre-restore backup of the current database will be created automatically before restore. If anything goes wrong, changes will be rolled back.
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '1rem', backgroundColor: '#f8fafc', padding: '0.75rem', borderRadius: '6px' }}>
                <input
                  type="checkbox"
                  id="restoreCheck"
                  checked={confirmCheckbox}
                  onChange={(e) => setConfirmCheckbox(e.target.checked)}
                  style={{ width: '18px', height: '18px', marginTop: '2px', cursor: 'pointer' }}
                />
                <label htmlFor="restoreCheck" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b', cursor: 'pointer' }}>
                  I understand newer data may be replaced and confirm restoring this backup.
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={restoring}
                onClick={() => setSelectedBackupForRestore(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={restoring || !confirmCheckbox}
                onClick={handleExecuteRestore}
              >
                {restoring ? 'Restoring & Verifying...' : 'Restore Database'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
