import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loanService } from '../services/loanService';
import { customerService } from '../services/customerService';

export function Loans() {
  const navigate = useNavigate();
  const [loans, setLoans] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Loan Detail Modal
  const [selectedLoan, setSelectedLoan] = useState(null);

  // New Loan Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [ornamentMaster, setOrnamentMaster] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [savingLoan, setSavingLoan] = useState(false);
  const [createError, setCreateError] = useState(null);

  // Custom Ornament inline modal / popover
  const [showCustomOrnamentModal, setShowCustomOrnamentModal] = useState(false);
  const [customOrnamentName, setCustomOrnamentName] = useState('');
  const [customOrnamentPurity, setCustomOrnamentPurity] = useState('22K');
  const [customOrnamentError, setCustomOrnamentError] = useState(null);
  const [savingCustomOrnament, setSavingCustomOrnament] = useState(false);
  const [targetItemIdxForCustom, setTargetItemIdxForCustom] = useState(null);

  // Loan Form State
  const [loanType, setLoanType] = useState('FIXED'); // 'FIXED' | 'OPEN'
  const [principalInput, setPrincipalInput] = useState(''); // Rupees string
  const [interestType, setInterestType] = useState('MONTHLY'); // 'WEEKLY' | 'MONTHLY'
  const [interestRate, setInterestRate] = useState('1.5'); // % per week or % per month
  const [interestDuration, setInterestDuration] = useState('12'); // weeks or months
  const [pledgeDate, setPledgeDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Admin-selected maturity date (Optional - admin decides)
  const [maturityDate, setMaturityDate] = useState('');
  const [notes, setNotes] = useState('');

  // Multi-item Pledged Ornaments
  const [items, setItems] = useState([
    {
      ornament_type: 'Ring',
      description: '',
      item_count: 1,
      gross_weight_grams: '',
      stone_weight_grams: '0',
      purity: '22K',
      estimated_value_rupees: ''
    }
  ]);

  const loadLoans = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await loanService.list({ status: statusFilter, search: searchQuery });
      setLoans(data);
    } catch (err) {
      setError(err.message || 'Failed to load loans');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLoans();
  }, [statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadLoans();
  };

  const openNewLoanModal = async () => {
    setCreateError(null);
    setSelectedCustomer(null);
    setCustomerSearch('');
    setCustomerResults([]);
    setLoanType('FIXED');
    setPrincipalInput('');
    setInterestType('MONTHLY');
    setInterestRate('1.5');
    setInterestDuration('12');
    const today = new Date().toISOString().split('T')[0];
    setPledgeDate(today);
    setMaturityDate(''); // Optional: admin decides whether to set it

    setNotes('');
    setItems([
      {
        ornament_type: 'Ring',
        description: '',
        item_count: 1,
        gross_weight_grams: '',
        stone_weight_grams: '0',
        purity: '22K',
        estimated_value_rupees: ''
      }
    ]);

    try {
      const master = await loanService.getOrnamentsMaster();
      setOrnamentMaster(master);
      if (master.length > 0) {
        setItems([{
          ornament_type: master[0].name,
          description: '',
          item_count: 1,
          gross_weight_grams: '',
          stone_weight_grams: '0',
          purity: master[0].default_purity || '22K',
          estimated_value_rupees: ''
        }]);
      }
    } catch (e) {
      console.warn('Could not load ornament master', e);
    }
    setShowCreateModal(true);
  };

  // Customer search debounced/manual
  const searchCustomers = async (text) => {
    setCustomerSearch(text);
    if (!text.trim()) {
      setCustomerResults([]);
      return;
    }
    try {
      setSearchingCustomer(true);
      const res = await customerService.search(text);
      setCustomerResults(res);
    } catch (e) {
      console.error(e);
    } finally {
      setSearchingCustomer(false);
    }
  };

  // Add Item to Pledged Ornaments
  const addItemRow = () => {
    setItems([
      ...items,
      {
        ornament_type: ornamentMaster.length > 0 ? ornamentMaster[0].name : 'Ring',
        description: '',
        item_count: 1,
        gross_weight_grams: '',
        stone_weight_grams: '0',
        purity: '22K',
        estimated_value_rupees: ''
      }
    ]);
  };

  const removeItemRow = (idx) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== idx));
  };

  const updateItemField = (idx, field, val) => {
    if (field === 'ornament_type' && val === '__ADD_CUSTOM__') {
      // Trigger Add Custom Ornament dialog
      setTargetItemIdxForCustom(idx);
      setCustomOrnamentName('');
      setCustomOrnamentPurity('22K');
      setCustomOrnamentError(null);
      setShowCustomOrnamentModal(true);
      return;
    }

    const updated = [...items];
    updated[idx][field] = val;
    setItems(updated);
  };

  const handleSaveCustomOrnament = async (e) => {
    e.preventDefault();
    setCustomOrnamentError(null);

    const trimmed = customOrnamentName.trim();
    if (!trimmed || trimmed.length < 2) {
      setCustomOrnamentError('Ornament name must be at least 2 characters.');
      return;
    }

    try {
      setSavingCustomOrnament(true);
      const newOrnament = await loanService.addCustomOrnament({
        name: trimmed,
        default_purity: customOrnamentPurity,
        category: 'GOLD'
      });

      // Refresh ornament master list
      const updatedMaster = await loanService.getOrnamentsMaster();
      setOrnamentMaster(updatedMaster);

      // Select newly added ornament in targeted row
      if (targetItemIdxForCustom !== null && items[targetItemIdxForCustom]) {
        const updated = [...items];
        updated[targetItemIdxForCustom].ornament_type = newOrnament.name;
        updated[targetItemIdxForCustom].purity = newOrnament.default_purity || '22K';
        setItems(updated);
      }

      setShowCustomOrnamentModal(false);
      setTargetItemIdxForCustom(null);
    } catch (err) {
      setCustomOrnamentError(err.message || 'Failed to save ornament');
    } finally {
      setSavingCustomOrnament(false);
    }
  };

  // Weight Calculations
  const calculateTotals = () => {
    let totalGrossGrams = 0;
    let totalStoneGrams = 0;
    let totalNetGrams = 0;
    let totalItems = 0;

    items.forEach((it) => {
      const g = parseFloat(it.gross_weight_grams) || 0;
      const s = parseFloat(it.stone_weight_grams) || 0;
      const n = Math.max(0, g - s);
      const c = parseInt(it.item_count, 10) || 1;

      totalGrossGrams += g;
      totalStoneGrams += s;
      totalNetGrams += n;
      totalItems += c;
    });

    return {
      totalGrossGrams: totalGrossGrams.toFixed(3),
      totalStoneGrams: totalStoneGrams.toFixed(3),
      totalNetGrams: totalNetGrams.toFixed(3),
      totalItems
    };
  };

  const totals = calculateTotals();

  // Create Loan Submit
  const handleCreateLoan = async (e) => {
    e.preventDefault();
    setCreateError(null);

    if (!selectedCustomer) {
      setCreateError('Please search and select a customer first.');
      return;
    }

    const principalRs = parseFloat(principalInput);
    if (isNaN(principalRs) || principalRs <= 0) {
      setCreateError('Please enter a valid principal loan amount greater than ₹0.');
      return;
    }

    const ratePct = parseFloat(interestRate);
    if (isNaN(ratePct) || ratePct < 0) {
      setCreateError('Interest rate must be a non-negative number.');
      return;
    }

    const dur = parseInt(interestDuration, 10);
    if (isNaN(dur) || dur <= 0) {
      setCreateError(`Interest duration (${interestType === 'WEEKLY' ? 'weeks' : 'months'}) must be a positive integer.`);
      return;
    }

    if (maturityDate && maturityDate < pledgeDate) {
      setCreateError('Maturity date cannot be earlier than the pledge date.');
      return;
    }

    // Convert weights to integer milligrams (1g = 1000mg) and money to paise (1₹ = 100 paise)
    const payloadItems = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const g = parseFloat(it.gross_weight_grams);
      const s = parseFloat(it.stone_weight_grams) || 0;

      if (isNaN(g) || g <= 0) {
        setCreateError(`Item #${i + 1}: Gross weight must be greater than 0g.`);
        return;
      }
      if (s >= g) {
        setCreateError(`Item #${i + 1}: Stone weight cannot equal or exceed gross weight.`);
        return;
      }

      const grossMg = Math.round(g * 1000);
      const stoneMg = Math.round(s * 1000);
      const valRs = parseFloat(it.estimated_value_rupees) || 0;

      payloadItems.push({
        ornament_type: it.ornament_type,
        description: it.description,
        item_count: parseInt(it.item_count, 10) || 1,
        gross_weight_mg: grossMg,
        stone_weight_mg: stoneMg,
        purity: it.purity,
        estimated_value_paise: Math.round(valRs * 100)
      });
    }

    let effDueDate = null;
    if (loanType === 'FIXED') {
      if (maturityDate) {
        effDueDate = maturityDate;
      } else {
        const d = new Date(pledgeDate);
        if (interestType === 'WEEKLY') {
          d.setDate(d.getDate() + (dur * 7));
        } else {
          d.setMonth(d.getMonth() + dur);
        }
        effDueDate = d.toISOString().split('T')[0];
      }
    } else {
      effDueDate = maturityDate || null;
    }

    const payload = {
      customer_id: selectedCustomer.id,
      loan_type: loanType,
      principal_amount_paise: Math.round(principalRs * 100),
      interest_type: interestType,
      monthly_interest_rate_pct: ratePct,
      interest_duration: dur,
      pledge_date: pledgeDate,
      due_date: effDueDate,
      maturity_date: maturityDate || null,
      notes,
      items: payloadItems
    };

    try {
      setSavingLoan(true);
      await loanService.create(payload);
      setShowCreateModal(false);
      loadLoans();
    } catch (err) {
      setCreateError(err.message || 'Failed to create loan');
    } finally {
      setSavingLoan(false);
    }
  };

  const viewLoanDetails = async (loanId) => {
    try {
      setLoading(true);
      const data = await loanService.getById(loanId);
      setSelectedLoan(data);
    } catch (err) {
      alert('Failed to load loan: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="page-title">Pawn Loans Directory</h2>
          <p className="page-subtitle">Pawn pledges, ornament tracking, and interest records</p>
        </div>
        <button className="btn btn-primary" onClick={openNewLoanModal}>
          + New Gold Loan (Pledge)
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ marginBottom: '1.25rem', padding: '1rem' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <input
            type="text"
            className="form-control"
            placeholder="Search by loan number (e.g. L-0001), customer name, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ flex: 1 }}
          />
          <select
            className="form-control"
            style={{ width: '170px' }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="OVERDUE">OVERDUE ONLY</option>
            <option value="CLOSED">CLOSED</option>
            <option value="DEFAULTED">DEFAULTED</option>
            <option value="AUCTIONED">AUCTIONED</option>
          </select>
          <button type="submit" className="btn btn-primary">Filter</button>
        </form>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {/* Loans Data Table */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Loan #</th>
                <th style={{ padding: '0.75rem 1rem' }}>Pledge Date</th>
                <th style={{ padding: '0.75rem 1rem' }}>Maturity Date</th>
                <th style={{ padding: '0.75rem 1rem' }}>Customer</th>
                <th style={{ padding: '0.75rem 1rem' }}>Principal</th>
                <th style={{ padding: '0.75rem 1rem' }}>Interest Terms</th>
                <th style={{ padding: '0.75rem 1rem' }}>Net Weight</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Loading loans...
                  </td>
                </tr>
              ) : loans.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No pawn loans found. Click <strong>+ New Gold Loan (Pledge)</strong> to create one.
                  </td>
                </tr>
              ) : (
                loans.map((ln) => (
                  <tr key={ln.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: '600' }}>
                      <span style={{ color: 'var(--primary-color)' }}>{ln.loan_number}</span>
                      <span className="badge" style={{ marginLeft: '6px', fontSize: '0.65rem', padding: '2px 5px', backgroundColor: ln.loan_type === 'OPEN' ? '#e0e7ff' : '#f1f5f9', color: ln.loan_type === 'OPEN' ? '#3730a3' : '#475569' }}>
                        {ln.loan_type || 'FIXED'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>{ln.pledge_date || ln.loan_date}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{ fontWeight: ln.is_overdue ? '600' : 'normal', color: ln.is_overdue ? 'var(--danger)' : 'inherit' }}>
                        {ln.maturity_date || ln.due_date || (ln.loan_type === 'OPEN' ? <em style={{ color: 'var(--text-muted)' }}>Open</em> : '-')}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: '500' }}>{ln.customer_name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{ln.customer_phone}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: '600' }}>
                      ₹{(ln.principal_amount_paise / 100).toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div>{ln.monthly_interest_rate_pct}% / {ln.interest_type === 'WEEKLY' ? 'wk' : 'mo'}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {ln.interest_duration} {ln.interest_type === 'WEEKLY' ? 'wks' : 'mos'}
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {(ln.total_net_weight_mg / 1000).toFixed(3)} g
                      <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '4px' }}>
                        ({ln.total_item_count} items)
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {ln.is_overdue && ln.status === 'ACTIVE' ? (
                        <span className="badge" style={{ backgroundColor: '#fee2e2', color: '#b91c1c' }}>
                          OVERDUE
                        </span>
                      ) : (
                        <span className={`badge ${ln.status === 'ACTIVE' ? 'badge-success' : 'badge-secondary'}`}>
                          {ln.status}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <button className="btn btn-sm btn-secondary" onClick={() => viewLoanDetails(ln.id)}>
                        Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Loan Modal */}
      {showCreateModal && (
        <div className="modal-backdrop" onClick={() => !savingLoan && setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1100px', width: '96vw' }}>
            <div className="modal-header">
              <h3>Create New Gold Pledge Loan</h3>
              <button className="close-btn" onClick={() => !savingLoan && setShowCreateModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreateLoan}>
              <div className="modal-body" style={{ maxHeight: '82vh', overflowY: 'auto', padding: '1.5rem' }}>
                {createError && (
                  <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
                    {createError}
                  </div>
                )}

                {/* Section 1: Customer Selection */}
                <div style={{ marginBottom: '1.25rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                  <label className="form-label" style={{ fontWeight: '600' }}>1. Customer Selection *</label>
                  {!selectedCustomer ? (
                    <div>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Search existing customer by name, mobile, or CUST code..."
                        value={customerSearch}
                        onChange={(e) => searchCustomers(e.target.value)}
                      />
                      {customerResults.length > 0 && (
                        <div style={{
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          marginTop: '4px',
                          maxHeight: '140px',
                          overflowY: 'auto',
                          background: '#fff',
                          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                        }}>
                          {customerResults.map((c) => (
                            <div
                              key={c.id}
                              style={{
                                padding: '8px 12px',
                                borderBottom: '1px solid #f1f5f9',
                                cursor: 'pointer',
                                display: 'flex',
                                justifyContent: 'space-between'
                              }}
                              onClick={() => { setSelectedCustomer(c); setCustomerResults([]); }}
                            >
                              <span><strong>{c.name}</strong> ({c.customer_code})</span>
                              <span style={{ color: 'var(--text-muted)' }}>{c.phone}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {searchingCustomer && <p style={{ fontSize: '0.8rem', color: '#64748b' }}>Searching...</p>}
                    </div>
                  ) : (
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: '#f8fafc',
                      padding: '10px 14px',
                      borderRadius: '6px',
                      border: '1px solid #e2e8f0'
                    }}>
                      <div>
                        <strong>{selectedCustomer.name}</strong> ({selectedCustomer.customer_code})
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          Phone: {selectedCustomer.phone} | {selectedCustomer.address || selectedCustomer.city || 'No address'}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        onClick={() => setSelectedCustomer(null)}
                      >
                        Change
                      </button>
                    </div>
                  )}
                </div>

                {/* Section 2: Gold Ornaments Table */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <label className="form-label" style={{ fontWeight: '600', margin: 0 }}>
                      2. Pledged Gold Ornaments & Weight Calculator *
                    </label>
                    <button type="button" className="btn btn-sm btn-secondary" onClick={addItemRow}>
                      + Add Item
                    </button>
                  </div>

                  <table style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9', textAlign: 'left', borderBottom: '1px solid #cbd5e1' }}>
                        <th style={{ padding: '8px 10px', width: '180px' }}>Ornament</th>
                        <th style={{ padding: '8px 10px' }}>Description</th>
                        <th style={{ padding: '8px 10px', width: '70px' }}>Qty</th>
                        <th style={{ padding: '8px 10px', width: '110px' }}>Gross (g) *</th>
                        <th style={{ padding: '8px 10px', width: '110px' }}>Stone (g)</th>
                        <th style={{ padding: '8px 10px', width: '110px' }}>Net (g)</th>
                        <th style={{ padding: '8px 10px', width: '100px' }}>Purity</th>
                        <th style={{ padding: '8px 10px', width: '40px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, idx) => {
                        const g = parseFloat(it.gross_weight_grams) || 0;
                        const s = parseFloat(it.stone_weight_grams) || 0;
                        const netG = Math.max(0, g - s).toFixed(3);

                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '6px' }}>
                              <select
                                className="form-control"
                                style={{ padding: '4px', fontSize: '0.85rem' }}
                                value={it.ornament_type}
                                onChange={(e) => updateItemField(idx, 'ornament_type', e.target.value)}
                              >
                                {ornamentMaster.map((om) => (
                                  <option key={om.id} value={om.name}>{om.name}</option>
                                ))}
                                <option value="__ADD_CUSTOM__" style={{ color: 'var(--primary-color)', fontWeight: 'bold' }}>
                                  + Add Custom Ornament...
                                </option>
                              </select>
                            </td>
                            <td style={{ padding: '6px' }}>
                              <input
                                type="text"
                                className="form-control"
                                placeholder="e.g. Hallmark 916"
                                style={{ padding: '4px', fontSize: '0.85rem' }}
                                value={it.description}
                                onChange={(e) => updateItemField(idx, 'description', e.target.value)}
                              />
                            </td>
                            <td style={{ padding: '6px' }}>
                              <input
                                type="number"
                                min="1"
                                className="form-control"
                                style={{ padding: '4px', fontSize: '0.85rem' }}
                                value={it.item_count}
                                onChange={(e) => updateItemField(idx, 'item_count', e.target.value)}
                              />
                            </td>
                            <td style={{ padding: '6px' }}>
                              <input
                                type="number"
                                step="0.001"
                                min="0.001"
                                placeholder="0.000"
                                className="form-control"
                                style={{ padding: '4px', fontSize: '0.85rem' }}
                                value={it.gross_weight_grams}
                                onChange={(e) => updateItemField(idx, 'gross_weight_grams', e.target.value)}
                              />
                            </td>
                            <td style={{ padding: '6px' }}>
                              <input
                                type="number"
                                step="0.001"
                                min="0"
                                placeholder="0.000"
                                className="form-control"
                                style={{ padding: '4px', fontSize: '0.85rem' }}
                                value={it.stone_weight_grams}
                                onChange={(e) => updateItemField(idx, 'stone_weight_grams', e.target.value)}
                              />
                            </td>
                            <td style={{ padding: '6px', fontWeight: '600', color: '#0f172a' }}>
                              {netG} g
                            </td>
                            <td style={{ padding: '6px' }}>
                              <select
                                className="form-control"
                                style={{ padding: '4px', fontSize: '0.85rem' }}
                                value={it.purity}
                                onChange={(e) => updateItemField(idx, 'purity', e.target.value)}
                              >
                                <option value="22K">22K (916)</option>
                                <option value="24K">24K</option>
                                <option value="20K">20K</option>
                                <option value="18K">18K</option>
                                <option value="OTHER">Other</option>
                              </select>
                            </td>
                            <td style={{ padding: '6px', textAlign: 'center' }}>
                              {items.length > 1 && (
                                <button
                                  type="button"
                                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.1rem' }}
                                  onClick={() => removeItemRow(idx)}
                                >
                                  ×
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Summary row */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '1.5rem',
                    background: '#f8fafc',
                    padding: '8px 14px',
                    borderRadius: '4px',
                    marginTop: '8px',
                    fontSize: '0.9rem'
                  }}>
                    <span>Total Items: <strong>{totals.totalItems}</strong></span>
                    <span>Total Gross: <strong>{totals.totalGrossGrams} g</strong></span>
                    <span>Total Stone: <strong>{totals.totalStoneGrams} g</strong></span>
                    <span style={{ color: 'var(--primary-color)' }}>
                      Total Net Gold: <strong>{totals.totalNetGrams} g</strong>
                    </span>
                  </div>
                </div>

                {/* Section 3: Financial Terms & Admin-Selected Dates */}
                <div style={{ paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                  <label className="form-label" style={{ fontWeight: '600' }}>3. Loan Terms & Admin-Selected Maturity *</label>

                  {/* Row 1: Principal & Interest Type */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div className="form-group">
                      <label className="form-label">Loan Type *</label>
                      <select
                        className="form-control"
                        value={loanType}
                        onChange={(e) => setLoanType(e.target.value)}
                      >
                        <option value="FIXED">FIXED (Fixed Term)</option>
                        <option value="OPEN">OPEN (Flexible / No Due Date)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Principal Amount (₹) *</label>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        required
                        className="form-control"
                        placeholder="e.g. 50000"
                        value={principalInput}
                        onChange={(e) => setPrincipalInput(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Interest Type *</label>
                      <select
                        className="form-control"
                        value={interestType}
                        onChange={(e) => {
                          const newType = e.target.value;
                          setInterestType(newType);
                          // Default reasonable rate/duration for the type
                          if (newType === 'WEEKLY') {
                            setInterestRate('0.5'); // 0.5% per week
                            setInterestDuration('12'); // 12 weeks
                          } else {
                            setInterestRate('1.5'); // 1.5% per month
                            setInterestDuration('12'); // 12 months
                          }
                        }}
                      >
                        <option value="MONTHLY">Monthly Interest</option>
                        <option value="WEEKLY">Weekly Interest</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">
                        Interest Rate (% per {interestType === 'WEEKLY' ? 'week' : 'month'}) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        className="form-control"
                        placeholder={interestType === 'WEEKLY' ? 'e.g. 0.5' : 'e.g. 1.5'}
                        value={interestRate}
                        onChange={(e) => setInterestRate(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">
                        Duration ({interestType === 'WEEKLY' ? 'Weeks' : 'Months'}) *
                      </label>
                      <input
                        type="number"
                        min="1"
                        required
                        className="form-control"
                        value={interestDuration}
                        onChange={(e) => setInterestDuration(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Row 2: Pledge Date & Admin-Defined Maturity Date */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr', gap: '0.75rem' }}>
                    <div className="form-group">
                      <label className="form-label">Pledge Date *</label>
                      <input
                        type="date"
                        required
                        className="form-control"
                        value={pledgeDate}
                        onChange={(e) => setPledgeDate(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <label className="form-label" style={{ margin: 0, color: 'var(--text-dark)' }}>
                          Maturity Date (Optional)
                        </label>
                        {maturityDate && (
                          <button
                            type="button"
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem', padding: 0 }}
                            onClick={() => setMaturityDate('')}
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <input
                        type="date"
                        className="form-control"
                        placeholder="dd-mm-yyyy"
                        value={maturityDate}
                        min={pledgeDate}
                        onChange={(e) => setMaturityDate(e.target.value)}
                      />
                      <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                        Optional: Admin decided date (leave blank if not applicable)
                      </span>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Remarks / Notes</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Optional remarks"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={savingLoan}
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingLoan}>
                  {savingLoan ? 'Processing...' : 'Disburse & Save Loan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Custom Ornament Inline Modal */}
      {showCustomOrnamentModal && (
        <div className="modal-backdrop" onClick={() => !savingCustomOrnament && setShowCustomOrnamentModal(false)} style={{ zIndex: 1100 }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h3>Add Custom Gold Ornament</h3>
              <button className="close-btn" onClick={() => !savingCustomOrnament && setShowCustomOrnamentModal(false)}>×</button>
            </div>
            <form onSubmit={handleSaveCustomOrnament}>
              <div className="modal-body">
                {customOrnamentError && (
                  <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
                    {customOrnamentError}
                  </div>
                )}
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label className="form-label">Ornament Name *</label>
                  <input
                    type="text"
                    required
                    autoFocus
                    className="form-control"
                    placeholder="e.g. Kasu Mala, Vanki, Waist Belt"
                    value={customOrnamentName}
                    onChange={(e) => setCustomOrnamentName(e.target.value)}
                  />
                  <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '3px' }}>
                    This item will be saved permanently to your ornament catalog.
                  </span>
                </div>

                <div className="form-group">
                  <label className="form-label">Default Purity</label>
                  <select
                    className="form-control"
                    value={customOrnamentPurity}
                    onChange={(e) => setCustomOrnamentPurity(e.target.value)}
                  >
                    <option value="22K">22K (916)</option>
                    <option value="24K">24K</option>
                    <option value="20K">20K</option>
                    <option value="18K">18K</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={savingCustomOrnament}
                  onClick={() => setShowCustomOrnamentModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingCustomOrnament}>
                  {savingCustomOrnament ? 'Saving...' : 'Add to Catalog'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Loan Details Modal */}
      {selectedLoan && (
        <div className="modal-backdrop" onClick={() => setSelectedLoan(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <h3>Pawn Ticket Details: {selectedLoan.loan_number}</h3>
              <button className="close-btn" onClick={() => setSelectedLoan(null)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Customer</span>
                  <div style={{ fontWeight: '600', fontSize: '1.05rem' }}>{selectedLoan.customer_name}</div>
                  <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                    {selectedLoan.customer_phone} ({selectedLoan.customer_code})
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Pledge Date / Maturity Date</span>
                  <div style={{ fontWeight: '500' }}>
                    {selectedLoan.pledge_date || selectedLoan.loan_date} / <strong style={{ color: selectedLoan.is_overdue ? 'var(--danger)' : 'inherit' }}>{selectedLoan.maturity_date || selectedLoan.due_date}</strong>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                    Duration: {selectedLoan.interest_duration || selectedLoan.term_months} {selectedLoan.interest_type === 'WEEKLY' ? 'Weeks' : 'Months'}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Principal Amount</span>
                  <div style={{ fontWeight: '700', fontSize: '1.2rem', color: 'var(--primary-color)' }}>
                    ₹{(selectedLoan.principal_amount_paise / 100).toLocaleString('en-IN')}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Interest Terms</span>
                  <div style={{ fontWeight: '600' }}>
                    {selectedLoan.monthly_interest_rate_pct}% per {selectedLoan.interest_type === 'WEEKLY' ? 'week' : 'month'} ({selectedLoan.interest_type})
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                    Approx ₹{((selectedLoan.principal_amount_paise / 100) * (selectedLoan.monthly_interest_rate_pct / 100)).toFixed(2)} / {selectedLoan.interest_type === 'WEEKLY' ? 'week' : 'month'}
                  </div>
                </div>
              </div>

              <h4 style={{ marginBottom: '0.75rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem' }}>
                Pledged Ornaments ({selectedLoan.items ? selectedLoan.items.length : 0})
              </h4>
              <table style={{ width: '100%', fontSize: '0.85rem', marginBottom: '1rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid #cbd5e1' }}>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Gross</th>
                    <th>Stone</th>
                    <th>Net Weight</th>
                    <th>Purity</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedLoan.items?.map((it) => (
                    <tr key={it.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 0', fontWeight: '500' }}>
                        {it.ornament_type} {it.description ? `(${it.description})` : ''}
                      </td>
                      <td>{it.item_count}</td>
                      <td>{(it.gross_weight_mg / 1000).toFixed(3)} g</td>
                      <td>{(it.stone_weight_mg / 1000).toFixed(3)} g</td>
                      <td style={{ fontWeight: '600' }}>{(it.net_weight_mg / 1000).toFixed(3)} g</td>
                      <td>{it.purity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{
                background: '#f8fafc',
                padding: '8px 12px',
                borderRadius: '6px',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.9rem'
              }}>
                <span>Total Items: <strong>{selectedLoan.total_item_count}</strong></span>
                <span>Total Gross: <strong>{(selectedLoan.total_gross_weight_mg / 1000).toFixed(3)} g</strong></span>
                <span style={{ color: 'var(--primary-color)' }}>
                  Total Net Gold: <strong>{(selectedLoan.total_net_weight_mg / 1000).toFixed(3)} g</strong>
                </span>
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <div>
                {selectedLoan.status === 'ACTIVE' && (
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setSelectedLoan(null);
                      navigate('/payments');
                    }}
                  >
                    💳 Record Payment / Settle Loan
                  </button>
                )}
              </div>
              <button className="btn btn-secondary" onClick={() => setSelectedLoan(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

