import React, { useState, useEffect } from 'react';
import { paymentService } from '../services/paymentService';
import { loanService } from '../services/loanService';

export function Payments() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Payment Recording Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeLoans, setActiveLoans] = useState([]);
  const [selectedLoanId, setSelectedLoanId] = useState('');
  const [loanSummary, setLoanSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  // Form inputs
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMode, setPaymentMode] = useState('CASH');
  const [principalInput, setPrincipalInput] = useState('');
  const [interestInput, setInterestInput] = useState('');
  const [penaltyInput, setPenaltyInput] = useState('0');
  const [refTxnId, setRefTxnId] = useState('');
  const [notes, setNotes] = useState('');
  const [isSettlement, setIsSettlement] = useState(false);
  const [concessionAuthorized, setConcessionAuthorized] = useState(false);
  const [concessionReason, setConcessionReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  // Receipt Modal
  const [receiptData, setReceiptData] = useState(null);

  const fetchPayments = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await paymentService.list({
        search: searchTerm,
        start_date: startDate,
        end_date: endDate
      });
      setPayments(data);
    } catch (err) {
      console.error('Failed to fetch payments:', err);
      setError(err.message || 'Failed to fetch payments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, [searchTerm, startDate, endDate]);

  const loadActiveLoans = async () => {
    try {
      const res = await loanService.list({ status: 'ACTIVE' });
      setActiveLoans(res || []);
    } catch (err) {
      console.error('Failed to load active loans:', err);
    }
  };

  const handleOpenModal = () => {
    setIsModalOpen(true);
    setSelectedLoanId('');
    setLoanSummary(null);
    setPrincipalInput('');
    setInterestInput('');
    setPenaltyInput('0');
    setRefTxnId('');
    setNotes('');
    setIsSettlement(false);
    setConcessionAuthorized(false);
    setConcessionReason('');
    setFormError(null);
    setPaymentDate(new Date().toISOString().split('T')[0]);
    loadActiveLoans();
  };

  const handleSelectLoan = async (loanId) => {
    setSelectedLoanId(loanId);
    if (!loanId) {
      setLoanSummary(null);
      return;
    }

    setLoadingSummary(true);
    setFormError(null);
    try {
      const summary = await paymentService.getLoanSummary(loanId);
      setLoanSummary(summary);

      // Pre-fill default interest repayment
      const outstandingInterestRupees = (summary.outstandingInterestPaise / 100).toFixed(2);
      setInterestInput(outstandingInterestRupees);
      setPrincipalInput('0');
      setPenaltyInput('0');
      setIsSettlement(false);
    } catch (err) {
      setFormError(err.message || 'Failed to calculate loan details');
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleToggleSettlement = (checked) => {
    setIsSettlement(checked);
    if (checked && loanSummary) {
      // Full settlement: prefill exact remaining principal and outstanding interest
      const remainingPrincipalRupees = (loanSummary.remainingPrincipalPaise / 100).toFixed(2);
      const outstandingInterestRupees = (loanSummary.outstandingInterestPaise / 100).toFixed(2);
      setPrincipalInput(remainingPrincipalRupees);
      setInterestInput(outstandingInterestRupees);
    }
  };

  const calculateTotalInputPaise = () => {
    const pPaise = Math.round((parseFloat(principalInput) || 0) * 100);
    const iPaise = Math.round((parseFloat(interestInput) || 0) * 100);
    const penPaise = Math.round((parseFloat(penaltyInput) || 0) * 100);
    return pPaise + iPaise + penPaise;
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedLoanId) {
      setFormError('Please select a loan');
      return;
    }

    const principalPaise = Math.round((parseFloat(principalInput) || 0) * 100);
    const interestPaise = Math.round((parseFloat(interestInput) || 0) * 100);
    const penaltyPaise = Math.round((parseFloat(penaltyInput) || 0) * 100);
    const totalAmountPaise = principalPaise + interestPaise + penaltyPaise;

    if (totalAmountPaise <= 0) {
      setFormError('Total payment amount must be greater than ₹0.00');
      return;
    }

    if (principalPaise > loanSummary.remainingPrincipalPaise) {
      setFormError(`Principal payment cannot exceed the remaining balance of ₹${(loanSummary.remainingPrincipalPaise / 100).toFixed(2)}`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await paymentService.record({
        loan_id: selectedLoanId,
        payment_date: paymentDate,
        total_amount_paise: totalAmountPaise,
        principal_component_paise: principalPaise,
        interest_component_paise: interestPaise,
        penalty_component_paise: penaltyPaise,
        payment_mode: paymentMode,
        reference_txn_id: refTxnId,
        notes: notes,
        is_settlement: isSettlement,
        interest_concession_authorized: concessionAuthorized,
        interest_concession_reason: concessionReason
      });

      setSuccessMsg(`Payment recorded successfully! Receipt #${res.receipt_number}`);
      setIsModalOpen(false);
      fetchPayments();

      // Show receipt
      setReceiptData({
        ...res,
        customer_name: loanSummary.loan.customer_name,
        customer_phone: loanSummary.loan.customer_phone,
        loan_number: loanSummary.loan.loan_number,
        pledge_date: loanSummary.loan.pledge_date
      });
    } catch (err) {
      setFormError(err.message || 'Payment submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const formatRupees = (paise) => {
    if (!paise && paise !== 0) return '₹0.00';
    return '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="page-title">Repayments & Loan Settlement</h2>
          <p className="page-subtitle">Record interest collections, principal repayments, and full loan closures</p>
        </div>
        <button className="btn btn-primary" onClick={handleOpenModal}>
          + Record Payment / Settlement
        </button>
      </div>

      {successMsg && (
        <div className="alert" style={{ backgroundColor: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', marginBottom: '1.25rem' }}>
          {successMsg}
        </div>
      )}

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '1.25rem' }}>
          {error}
        </div>
      )}

      {/* Filter Bar */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '1rem', alignItems: 'flex-end' }}>
          <div className="form-group">
            <label className="form-label">Search Payments</label>
            <input
              type="text"
              className="form-control"
              placeholder="Search receipt #, loan #, customer name, phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
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
          {(searchTerm || startDate || endDate) && (
            <button
              className="btn btn-secondary"
              onClick={() => { setSearchTerm(''); setStartDate(''); setEndDate(''); }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Payments Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading payments...
          </div>
        ) : payments.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <h3>No Payments Found</h3>
            <p style={{ marginTop: '0.5rem' }}>Click "+ Record Payment / Settlement" to collect interest or principal.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Receipt #</th>
                <th style={{ padding: '0.75rem 1rem' }}>Date</th>
                <th style={{ padding: '0.75rem 1rem' }}>Type</th>
                <th style={{ padding: '0.75rem 1rem' }}>Loan #</th>
                <th style={{ padding: '0.75rem 1rem' }}>Customer</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Principal</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Interest</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Total Amount</th>
                <th style={{ padding: '0.75rem 1rem' }}>Mode</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#15803d' }}>
                    {p.receipt_number}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>{p.payment_date}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span className="badge" style={{
                      fontSize: '0.7rem',
                      padding: '2px 6px',
                      backgroundColor: p.payment_type === 'SETTLEMENT' ? '#dcfce7' : (p.payment_type === 'PRINCIPAL' ? '#fef3c7' : '#e0e7ff'),
                      color: p.payment_type === 'SETTLEMENT' ? '#166534' : (p.payment_type === 'PRINCIPAL' ? '#92400e' : '#3730a3')
                    }}>
                      {p.payment_type || (p.is_settlement ? 'SETTLEMENT' : (p.principal_component_paise > 0 ? 'PRINCIPAL' : 'INTEREST'))}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{p.loan_number}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ fontWeight: 500 }}>{p.customer_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.customer_phone}</div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                    {formatRupees(p.principal_component_paise)}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                    {formatRupees(p.interest_component_paise)}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: 'var(--text-dark)' }}>
                    {formatRupees(p.total_amount_paise)}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span className="badge badge-secondary">{p.payment_mode}</span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => setReceiptData(p)}
                    >
                      Receipt
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Record Payment Modal */}
      {isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '800px' }}>
            <div className="modal-header">
              <h3>Record Repayment or Settlement</h3>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}>&times;</button>
            </div>
            <form onSubmit={handleSubmitPayment}>
              <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto', padding: '1.5rem' }}>
                {formError && (
                  <div className="alert alert-danger" style={{ marginBottom: '1.25rem' }}>
                    {formError}
                  </div>
                )}

                {/* 1. Loan Selection */}
                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label className="form-label">Select Active Gold Loan *</label>
                  <select
                    className="form-control"
                    value={selectedLoanId}
                    onChange={(e) => handleSelectLoan(e.target.value)}
                    required
                  >
                    <option value="">-- Choose Active Loan --</option>
                    {activeLoans.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.loan_number} - {l.customer_name} ({l.customer_phone}) - Principal: {formatRupees(l.principal_amount_paise)}
                      </option>
                    ))}
                  </select>
                </div>

                {loadingSummary && (
                  <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Calculating financial ledger and accrued interest...
                  </div>
                )}

                {/* Loan Summary Info Box */}
                {loanSummary && !loadingSummary && (
                  <div style={{ backgroundColor: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1rem', marginBottom: '1.25rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                      <div>
                        <div className="info-label">Customer</div>
                        <div style={{ fontWeight: 600 }}>{loanSummary.loan.customer_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{loanSummary.loan.customer_phone}</div>
                      </div>
                      <div>
                        <div className="info-label">Original Principal</div>
                        <div style={{ fontWeight: 600 }}>{formatRupees(loanSummary.loan.principal_amount_paise)}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Rate: {loanSummary.loan.monthly_interest_rate_pct}% / {loanSummary.loan.interest_type === 'WEEKLY' ? 'wk' : 'mo'}
                        </div>
                      </div>
                      <div>
                        <div className="info-label">Remaining Principal</div>
                        <div style={{ fontWeight: 700, color: '#b45309' }}>
                          {formatRupees(loanSummary.remainingPrincipalPaise)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Paid: {formatRupees(loanSummary.totalPaidPrincipalPaise)}
                        </div>
                      </div>
                      <div>
                        <div className="info-label">Estimated Accrued Int.</div>
                        <div style={{ fontWeight: 700, color: '#15803d' }}>
                          {formatRupees(loanSummary.outstandingInterestPaise)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Elapsed: {loanSummary.elapsedUnits} {loanSummary.loan.interest_type === 'WEEKLY' ? 'week(s)' : 'month(s)'}
                        </div>
                      </div>
                    </div>

                    {/* Settlement Option Checkbox */}
                    <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="checkbox"
                        id="settlementCheck"
                        checked={isSettlement}
                        onChange={(e) => handleToggleSettlement(e.target.checked)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <label htmlFor="settlementCheck" style={{ fontWeight: 600, color: isSettlement ? '#15803d' : 'var(--text-dark)', cursor: 'pointer' }}>
                        Full Loan Settlement & Gold Release (Sets full remaining principal and outstanding interest to close loan)
                      </label>
                    </div>
                  </div>
                )}

                {/* Payment Input Fields */}
                {loanSummary && !loadingSummary && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                      <div className="form-group">
                        <label className="form-label">Principal Repayment (₹)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="form-control"
                          value={principalInput}
                          onChange={(e) => setPrincipalInput(e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Interest Payment (₹)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="form-control"
                          value={interestInput}
                          onChange={(e) => setInterestInput(e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Penalty / Late Fee (₹)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="form-control"
                          value={penaltyInput}
                          onChange={(e) => setPenaltyInput(e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                    </div>

                    {/* Interest Concession Authorization for Settlement */}
                    {isSettlement && Math.round((parseFloat(interestInput) || 0) * 100) < (loanSummary.outstandingInterestPaise || 0) && (
                      <div style={{ backgroundColor: '#fff7ed', border: '1px solid #fdba74', borderRadius: '6px', padding: '0.75rem 1rem', marginBottom: '1rem' }}>
                        <div style={{ fontWeight: 600, color: '#c2410c', marginBottom: '0.35rem' }}>
                          ⚠️ Interest Concession / Waiver Required
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#7c2d12', marginBottom: '0.5rem' }}>
                          Settlement interest offered (₹{parseFloat(interestInput) || 0}) is less than outstanding accrued interest ({formatRupees(loanSummary.outstandingInterestPaise)}). An explicit authorized waiver and audit reason are required.
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                          <input
                            type="checkbox"
                            id="concessionAuth"
                            checked={concessionAuthorized}
                            onChange={(e) => setConcessionAuthorized(e.target.checked)}
                          />
                          <label htmlFor="concessionAuth" style={{ fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', margin: 0 }}>
                            Authorize Interest Concession / Waiver
                          </label>
                        </div>
                        {concessionAuthorized && (
                          <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label" style={{ fontSize: '0.8rem' }}>Concession Reason (Required for Audit Log) *</label>
                            <input
                              type="text"
                              className="form-control"
                              placeholder="e.g. Owner authorized discount for fast settlement"
                              value={concessionReason}
                              onChange={(e) => setConcessionReason(e.target.value)}
                              required
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Total Summary Preview Box */}
                    <div style={{ backgroundColor: '#fef3c7', borderRadius: '6px', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                      <div style={{ fontWeight: 600, color: '#92400e' }}>
                        Total Collection Amount:
                      </div>
                      <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#b45309' }}>
                        {formatRupees(calculateTotalInputPaise())}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                      <div className="form-group">
                        <label className="form-label">Payment Date</label>
                        <input
                          type="date"
                          className="form-control"
                          value={paymentDate}
                          onChange={(e) => setPaymentDate(e.target.value)}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Payment Mode</label>
                        <select
                          className="form-control"
                          value={paymentMode}
                          onChange={(e) => setPaymentMode(e.target.value)}
                        >
                          <option value="CASH">CASH</option>
                          <option value="UPI">UPI / GPay / PhonePe</option>
                          <option value="BANK_TRANSFER">BANK TRANSFER / NEFT</option>
                          <option value="CHEQUE">CHEQUE</option>
                        </select>
                      </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                      <label className="form-label">Reference / Txn ID (Optional)</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="UPI Txn reference or Cheque number"
                        value={refTxnId}
                        onChange={(e) => setRefTxnId(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Notes / Remarks</label>
                      <textarea
                        className="form-control"
                        rows="2"
                        placeholder="Additional remarks on this payment..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting || !selectedLoanId || calculateTotalInputPaise() <= 0}
                >
                  {submitting ? 'Recording...' : isSettlement ? 'Confirm Loan Settlement & Close' : 'Confirm Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View / Print Receipt Modal */}
      {receiptData && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '540px' }}>
            <div className="modal-header">
              <h3>Payment Receipt - {receiptData.receipt_number}</h3>
              <button className="close-btn" onClick={() => setReceiptData(null)}>&times;</button>
            </div>
            <div className="modal-body" style={{ padding: '1.5rem', fontFamily: 'monospace' }}>
              <div style={{ textAlign: 'center', marginBottom: '1rem', borderBottom: '1px dashed #cbd5e1', paddingBottom: '0.75rem' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>SRI GOLD PAWN SHOP</h2>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Pawn Broker & Gold Loan Services</div>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Tirunelveli, Tamil Nadu</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem', marginBottom: '1rem' }}>
                <div><strong>Receipt No:</strong> {receiptData.receipt_number}</div>
                <div><strong>Date:</strong> {receiptData.payment_date}</div>
                <div><strong>Loan No:</strong> {receiptData.loan_number}</div>
                <div><strong>Mode:</strong> {receiptData.payment_mode}</div>
                <div style={{ gridColumn: 'span 2' }}><strong>Customer:</strong> {receiptData.customer_name} ({receiptData.customer_phone})</div>
                {receiptData.reference_txn_id && (
                  <div style={{ gridColumn: 'span 2' }}><strong>Txn Ref:</strong> {receiptData.reference_txn_id}</div>
                )}
              </div>

              <div style={{ borderTop: '1px dashed #cbd5e1', borderBottom: '1px dashed #cbd5e1', padding: '0.75rem 0', marginBottom: '1rem', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span>Principal Component:</span>
                  <span>{formatRupees(receiptData.principal_component_paise)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span>Interest Component:</span>
                  <span>{formatRupees(receiptData.interest_component_paise)}</span>
                </div>
                {receiptData.penalty_component_paise > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span>Penalty / Late Fee:</span>
                    <span>{formatRupees(receiptData.penalty_component_paise)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1rem', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #e2e8f0' }}>
                  <span>Total Received:</span>
                  <span>{formatRupees(receiptData.total_amount_paise)}</span>
                </div>
              </div>

              {receiptData.is_closed && (
                <div style={{ textAlign: 'center', backgroundColor: '#dcfce7', color: '#166534', padding: '0.5rem', borderRadius: '4px', fontWeight: 600, fontSize: '0.85rem', marginBottom: '1rem' }}>
                  ✔ LOAN FULLY SETTLED & CLOSED
                </div>
              )}

              <div style={{ fontSize: '0.75rem', textAlign: 'center', color: '#64748b' }}>
                Thank you for your business. Computer generated receipt.
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => window.print()}
              >
                🖨 Print Receipt
              </button>
              <button className="btn btn-primary" onClick={() => setReceiptData(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
