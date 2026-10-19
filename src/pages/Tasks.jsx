import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { reportService } from '../services/reportService';

export function Tasks() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [overdueLoans, setOverdueLoans] = useState([]);
  const [upcomingMaturity, setUpcomingMaturity] = useState([]);

  const loadTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await reportService.getLoanRegister({ status: 'ACTIVE' });
      const items = res?.items || [];
      const today = new Date().toISOString().split('T')[0];

      // Next 15 days
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 15);
      const futureDateStr = futureDate.toISOString().split('T')[0];

      const overdue = items.filter((l) => l.is_overdue);
      const upcoming = items.filter((l) => l.maturity_date && l.maturity_date >= today && l.maturity_date <= futureDateStr);

      setOverdueLoans(overdue);
      setUpcomingMaturity(upcoming);
    } catch (err) {
      setError(err.message || 'Failed to load task reminders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const formatRupees = (paise) => {
    if (!paise && paise !== 0) return '₹0.00';
    return '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="page-title">Tasks & Due Reminders</h2>
          <p className="page-subtitle">Track loans reaching maturity, overdue notices, and daily collection follow-ups</p>
        </div>
        <button className="btn btn-secondary" onClick={loadTasks} disabled={loading}>
          {loading ? 'Refreshing...' : '🔄 Refresh Reminders'}
        </button>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '1.25rem' }}>
          {error}
        </div>
      )}

      {/* Summary Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ borderLeft: '4px solid #ef4444', margin: 0 }}>
          <div className="info-label" style={{ color: '#b91c1c' }}>Action Required: Overdue Loans</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#b91c1c', marginTop: '0.25rem' }}>
            {loading ? '...' : overdueLoans.length}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Maturity date elapsed. Follow up for interest renewal or redemption.
          </div>
        </div>

        <div className="card" style={{ borderLeft: '4px solid #f59e0b', margin: 0 }}>
          <div className="info-label" style={{ color: '#b45309' }}>Upcoming Maturities (Next 15 Days)</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#b45309', marginTop: '0.25rem' }}>
            {loading ? '...' : upcomingMaturity.length}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Gold loans maturing soon. Prepare notice alerts if needed.
          </div>
        </div>
      </div>

      {/* Overdue Follow-up List */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 className="card-title" style={{ margin: 0, color: '#b91c1c' }}>
            ⚠️ Overdue Loans Follow-up ({overdueLoans.length})
          </h3>
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/reports')}>
            View in Reports
          </button>
        </div>

        {overdueLoans.length === 0 ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            ✔ No overdue loans currently pending. All active loans are within maturity!
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                <th style={{ padding: '0.6rem' }}>Loan #</th>
                <th style={{ padding: '0.6rem' }}>Customer</th>
                <th style={{ padding: '0.6rem' }}>Maturity Date</th>
                <th style={{ padding: '0.6rem', textAlign: 'right' }}>Remaining Principal</th>
                <th style={{ padding: '0.6rem', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {overdueLoans.map((l) => (
                <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.6rem', fontWeight: 600 }}>{l.loan_number}</td>
                  <td style={{ padding: '0.6rem' }}>
                    <div>{l.customer_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{l.customer_phone}</div>
                  </td>
                  <td style={{ padding: '0.6rem', color: '#b91c1c', fontWeight: 600 }}>
                    {l.maturity_date}
                  </td>
                  <td style={{ padding: '0.6rem', textAlign: 'right', fontWeight: 700 }}>
                    {formatRupees(l.remaining_principal_paise)}
                  </td>
                  <td style={{ padding: '0.6rem', textAlign: 'center' }}>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => navigate('/payments')}
                    >
                      Collect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Upcoming Maturities */}
      <div className="card">
        <h3 className="card-title">📅 Approaching Maturity ({upcomingMaturity.length})</h3>
        {upcomingMaturity.length === 0 ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No loans maturing within the next 15 days.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                <th style={{ padding: '0.6rem' }}>Loan #</th>
                <th style={{ padding: '0.6rem' }}>Customer</th>
                <th style={{ padding: '0.6rem' }}>Maturity Date</th>
                <th style={{ padding: '0.6rem', textAlign: 'right' }}>Principal</th>
                <th style={{ padding: '0.6rem', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {upcomingMaturity.map((l) => (
                <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.6rem', fontWeight: 600 }}>{l.loan_number}</td>
                  <td style={{ padding: '0.6rem' }}>
                    <div>{l.customer_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{l.customer_phone}</div>
                  </td>
                  <td style={{ padding: '0.6rem', fontWeight: 600, color: '#b45309' }}>
                    {l.maturity_date}
                  </td>
                  <td style={{ padding: '0.6rem', textAlign: 'right', fontWeight: 600 }}>
                    {formatRupees(l.principal_amount_paise)}
                  </td>
                  <td style={{ padding: '0.6rem', textAlign: 'center' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => navigate('/payments')}
                    >
                      Payment
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
