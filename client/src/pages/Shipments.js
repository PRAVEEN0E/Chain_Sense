import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

const Shipments = () => {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [filter, setFilter] = useState('');
  const { isVendor } = useAuth();

  const [formData, setFormData] = useState({
    vendor_id: '',
    po_id: '',
    origin_address: '',
    destination_address: '',
    carrier: '',
    estimated_delivery: '',
  });

  useEffect(() => {
    fetchShipments();
    fetchVendors();
  }, [filter]);

  const fetchShipments = async () => {
    try {
      const params = filter ? `?status=${filter}` : '';
      const response = await axios.get(`/api/shipments${params}`);
      setShipments(response.data);
    } catch (error) {
      toast.error('Failed to load shipments');
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

  const fetchShipmentDetails = async (id) => {
    try {
      const response = await axios.get(`/api/shipments/${id}`);
      setSelectedShipment(response.data);
    } catch (error) {
      toast.error('Failed to load shipment details');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/shipments', formData);
      toast.success('Shipment created successfully');
      setShowModal(false);
      resetForm();
      fetchShipments();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create shipment');
    }
  };

  const handleUpdateLocation = async (shipmentId, location, lat, lng) => {
    try {
      await axios.put(`/api/shipments/${shipmentId}`, {
        current_location: location,
        current_lat: lat,
        current_lng: lng,
        notes: 'Location updated',
      });
      toast.success('Location updated');
      fetchShipments();
      if (selectedShipment?.id === shipmentId) {
        fetchShipmentDetails(shipmentId);
      }
    } catch (error) {
      toast.error('Failed to update location');
    }
  };

  const handleStatusUpdate = async (shipmentId, status) => {
    try {
      await axios.put(`/api/shipments/${shipmentId}`, { status });
      toast.success('Status updated');
      fetchShipments();
      if (selectedShipment?.id === shipmentId) {
        fetchShipmentDetails(shipmentId);
      }
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const resetForm = () => {
    setFormData({
      vendor_id: '',
      po_id: '',
      origin_address: '',
      destination_address: '',
      carrier: '',
      estimated_delivery: '',
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
      case 'delivered':
        return 'bg-green-100 text-green-800';
      case 'in_transit':
        return 'bg-blue-100 text-blue-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Shipments</h1>
          <p className="mt-1 text-sm text-gray-500">
            {isVendor ? 'Track your shipments' : 'Track and manage shipments in real-time'}
          </p>
        </div>
        {!isVendor && (
          <button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            + Create Shipment
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
          <option value="">All Shipments</option>
          <option value="pending">Pending</option>
          <option value="in_transit">In Transit</option>
          <option value="delivered">Delivered</option>
        </select>
      </div>

      {/* Shipments List */}
      <div className="space-y-4">
        {shipments.map((shipment) => (
          <div key={shipment.id} className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Tracking: {shipment.tracking_number}</h3>
                <p className="text-sm text-gray-500">Vendor: {shipment.vendor_name}</p>
                {shipment.po_number && <p className="text-sm text-gray-500">PO: {shipment.po_number}</p>}
                <p className="text-sm text-gray-500">
                  {shipment.current_location || shipment.origin_address}
                </p>
              </div>
              <div className="text-right">
                <span className={`px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(shipment.status)}`}>
                  {shipment.status?.replace('_', ' ')}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
              <div>
                <p className="font-medium">Origin:</p>
                <p>{shipment.origin_address}</p>
              </div>
              <div>
                <p className="font-medium">Destination:</p>
                <p>{shipment.destination_address}</p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t flex gap-2">
              <button
                onClick={() => fetchShipmentDetails(shipment.id)}
                className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                View Details & Map
              </button>
              {shipment.status !== 'delivered' && (
                <>
                  <button
                    onClick={() => handleStatusUpdate(shipment.id, 'in_transit')}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Mark In Transit
                  </button>
                  <button
                    onClick={() => handleStatusUpdate(shipment.id, 'delivered')}
                    className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    Mark Delivered
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Shipment Details Modal */}
      {selectedShipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-900">
                  Tracking: {selectedShipment.tracking_number}
                </h2>
                <button
                  onClick={() => setSelectedShipment(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Shipment Information</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">Status:</p>
                      <p className="font-medium">{selectedShipment.status}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Carrier:</p>
                      <p className="font-medium">{selectedShipment.carrier || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Origin:</p>
                      <p className="font-medium">{selectedShipment.origin_address}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Destination:</p>
                      <p className="font-medium">{selectedShipment.destination_address}</p>
                    </div>
                    {selectedShipment.current_location && (
                      <div>
                        <p className="text-gray-500">Current Location:</p>
                        <p className="font-medium">{selectedShipment.current_location}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Google Maps Integration Placeholder */}
                {(selectedShipment.current_lat && selectedShipment.current_lng) && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Location on Map</h3>
                    <div className="h-64 bg-gray-200 rounded-lg flex items-center justify-center">
                      <a
                        href={`https://www.google.com/maps?q=${selectedShipment.current_lat},${selectedShipment.current_lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:text-primary-700"
                      >
                        View on Google Maps
                      </a>
                    </div>
                  </div>
                )}

                {selectedShipment.history && selectedShipment.history.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Shipment History</h3>
                    <div className="space-y-2">
                      {selectedShipment.history.map((entry, idx) => (
                        <div key={idx} className="bg-gray-50 p-3 rounded-lg text-sm">
                          <div className="flex justify-between">
                            <span className="font-medium">{entry.status}</span>
                            <span className="text-gray-500">
                              {new Date(entry.timestamp).toLocaleString()}
                            </span>
                          </div>
                          {entry.location && <p className="text-gray-600 mt-1">📍 {entry.location}</p>}
                          {entry.notes && <p className="text-gray-600 mt-1">{entry.notes}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t">
                  <button
                    onClick={() => {
                      const location = prompt('Enter current location:');
                      if (location) {
                        // Simulate coordinates - in production, use geocoding API
                        const lat = selectedShipment.current_lat || 37.7749;
                        const lng = selectedShipment.current_lng || -122.4194;
                        handleUpdateLocation(selectedShipment.id, location, lat, lng);
                      }
                    }}
                    className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                  >
                    Update Location
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Create Shipment</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Origin Address *</label>
                  <textarea
                    required
                    value={formData.origin_address}
                    onChange={(e) => setFormData({ ...formData, origin_address: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    rows="2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Destination Address *</label>
                  <textarea
                    required
                    value={formData.destination_address}
                    onChange={(e) => setFormData({ ...formData, destination_address: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    rows="2"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Carrier</label>
                    <input
                      type="text"
                      value={formData.carrier}
                      onChange={(e) => setFormData({ ...formData, carrier: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Delivery</label>
                    <input
                      type="date"
                      value={formData.estimated_delivery}
                      onChange={(e) => setFormData({ ...formData, estimated_delivery: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
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
                    Create Shipment
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

export default Shipments;

