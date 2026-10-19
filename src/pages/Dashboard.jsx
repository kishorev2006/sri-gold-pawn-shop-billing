import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { reportService } from '../services/reportService';
import { databaseService } from '../services/databaseService';

export function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [dbStatus, setDbStatus] = useState(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, db] = await Promise.all([
        reportService.getDashboardMetrics(),
        databaseService.getStatus()
      ]);
      setMetrics(m);
      setDbStatus(db.data);
    } catch (err) {
      console.error('Failed to load dashboard metrics:', err);
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatRupees = (paise) => {
    if (!paise && paise !== 0) return '₹0.00';
    return '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="page-title">Shop Dashboard</h2>
          <p className="page-subtitle">Real-time gold loan metrics, overdue tracking, and collections</p>
        </div>
        <button className="btn btn-secondary" onClick={loadData} disabled={loading}>
          {loading ? 'Refreshing...' : '🔄 Refresh Data'}
        </button>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}

      {/* Top Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid var(--primary-color)', margin: 0 }}>
          <div className="info-label">Active Loans</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-dark)', marginTop: '0.25rem' }}>
            {loading ? '...' : metrics?.totalActiveLoans ?? 0}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            {metrics?.totalClosedLoans ?? 0} Settled / Closed
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #ef4444', margin: 0 }}>
          <div className="info-label" style={{ color: '#b91c1c' }}>Overdue Loans</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#b91c1c', marginTop: '0.25rem' }}>
            {loading ? '...' : metrics?.totalOverdueLoans ?? 0}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Maturity date elapsed
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #10b981', margin: 0 }}>
          <div className="info-label">Principal Outstanding</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-dark)', marginTop: '0.25rem' }}>
            {loading ? '...' : formatRupees(metrics?.totalPrincipalOutstandingPaise ?? 0)}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Total active book
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #3b82f6', margin: 0 }}>
          <div className="info-label">Today's Collections</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#1d4ed8', marginTop: '0.25rem' }}>
            {loading ? '...' : formatRupees(metrics?.todayCollections?.totalPaise ?? 0)}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            {metrics?.todayCollections?.count ?? 0} receipt(s) today
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #8b5cf6', margin: 0 }}>
          <div className="info-label">Registered Customers</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-dark)', marginTop: '0.25rem' }}>
            {loading ? '...' : metrics?.totalCustomers ?? 0}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Active customer base
          </div>
        </div>
      </div>

      {/* Recent Loans & Recent Payments Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* Recent Loans */}
        <div className="card" style={{ margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 className="card-title" style={{ margin: 0 }}>Recent Gold Loans</h3>
            <button className="btn btn-outline btn-sm" onClick={() => navigate('/loans')}>
              View All
            </button>
          </div>


          {metrics?.recentLoans?.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No loans created yet.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.5rem' }}>Loan No</th>
                    <th style={{ padding: '0.5rem' }}>Customer</th>
                    <th style={{ padding: '0.5rem' }}>Principal</th>
                    <th style={{ padding: '0.5rem' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics?.recentLoans?.map((l) => (
                    <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.6rem 0.5rem', fontWeight: 600 }}>{l.loan_number}</td>
                      <td style={{ padding: '0.6rem 0.5rem' }}>
                        <div>{l.customer_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{l.customer_phone}</div>
                      </td>
                      <td style={{ padding: '0.6rem 0.5rem', fontWeight: 600 }}>
                        {formatRupees(l.principal_amount_paise)}
                      </td>
                      <td style={{ padding: '0.6rem 0.5rem' }}>
                        <span className={`badge ${l.status === 'ACTIVE' ? 'badge-primary' : 'badge-success'}`}>
                          {l.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Collections */}
        <div className="card" style={{ margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 className="card-title" style={{ margin: 0 }}>Recent Payments</h3>
            <button className="btn btn-outline btn-sm" onClick={() => navigate('/payments')}>
              View All
            </button>
          </div>


          {metrics?.recentPayments?.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No payments recorded yet.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.5rem' }}>Receipt No</th>
                    <th style={{ padding: '0.5rem' }}>Loan No</th>
                    <th style={{ padding: '0.5rem' }}>Amount</th>
                    <th style={{ padding: '0.5rem' }}>Mode</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics?.recentPayments?.map((p) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.6rem 0.5rem', fontWeight: 600, color: '#15803d' }}>
                        {p.receipt_number}
                      </td>
                      <td style={{ padding: '0.6rem 0.5rem' }}>
                        <div>{p.loan_number}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.customer_name}</div>
                      </td>
                      <td style={{ padding: '0.6rem 0.5rem', fontWeight: 600 }}>
                        {formatRupees(p.total_amount_paise)}
                      </td>
                      <td style={{ padding: '0.6rem 0.5rem' }}>
                        <span className="badge badge-secondary">{p.payment_mode}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* System Health Card */}
      <div className="card">
        <h3 className="card-title">Database & System Health</h3>
        <div className="info-grid">
          <div className="info-box">
            <div className="info-label">Database Connection</div>
            <div className="info-value" style={{ color: dbStatus?.connected ? 'var(--success)' : 'var(--danger)' }}>
              {dbStatus?.connected ? '● ONLINE (WAL Mode)' : '○ DISCONNECTED'}
            </div>
          </div>
          <div className="info-box">
            <div className="info-label">Schema Version</div>
            <div className="info-value">v{dbStatus?.schemaVersion || '4'}</div>
          </div>
          <div className="info-box" style={{ gridColumn: 'span 2' }}>
            <div className="info-label">Storage Location</div>
            <div className="info-value" style={{ fontSize: '0.85rem' }}>
              {dbStatus?.path || 'SQLite DB'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
