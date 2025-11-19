import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

const Analytics = () => {
  const [dashboardData, setDashboardData] = useState(null);
  const [inventoryTrends, setInventoryTrends] = useState([]);
  const [vendorPerformance, setVendorPerformance] = useState([]);
  const [orderTrends, setOrderTrends] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const [dashboardRes, trendsRes, vendorRes, orderRes] = await Promise.all([
        axios.get('/api/analytics/dashboard'),
        axios.get('/api/analytics/inventory-trends'),
        axios.get('/api/analytics/vendor-performance'),
        axios.get('/api/analytics/order-trends'),
      ]);

      setDashboardData(dashboardRes.data);
      setInventoryTrends(trendsRes.data);
      setVendorPerformance(vendorRes.data);
      setOrderTrends(orderRes.data);
    } catch (error) {
      toast.error('Failed to load analytics');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (type) => {
    try {
      const response = await axios.get(`/api/analytics/export/${type}`, {
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${type}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();

      toast.success(`Exported ${type} data successfully`);
    } catch (error) {
      toast.error('Failed to export data');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const inventoryChartData = {
    labels: inventoryTrends.map((t) => t.category || 'Uncategorized'),
    datasets: [
      {
        label: 'Total Quantity',
        data: inventoryTrends.map((t) => t.total_quantity || 0),
        backgroundColor: 'rgba(59, 130, 246, 0.5)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 2,
      },
    ],
  };

  const vendorChartData = {
    labels: vendorPerformance.slice(0, 10).map((v) => v.name),
    datasets: [
      {
        label: 'Total Order Value',
        data: vendorPerformance.slice(0, 10).map((v) => v.total_value || 0),
        backgroundColor: 'rgba(34, 197, 94, 0.5)',
        borderColor: 'rgba(34, 197, 94, 1)',
        borderWidth: 2,
      },
    ],
  };

  const orderTrendsData = {
    labels: orderTrends.map((t) => t.month),
    datasets: [
      {
        label: 'Number of Orders',
        data: orderTrends.map((t) => t.order_count || 0),
        backgroundColor: 'rgba(168, 85, 247, 0.5)',
        borderColor: 'rgba(168, 85, 247, 1)',
        borderWidth: 2,
      },
      {
        label: 'Total Value ($)',
        data: orderTrends.map((t) => (t.total_value || 0) / 1000),
        backgroundColor: 'rgba(251, 191, 36, 0.5)',
        borderColor: 'rgba(251, 191, 36, 1)',
        borderWidth: 2,
        yAxisID: 'y1',
      },
    ],
  };

  const orderValueChartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    scales: {
      y: {
        type: 'linear',
        display: true,
        position: 'left',
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        grid: {
          drawOnChartArea: false,
        },
      },
    },
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analytics & Reports</h1>
          <p className="mt-1 text-sm text-gray-500">Comprehensive insights into your supply chain</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleExport('inventory')}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            Export Inventory
          </button>
          <button
            onClick={() => handleExport('vendors')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Export Vendors
          </button>
          <button
            onClick={() => handleExport('orders')}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            Export Orders
          </button>
          <button
            onClick={() => handleExport('shipments')}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Export Shipments
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      {dashboardData && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm font-medium text-gray-500">Total Inventory Value</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">
              ${((dashboardData.inventory?.total_inventory_value || 0) / 1000).toFixed(1)}K
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {dashboardData.inventory?.total_items || 0} items
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm font-medium text-gray-500">Low Stock Items</p>
            <p className="mt-2 text-3xl font-bold text-yellow-600">
              {dashboardData.inventory?.low_stock_items || 0}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Requires attention
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm font-medium text-gray-500">Total Order Value</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">
              ${((dashboardData.purchaseOrders?.total_order_value || 0) / 1000).toFixed(1)}K
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {dashboardData.purchaseOrders?.total_orders || 0} orders
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm font-medium text-gray-500">Active Vendors</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">
              {dashboardData.vendors?.active_vendors || 0}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Avg rating: {(dashboardData.vendors?.avg_rating || 0).toFixed(1)}
            </p>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Inventory by Category */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Inventory by Category</h2>
          {inventoryTrends.length > 0 ? (
            <Bar data={inventoryChartData} options={{ responsive: true, maintainAspectRatio: true }} />
          ) : (
            <p className="text-gray-500 text-center py-8">No inventory data available</p>
          )}
        </div>

        {/* Order Trends */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Trends (Monthly)</h2>
          {orderTrends.length > 0 ? (
            <Line data={orderTrendsData} options={orderValueChartOptions} />
          ) : (
            <p className="text-gray-500 text-center py-8">No order data available</p>
          )}
        </div>
      </div>

      {/* Vendor Performance */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Vendor Performance</h2>
        {vendorPerformance.length > 0 ? (
          <>
            <Bar data={vendorChartData} options={{ responsive: true, maintainAspectRatio: true }} />
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Orders</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Completed</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Value</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Order Value</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rating</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {vendorPerformance.map((vendor) => (
                    <tr key={vendor.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {vendor.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {vendor.total_orders || 0}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {vendor.completed_orders || 0}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${(vendor.total_value || 0).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        ${(vendor.avg_order_value || 0).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className="flex items-center">
                          <span className="text-yellow-400">★</span>
                          <span className="ml-1">{(vendor.rating || 0).toFixed(1)}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-gray-500 text-center py-8">No vendor performance data available</p>
        )}
      </div>

      {/* Summary Stats */}
      {dashboardData && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Inventory Summary</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Items:</span>
                <span className="font-medium">{dashboardData.inventory?.total_items || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total Stock:</span>
                <span className="font-medium">{dashboardData.inventory?.total_stock || 0} units</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Low Stock Items:</span>
                <span className="font-medium text-yellow-600">
                  {dashboardData.inventory?.low_stock_items || 0}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Purchase Orders Summary</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Orders:</span>
                <span className="font-medium">{dashboardData.purchaseOrders?.total_orders || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Pending:</span>
                <span className="font-medium text-yellow-600">
                  {dashboardData.purchaseOrders?.pending_orders || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Completed:</span>
                <span className="font-medium text-green-600">
                  {dashboardData.purchaseOrders?.completed_orders || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Avg Order Value:</span>
                <span className="font-medium">
                  ${(dashboardData.purchaseOrders?.avg_order_value || 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Shipments Summary</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Shipments:</span>
                <span className="font-medium">{dashboardData.shipments?.total_shipments || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">In Transit:</span>
                <span className="font-medium text-blue-600">
                  {dashboardData.shipments?.in_transit || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Delivered:</span>
                <span className="font-medium text-green-600">
                  {dashboardData.shipments?.delivered || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Pending:</span>
                <span className="font-medium text-yellow-600">
                  {dashboardData.shipments?.pending_shipments || 0}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Analytics;

