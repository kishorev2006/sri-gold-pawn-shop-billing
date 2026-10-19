import React, { useState, useEffect } from 'react';
import { customerService } from '../services/customerService';

export function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    alternate_phone: '',
    address: '',
    city: '',
    id_proof_type: 'AADHAAR',
    id_proof_number: ''
  });

  const loadCustomers = async (query = '') => {
    try {
      setLoading(true);
      setError(null);
      const data = await customerService.search(query);
      setCustomers(data);
    } catch (err) {
      setError(err.message || 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers('');
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    loadCustomers(searchQuery);
  };

  const openNewCustomerModal = () => {
    setIsEditing(false);
    setFormData({
      name: '',
      phone: '',
      alternate_phone: '',
      address: '',
      city: '',
      id_proof_type: 'AADHAAR',
      id_proof_number: ''
    });
    setFormError(null);
    setShowModal(true);
  };

  const openEditModal = (c) => {
    setIsEditing(true);
    setFormData({
      id: c.id,
      name: c.name || '',
      phone: c.phone || '',
      alternate_phone: c.alternate_phone || '',
      address: c.address || '',
      city: c.city || '',
      id_proof_type: c.id_proof_type || 'AADHAAR',
      id_proof_number: c.id_proof_number || ''
    });
    setFormError(null);
    setShowModal(true);
  };

  const viewCustomerProfile = async (id) => {
    try {
      setLoading(true);
      const full = await customerService.getById(id);
      setSelectedCustomer(full);
    } catch (err) {
      alert('Could not load profile: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.name.trim()) {
      setFormError('Customer name is required.');
      return;
    }
    if (!/^\d{10}$/.test(formData.phone.trim())) {
      setFormError('A valid 10-digit mobile number is required.');
      return;
    }

    try {
      setSaving(true);
      if (isEditing) {
        await customerService.update(formData);
      } else {
        await customerService.create(formData);
      }
      setShowModal(false);
      loadCustomers(searchQuery);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="page-title">Customer Directory</h2>
          <p className="page-subtitle">Search, register, and manage pawn customer accounts</p>
        </div>
        <button className="btn btn-primary" onClick={openNewCustomerModal}>
          + Register Customer
        </button>
      </div>

      {/* Search Toolbar */}
      <div className="card" style={{ marginBottom: '1.25rem', padding: '1rem' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.75rem' }}>
          <input
            type="text"
            className="form-control"
            placeholder="Search by customer name, 10-digit phone, or code (e.g. CUST-0001)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn btn-primary">Search</button>
          {searchQuery && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => { setSearchQuery(''); loadCustomers(''); }}
            >
              Reset
            </button>
          )}
        </form>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {/* Customers Table */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Code</th>
                <th style={{ padding: '0.75rem 1rem' }}>Name</th>
                <th style={{ padding: '0.75rem 1rem' }}>Phone</th>
                <th style={{ padding: '0.75rem 1rem' }}>City / Address</th>
                <th style={{ padding: '0.75rem 1rem' }}>ID Proof</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Loading customers...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No customer records found. Click <strong>+ Register Customer</strong> to create one.
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span className="badge badge-primary" style={{ fontFamily: 'monospace' }}>
                        {c.customer_code}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: '500' }}>{c.name}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>{c.phone}</td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)' }}>
                      {c.address ? `${c.address}, ${c.city}` : c.city}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {c.id_proof_type ? (
                        <span style={{ fontSize: '0.85rem' }}>
                          {c.id_proof_type}: {c.id_proof_number || 'N/A'}
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>None</span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <button
                        className="btn btn-sm btn-secondary"
                        style={{ marginRight: '0.5rem' }}
                        onClick={() => viewCustomerProfile(c.id)}
                      >
                        Profile
                      </button>
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => openEditModal(c)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer Profile Drawer / Modal */}
      {selectedCustomer && (
        <div className="modal-backdrop" onClick={() => setSelectedCustomer(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <h3>Customer Profile: {selectedCustomer.name}</h3>
              <button className="close-btn" onClick={() => setSelectedCustomer(null)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Customer Code</span>
                  <div style={{ fontWeight: '600', fontSize: '1.1rem', color: 'var(--primary-color)' }}>
                    {selectedCustomer.customer_code}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Phone Number</span>
                  <div style={{ fontWeight: '600' }}>{selectedCustomer.phone}</div>
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Address</span>
                  <div>{selectedCustomer.address || 'Not provided'}</div>
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>KYC Document</span>
                  <div>
                    {selectedCustomer.id_proof_type} {selectedCustomer.id_proof_number ? `(${selectedCustomer.id_proof_number})` : ''}
                  </div>
                </div>
              </div>

              <h4 style={{ marginBottom: '0.75rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                Loan History ({selectedCustomer.loans ? selectedCustomer.loans.length : 0})
              </h4>
              {(!selectedCustomer.loans || selectedCustomer.loans.length === 0) ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No loans associated with this customer yet.</p>
              ) : (
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  <table style={{ width: '100%', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                        <th>Loan #</th>
                        <th>Date</th>
                        <th>Principal</th>
                        <th>Rate</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCustomer.loans.map((ln) => (
                        <tr key={ln.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '0.4rem 0', fontWeight: '500' }}>{ln.loan_number}</td>
                          <td>{ln.loan_date}</td>
                          <td>₹{(ln.principal_amount_paise / 100).toLocaleString('en-IN')}</td>
                          <td>{ln.monthly_interest_rate_pct}% / mo</td>
                          <td>
                            <span className={`badge ${ln.status === 'ACTIVE' ? 'badge-success' : 'badge-secondary'}`}>
                              {ln.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedCustomer(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Customer Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => !saving && setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h3>{isEditing ? 'Edit Customer' : 'Register New Customer'}</h3>
              <button className="close-btn" onClick={() => !saving && setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {formError && (
                  <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
                    {formError}
                  </div>
                )}
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label className="form-label">Full Name *</label>
                  <input
                    type="text"
                    required
                    className="form-control"
                    placeholder="Enter customer name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Primary Mobile *</label>
                    <input
                      type="tel"
                      required
                      maxLength="10"
                      className="form-control"
                      placeholder="10-digit number"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '') })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Alternate Mobile</label>
                    <input
                      type="tel"
                      maxLength="10"
                      className="form-control"
                      placeholder="Optional"
                      value={formData.alternate_phone}
                      onChange={(e) => setFormData({ ...formData, alternate_phone: e.target.value.replace(/\D/g, '') })}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label className="form-label">Street Address</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="House no, Street name"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">City / Town</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Tirunelveli (optional)"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">ID Proof Type</label>
                    <select
                      className="form-control"
                      value={formData.id_proof_type}
                      onChange={(e) => setFormData({ ...formData, id_proof_type: e.target.value })}
                    >
                      <option value="AADHAAR">Aadhaar Card</option>
                      <option value="PAN">PAN Card</option>
                      <option value="VOTER_ID">Voter ID</option>
                      <option value="DRIVING_LICENSE">Driving License</option>
                      <option value="RATION_CARD">Ration Card</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">ID Proof Number / Ref</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. 12-digit Aadhaar or PAN"
                    value={formData.id_proof_number}
                    onChange={(e) => setFormData({ ...formData, id_proof_number: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={saving}
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : isEditing ? 'Update Customer' : 'Save Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
