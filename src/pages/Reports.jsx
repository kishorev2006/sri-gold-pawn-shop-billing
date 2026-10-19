import React, { useState, useEffect } from 'react';
import { reportService } from '../services/reportService';

export function Reports() {
  const [reportType, setReportType] = useState('LOANS'); // 'LOANS', 'OVERDUE', 'COLLECTIONS'
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL', 'ACTIVE', 'CLOSED'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [interestType, setInterestType] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reportData, setReportData] = useState(null);

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      if (reportType === 'COLLECTIONS') {
        const res = await reportService.getCollectionReport({
          start_date: startDate,
          end_date: endDate,
          search: searchTerm
        });
        setReportData(res);
      } else {
        const status = reportType === 'OVERDUE' ? 'OVERDUE' : statusFilter;
        const res = await reportService.getLoanRegister({
          status,
          start_date: startDate,
          end_date: endDate,
          interest_type: interestType,
          search: searchTerm
        });
        setReportData(res);
      }
    } catch (err) {
      console.error('Failed to generate report:', err);
      setError(err.message || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [reportType, statusFilter, startDate, endDate, interestType, searchTerm]);

  const formatRupees = (paise) => {
    if (!paise && paise !== 0) return '₹0.00';
    return '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatGrams = (mg) => {
    if (!mg && mg !== 0) return '0.000 g';
    return (mg / 1000).toFixed(3) + ' g';
  };

  const handleExportCSV = () => {
    if (!reportData || !reportData.items || reportData.items.length === 0) {
      alert('No data available to export');
      return;
    }

    let csvContent = 'data:text/csv;charset=utf-8,';

    const sanitizeCsvCell = (val) => {
      if (val === null || val === undefined) return '""';
      let str = String(val);
      // Neutralize spreadsheet formula injection characters (=, +, -, @, \t, \r)
      if (/^[=+\-@\t\r]/.test(str)) {
        str = "'" + str;
      }
      return `"${str.replace(/"/g, '""')}"`;
    };

    if (reportType === 'COLLECTIONS') {
      csvContent += 'Receipt Number,Date,Loan Number,Customer Name,Phone,Mode,Principal (INR),Interest (INR),Penalty (INR),Total Amount (INR)\n';
      reportData.items.forEach((r) => {
        const row = [
          sanitizeCsvCell(r.receipt_number),
          sanitizeCsvCell(r.payment_date),
          sanitizeCsvCell(r.loan_number),
          sanitizeCsvCell(r.customer_name),
          sanitizeCsvCell(r.customer_phone),
          sanitizeCsvCell(r.payment_mode),
          (r.principal_component_paise / 100).toFixed(2),
          (r.interest_component_paise / 100).toFixed(2),
          (r.penalty_component_paise / 100).toFixed(2),
          (r.total_amount_paise / 100).toFixed(2)
        ];
        csvContent += row.join(',') + '\n';
      });
    } else {
      csvContent += 'Loan Number,Pledge Date,Maturity Date,Customer Name,Phone,Net Gold Wt (g),Interest Type,Rate (%),Principal (INR),Paid Principal (INR),Remaining Principal (INR),Status\n';
      reportData.items.forEach((r) => {
        const row = [
          sanitizeCsvCell(r.loan_number),
          sanitizeCsvCell(r.pledge_date || ''),
          sanitizeCsvCell(r.maturity_date || ''),
          sanitizeCsvCell(r.customer_name),
          sanitizeCsvCell(r.customer_phone),
          (r.total_net_weight_mg / 1000).toFixed(3),
          sanitizeCsvCell(r.interest_type),
          r.monthly_interest_rate_pct,
          (r.principal_amount_paise / 100).toFixed(2),
          (r.total_paid_principal_paise / 100).toFixed(2),
          (r.remaining_principal_paise / 100).toFixed(2),
          sanitizeCsvCell(r.status)
        ];
        csvContent += row.join(',') + '\n';
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${reportType.toLowerCase()}_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="page-title">Business Reports & Ledger</h2>
          <p className="page-subtitle">Loan registers, overdue portfolios, repayment collections, and exports</p>
        </div>
        <button
          className="btn btn-secondary"
          onClick={handleExportCSV}
          disabled={!reportData || !reportData.items || reportData.items.length === 0}
        >
          📥 Export CSV
        </button>
      </div>

      {/* Report Type Navigation Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
        <button
          className={`btn ${reportType === 'LOANS' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setReportType('LOANS'); setStatusFilter('ALL'); }}
        >
          📄 Loan Register
        </button>
        <button
          className={`btn ${reportType === 'OVERDUE' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setReportType('OVERDUE'); }}
          style={reportType === 'OVERDUE' ? { backgroundColor: '#dc2626' } : {}}
        >
          ⚠️ Overdue Loans Report
        </button>
        <button
          className={`btn ${reportType === 'COLLECTIONS' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setReportType('COLLECTIONS')}
        >
          💰 Repayment & Collections Register
        </button>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '1.25rem' }}>
          {error}
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', alignItems: 'flex-end' }}>
          <div className="form-group">
            <label className="form-label">Search</label>
            <input
              type="text"
              className="form-control"
              placeholder="Loan / Customer / Phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {reportType === 'LOANS' && (
            <div className="form-group">
              <label className="form-label">Loan Status</label>
              <select
                className="form-control"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active Loans</option>
                <option value="CLOSED">Closed / Settled</option>
              </select>
            </div>
          )}

          {reportType !== 'COLLECTIONS' && (
            <div className="form-group">
              <label className="form-label">Interest Type</label>
              <select
                className="form-control"
                value={interestType}
                onChange={(e) => setInterestType(e.target.value)}
              >
                <option value="ALL">All Types</option>
                <option value="MONTHLY">Monthly</option>
                <option value="WEEKLY">Weekly</option>
              </select>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">From Date</label>
            <input
              type="date"
              className="form-control"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">To Date</label>
            <input
              type="date"
              className="form-control"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Report Summary Metric Cards */}
      {reportData?.totals && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
          <div className="card" style={{ padding: '1rem', margin: 0 }}>
            <div className="info-label">Total Records</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.25rem' }}>
              {reportData.totals.count}
            </div>
          </div>

          {reportType === 'COLLECTIONS' ? (
            <>
              <div className="card" style={{ padding: '1rem', margin: 0 }}>
                <div className="info-label">Total Received</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#15803d', marginTop: '0.25rem' }}>
                  {formatRupees(reportData.totals.sumTotalPaise)}
                </div>
              </div>
              <div className="card" style={{ padding: '1rem', margin: 0 }}>
                <div className="info-label">Principal Recovered</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.25rem' }}>
                  {formatRupees(reportData.totals.sumPrincipalPaise)}
                </div>
              </div>
              <div className="card" style={{ padding: '1rem', margin: 0 }}>
                <div className="info-label">Interest Earned</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#b45309', marginTop: '0.25rem' }}>
                  {formatRupees(reportData.totals.sumInterestPaise)}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="card" style={{ padding: '1rem', margin: 0 }}>
                <div className="info-label">Total Principal</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.25rem' }}>
                  {formatRupees(reportData.totals.sumPrincipalPaise)}
                </div>
              </div>
              <div className="card" style={{ padding: '1rem', margin: 0 }}>
                <div className="info-label">Outstanding Principal</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#b45309', marginTop: '0.25rem' }}>
                  {formatRupees(reportData.totals.sumOutstandingPrincipalPaise)}
                </div>
              </div>
              <div className="card" style={{ padding: '1rem', margin: 0 }}>
                <div className="info-label">Total Net Gold</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#d97706', marginTop: '0.25rem' }}>
                  {formatGrams(reportData.totals.sumNetWeightMg)}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Main Table Display */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Generating report...
          </div>
        ) : !reportData || reportData.items.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <h3>No Records Match Filter Criteria</h3>
            <p style={{ marginTop: '0.5rem' }}>Try expanding your date range or clearing search filters.</p>
          </div>
        ) : reportType === 'COLLECTIONS' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Receipt #</th>
                <th style={{ padding: '0.75rem 1rem' }}>Date</th>
                <th style={{ padding: '0.75rem 1rem' }}>Loan #</th>
                <th style={{ padding: '0.75rem 1rem' }}>Customer</th>
                <th style={{ padding: '0.75rem 1rem' }}>Mode</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Principal</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Interest</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {reportData.items.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#15803d' }}>{r.receipt_number}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{r.payment_date}</td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{r.loan_number}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div>{r.customer_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.customer_phone}</div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span className="badge badge-secondary">{r.payment_mode}</span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{formatRupees(r.principal_component_paise)}</td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{formatRupees(r.interest_component_paise)}</td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700 }}>{formatRupees(r.total_amount_paise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Loan #</th>
                <th style={{ padding: '0.75rem 1rem' }}>Pledge Date</th>
                <th style={{ padding: '0.75rem 1rem' }}>Maturity Date</th>
                <th style={{ padding: '0.75rem 1rem' }}>Customer</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Net Gold Wt</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Principal</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Remaining</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {reportData.items.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{r.loan_number}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{r.pledge_date || '-'}</td>
                  <td style={{ padding: '0.75rem 1rem', color: r.is_overdue ? '#b91c1c' : 'inherit', fontWeight: r.is_overdue ? 600 : 'normal' }}>
                    {r.maturity_date || 'N/A'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div>{r.customer_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.customer_phone}</div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600, color: '#b45309' }}>
                    {formatGrams(r.total_net_weight_mg)}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                    {formatRupees(r.principal_amount_paise)}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700 }}>
                    {formatRupees(r.remaining_principal_paise)}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                    {r.is_overdue ? (
                      <span className="badge" style={{ backgroundColor: '#fee2e2', color: '#b91c1c' }}>
                        OVERDUE
                      </span>
                    ) : (
                      <span className={`badge ${r.status === 'ACTIVE' ? 'badge-primary' : 'badge-success'}`}>
                        {r.status}
                      </span>
                    )}
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
