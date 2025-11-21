import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrencyINR } from '../utils/currency';
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

const Dashboard = () => {
  const [analytics, setAnalytics] = useState(null);
  const [orderTrends, setOrderTrends] = useState([]);
  const [loading, setLoading] = useState(true);
  const { isVendor, isManager, isAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [analyticsRes, trendsRes] = await Promise.all([
        axios.get('/api/analytics/dashboard'),
        axios.get('/api/analytics/order-trends'),
      ]);
      setAnalytics(analyticsRes.data);
      setOrderTrends(trendsRes.data);
    } catch (error) {
      toast.error('Failed to load dashboard data');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!analytics) {
    return <div className="text-center py-8">No data available</div>;
  }

  const orderChartData = {
    labels: orderTrends.map((t) => t.month),
    datasets: [
      {
        label: 'Orders',
        data: orderTrends.map((t) => t.order_count),
        backgroundColor: 'rgba(59, 130, 246, 0.5)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 2,
      },
    ],
  };

  const shipmentStatusData = {
    labels: ['In Transit', 'Delivered', 'Pending'],
    datasets: [
      {
        data: [
          analytics.shipments?.in_transit || 0,
          analytics.shipments?.delivered || 0,
          analytics.shipments?.pending_shipments || 0,
        ],
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',
          'rgba(34, 197, 94, 0.8)',
          'rgba(251, 191, 36, 0.8)',
        ],
      },
    ],
  };

  const stats = [
    {
      name: 'Total Inventory Items',
      value: analytics.inventory?.total_items || 0,
      icon: '📦',
      color: 'bg-blue-500',
      link: '/inventory',
    },
    {
      name: 'Low Stock Items',
      value: analytics.inventory?.low_stock_items || 0,
      icon: '⚠️',
      color: 'bg-yellow-500',
      link: '/inventory?low_stock=true',
    },
    {
      name: 'Active Vendors',
      value: analytics.vendors?.active_vendors || 0,
      icon: '🏢',
      color: 'bg-green-500',
      link: '/vendors',
    },
    {
      name: 'Pending Orders',
      value: analytics.purchaseOrders?.pending_orders || 0,
      icon: '📋',
      color: 'bg-purple-500',
      link: '/purchase-orders',
    },
    {
      name: 'In Transit Shipments',
      value: analytics.shipments?.in_transit || 0,
      icon: '🚚',
      color: 'bg-indigo-500',
      link: '/shipments',
    },
    {
      name: 'Total Inventory Value',
      value: `${formatCurrencyINR(analytics.inventory?.total_inventory_value || 0)}`,
      icon: '💰',
      color: 'bg-emerald-500',
      link: '/analytics',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Welcome back! Here's your supply chain overview.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <Link
            key={stat.name}
            to={stat.link}
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center">
              <div className={`${stat.color} rounded-lg p-3 text-2xl`}>
                {stat.icon}
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">{stat.name}</p>
                <p className="mt-1 text-2xl font-semibold text-gray-900">{stat.value}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Order Trends */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Trends (Monthly)</h2>
          {orderTrends.length > 0 ? (
            <Line data={orderChartData} options={{ responsive: true, maintainAspectRatio: true }} />
          ) : (
            <p className="text-gray-500 text-center py-8">No order data available</p>
          )}
        </div>

        {/* Shipment Status */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Shipment Status</h2>
          <div className="h-64 flex items-center justify-center">
            <Doughnut
              data={shipmentStatusData}
              options={{
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                  legend: {
                    position: 'bottom',
                  },
                },
              }}
            />
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {!isVendor && (
            <>
              <button
                onClick={() => navigate('/inventory')}
                className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors cursor-pointer"
              >
                <span className="text-2xl mb-2">➕</span>
                <span className="text-sm font-medium text-gray-700">Add Item</span>
              </button>
              {(isManager || isAdmin) && (
                <button
                  onClick={() => navigate('/vendors')}
                  className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors cursor-pointer"
                >
                  <span className="text-2xl mb-2">🏢</span>
                  <span className="text-sm font-medium text-gray-700">Add Vendor</span>
                </button>
              )}
              {(isManager || isAdmin) && (
                <button
                  onClick={() => navigate('/purchase-orders')}
                  className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors cursor-pointer"
                >
                  <span className="text-2xl mb-2">📋</span>
                  <span className="text-sm font-medium text-gray-700">New PO</span>
                </button>
              )}
              {!isVendor && (
                <button
                  onClick={() => navigate('/shipments')}
                  className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors cursor-pointer"
                >
                  <span className="text-2xl mb-2">🚚</span>
                  <span className="text-sm font-medium text-gray-700">New Shipment</span>
                </button>
              )}
            </>
          )}
          {isVendor && (
            <>
              <button
                onClick={() => navigate('/purchase-orders')}
                className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors cursor-pointer"
              >
                <span className="text-2xl mb-2">📋</span>
                <span className="text-sm font-medium text-gray-700">View Orders</span>
              </button>
              <button
                onClick={() => navigate('/shipments')}
                className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors cursor-pointer"
              >
                <span className="text-2xl mb-2">🚚</span>
                <span className="text-sm font-medium text-gray-700">View Shipments</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

