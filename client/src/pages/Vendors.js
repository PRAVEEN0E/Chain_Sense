import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Vendors = () => {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [filter, setFilter] = useState('');
  const { isManager, isAdmin } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    contact_person: '',
    payment_terms: '',
    rating: 0,
    status: 'active',
    create_account: false,
    password: '',
  });
  const [createdCredentials, setCreatedCredentials] = useState(null);

  useEffect(() => {
    fetchVendors();
  }, [filter]);

  const fetchVendors = async () => {
    try {
      const params = filter ? `?status=${filter}` : '';
      const response = await axios.get(`/api/vendors${params}`);
      setVendors(response.data);
    } catch (error) {
      toast.error('Failed to load vendors');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        rating: parseFloat(formData.rating),
      };

      if (editingVendor) {
        await axios.put(`/api/vendors/${editingVendor.id}`, payload);
        toast.success('Vendor updated successfully');
        setShowModal(false);
        resetForm();
        fetchVendors();
      } else {
        const response = await axios.post('/api/vendors', payload);
        if (response.data.user_account && response.data.user_account.password) {
          // Show credentials modal
          setCreatedCredentials(response.data.user_account);
          toast.success('Vendor created with login account!');
        } else {
          toast.success('Vendor created successfully');
          setShowModal(false);
          resetForm();
        }
        fetchVendors();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Operation failed');
    }
  };

  const handleEdit = (vendor) => {
    setEditingVendor(vendor);
    setFormData({
      name: vendor.name || '',
      email: vendor.email || '',
      phone: vendor.phone || '',
      address: vendor.address || '',
      contact_person: vendor.contact_person || '',
      payment_terms: vendor.payment_terms || '',
      rating: vendor.rating || 0,
      status: vendor.status || 'active',
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this vendor?')) return;

    try {
      await axios.delete(`/api/vendors/${id}`);
      toast.success('Vendor deleted successfully');
      fetchVendors();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Delete failed');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      address: '',
      contact_person: '',
      payment_terms: '',
      rating: 0,
      status: 'active',
      create_account: false,
      password: '',
    });
    setEditingVendor(null);
    setCreatedCredentials(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Vendors</h1>
          <p className="mt-1 text-sm text-gray-500">Manage your vendor relationships</p>
        </div>
        {(isManager || isAdmin) && (
          <button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            + Add Vendor
          </button>
        )}
      </div>

      {/* Filter */}
      <div className="bg-white rounded-lg shadow p-4">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg"
        >
          <option value="">All Vendors</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Vendors Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {vendors.map((vendor) => (
          <div key={vendor.id} className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{vendor.name}</h3>
                <div className="flex items-center mt-1">
                  <span className="text-yellow-400">★</span>
                  <span className="ml-1 text-sm text-gray-600">{vendor.rating?.toFixed(1) || '0.0'}</span>
                </div>
              </div>
              <span
                className={`px-2 py-1 text-xs font-semibold rounded-full ${
                  vendor.status === 'active'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {vendor.status}
              </span>
            </div>

            <div className="space-y-2 text-sm text-gray-600">
              {vendor.email && <p>📧 {vendor.email}</p>}
              {vendor.phone && <p>📱 {vendor.phone}</p>}
              {vendor.contact_person && <p>👤 {vendor.contact_person}</p>}
              {vendor.address && <p>📍 {vendor.address}</p>}
              {vendor.payment_terms && <p>💳 {vendor.payment_terms}</p>}
            </div>

            <div className="mt-4 pt-4 border-t flex gap-2">
              <Link
                to={`/purchase-orders?vendor_id=${vendor.id}`}
                className="flex-1 text-center px-3 py-2 text-sm bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 transition-colors"
              >
                View Orders
              </Link>
              {(isManager || isAdmin) && (
                <>
                  <button
                    onClick={() => handleEdit(vendor)}
                    className="px-3 py-2 text-sm text-primary-600 hover:text-primary-900"
                  >
                    Edit
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => handleDelete(vendor.id)}
                      className="px-3 py-2 text-sm text-red-600 hover:text-red-900"
                    >
                      Delete
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                {editingVendor ? 'Edit Vendor' : 'Add New Vendor'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person</label>
                    <input
                      type="text"
                      value={formData.contact_person}
                      onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                  <textarea
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    rows="2"
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Terms</label>
                    <input
                      type="text"
                      value={formData.payment_terms}
                      onChange={(e) => setFormData({ ...formData, payment_terms: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="e.g., Net 30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Rating</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="5"
                      value={formData.rating}
                      onChange={(e) => setFormData({ ...formData, rating: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>
                {!editingVendor && (
                  <div className="border-t pt-4 mt-4">
                    <label className="flex items-center gap-2 mb-3">
                      <input
                        type="checkbox"
                        checked={formData.create_account}
                        onChange={(e) => setFormData({ ...formData, create_account: e.target.checked })}
                        className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                      <span className="text-sm font-medium text-gray-700">Create login account for vendor</span>
                    </label>
                    {formData.create_account && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Custom Password (optional - will auto-generate if left empty)
                        </label>
                        <input
                          type="password"
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          placeholder="Leave empty for auto-generated password"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          If empty, password will be: (username)123
                        </p>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      resetForm();
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                  >
                    {editingVendor ? 'Update' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Credentials Modal */}
      {createdCredentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-900">Vendor Account Created!</h2>
                <button
                  onClick={() => {
                    setCreatedCredentials(null);
                    setShowModal(false);
                    resetForm();
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>
              
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-yellow-800 font-semibold mb-2">⚠️ Save these credentials now!</p>
                <p className="text-xs text-yellow-700">
                  These credentials will not be shown again. Please copy them securely.
                </p>
              </div>

              <div className="space-y-3 bg-gray-50 p-4 rounded-lg">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Username</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded text-sm font-mono">
                      {createdCredentials.username}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(createdCredentials.username);
                        toast.success('Username copied!');
                      }}
                      className="px-3 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 text-sm"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded text-sm font-mono">
                      {createdCredentials.email}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(createdCredentials.email);
                        toast.success('Email copied!');
                      }}
                      className="px-3 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 text-sm"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                {createdCredentials.password && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Password</label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded text-sm font-mono">
                        {createdCredentials.password}
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(createdCredentials.password);
                          toast.success('Password copied!');
                        }}
                        className="px-3 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 text-sm"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Role</label>
                  <code className="block px-3 py-2 bg-white border border-gray-300 rounded text-sm font-mono capitalize">
                    {createdCredentials.role}
                  </code>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => {
                    setCreatedCredentials(null);
                    setShowModal(false);
                    resetForm();
                  }}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Vendors;

