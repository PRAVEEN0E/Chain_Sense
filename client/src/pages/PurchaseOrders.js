import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrencyINR } from '../utils/currency';

const PurchaseOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [filter, setFilter] = useState('');
  const { isManager, isAdmin, isVendor, user } = useAuth();

  const [formData, setFormData] = useState({
    vendor_id: '',
    items: [{ item_id: '', quantity: 1, unit_price: 0 }],
    expected_delivery_date: '',
    notes: '',
  });

  useEffect(() => {
    fetchOrders();
    fetchVendors();
    fetchInventory();
  }, [filter]);

  const fetchOrders = async () => {
    try {
      let params = filter ? `?status=${filter}` : '';
      // If vendor, only show their orders (need vendor_id - will be set up via backend)
      const response = await axios.get(`/api/purchase-orders${params}`);
      
      // Filter orders for vendors - they should only see orders assigned to them
      // Note: This requires vendor_id mapping. For now, vendors see all orders.
      // In production, link vendor_id in users table to vendors table
      setOrders(response.data);
    } catch (error) {
      toast.error('Failed to load purchase orders');
    } finally {
      setLoading(false);
    }
  };

  const fetchVendors = async () => {
    try {
      const response = await axios.get('/api/vendors?status=active');
      setVendors(response.data);
    } catch (error) {
      console.error('Failed to load vendors');
    }
  };

  const fetchInventory = async () => {
    try {
      const response = await axios.get('/api/inventory');
      setInventory(response.data);
    } catch (error) {
      console.error('Failed to load inventory');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.vendor_id || formData.items.length === 0) {
      toast.error('Please select a vendor and add items');
      return;
    }

    try {
      await axios.post('/api/purchase-orders', formData);
      toast.success('Purchase order created successfully');
      setShowModal(false);
      resetForm();
      fetchOrders();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create order');
    }
  };

  const handleAddItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { item_id: '', quantity: 1, unit_price: 0 }],
    });
  };

  const handleRemoveItem = (index) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index),
    });
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index][field] = value;

    // Auto-fill price if item is selected
    if (field === 'item_id' && value) {
      const item = inventory.find((i) => i.id === parseInt(value));
      if (item && item.unit_price) {
        newItems[index].unit_price = item.unit_price;
      }
    }

    setFormData({ ...formData, items: newItems });
  };

  const handleStatusUpdate = async (orderId, status) => {
    try {
      const response = await axios.put(`/api/purchase-orders/${orderId}`, { status });
      
      if (status === 'completed') {
        if (response.data.inventory_updated) {
          const details = response.data.inventory_details;
          if (details && details.length > 0) {
            const summary = details.map(d => 
              `${d.item_name}: ${d.old_quantity} → ${d.new_quantity} (+${d.quantity_added})`
            ).join(', ');
            toast.success(`Order completed! Inventory updated: ${summary}`, { duration: 5000 });
          } else {
            toast.success('Order marked as completed! Inventory has been automatically updated.');
          }
        } else if (response.data.inventory_error) {
          toast.error(`Order completed but inventory update failed: ${response.data.inventory_error}`);
        } else if (response.data.debug && response.data.debug.was_already_completed) {
          toast.success('Order status updated (was already completed, inventory not updated again)');
        } else {
          toast.success('Order marked as completed! Inventory update in progress...');
        }
      } else {
        toast.success('Order status updated');
      }
      fetchOrders();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update status');
    }
  };

  const resetForm = () => {
    setFormData({
      vendor_id: '',
      items: [{ item_id: '', quantity: 1, unit_price: 0 }],
      expected_delivery_date: '',
      notes: '',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Purchase Orders</h1>
          <p className="mt-1 text-sm text-gray-500">
            {isVendor ? 'View your purchase orders' : 'Manage purchase orders and vendor communications'}
          </p>
        </div>
        {(isManager || isAdmin) && !isVendor && (
          <button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            + Create PO
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
          <option value="">All Orders</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Orders List */}
      <div className="space-y-4">
        {orders.map((order) => (
          <div key={order.id} className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{order.po_number}</h3>
                <p className="text-sm text-gray-500">Vendor: {order.vendor_name}</p>
                <p className="text-sm text-gray-500">Created: {new Date(order.order_date).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(order.status)}`}>
                  {order.status}
                </span>
                <span className="text-lg font-bold text-gray-900">{formatCurrencyINR(order.total_amount)}</span>
              </div>
            </div>

            {order.items && order.items.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Items:</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Item</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Quantity</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Unit Price</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {order.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-2 text-sm text-gray-900">{item.item_name}</td>
                          <td className="px-4 py-2 text-sm text-gray-900">{item.quantity}</td>
                          <td className="px-4 py-2 text-sm text-gray-900">{formatCurrencyINR(item.unit_price)}</td>
                          <td className="px-4 py-2 text-sm text-gray-900">{formatCurrencyINR(item.subtotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {order.status === 'pending' && (isManager || isAdmin || isVendor) && (
              <div className="mt-4 pt-4 border-t flex gap-2">
                {isVendor && (
                  <button
                    onClick={() => handleStatusUpdate(order.id, 'completed')}
                    className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    Mark Completed
                  </button>
                )}
                {(isManager || isAdmin) && (
                  <>
                    <button
                      onClick={() => handleStatusUpdate(order.id, 'completed')}
                      className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      Mark Completed
                    </button>
                    <button
                      onClick={() => handleStatusUpdate(order.id, 'cancelled')}
                      className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Create Purchase Order</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Vendor *</label>
                    <select
                      required
                      value={formData.vendor_id}
                      onChange={(e) => setFormData({ ...formData, vendor_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="">Select Vendor</option>
                      {vendors.map((vendor) => (
                        <option key={vendor.id} value={vendor.id}>
                          {vendor.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Expected Delivery Date</label>
                    <input
                      type="date"
                      value={formData.expected_delivery_date}
                      onChange={(e) => setFormData({ ...formData, expected_delivery_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-700">Items *</label>
                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="px-3 py-1 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                    >
                      + Add Item
                    </button>
                  </div>
                  {formData.items.map((item, index) => (
                    <div key={index} className="grid grid-cols-4 gap-3 mb-3">
                      <select
                        required
                        value={item.item_id}
                        onChange={(e) => handleItemChange(index, 'item_id', e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        <option value="">Select Item</option>
                        {inventory.map((inv) => (
                          <option key={inv.id} value={inv.id}>
                            {inv.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        required
                        min="1"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                        placeholder="Qty"
                        className="px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      <input
                        type="number"
                        required
                        step="0.01"
                        min="0"
                        value={item.unit_price}
                        onChange={(e) => handleItemChange(index, 'unit_price', e.target.value)}
                        placeholder="Price"
                        className="px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700">
                          {formatCurrencyINR(item.quantity * item.unit_price)}
                        </span>
                        {formData.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(index)}
                            className="text-red-600 hover:text-red-900"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="mt-2 text-right text-lg font-semibold text-gray-900">
                    Total: {formatCurrencyINR(
                      formData.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    rows="3"
                  />
                </div>

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
                    Create Order
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseOrders;

