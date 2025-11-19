const express = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// Get dashboard analytics
router.get('/dashboard', authenticate, (req, res) => {
  const analytics = {};

  // Inventory stats
  db.get(
    `SELECT 
      COUNT(*) as total_items,
      SUM(quantity) as total_stock,
      SUM(CASE WHEN quantity <= min_stock_level THEN 1 ELSE 0 END) as low_stock_items,
      SUM(quantity * unit_price) as total_inventory_value
     FROM inventory`,
    (err, inventoryStats) => {
      if (err) {
        return res.status(500).json({ message: 'Database error', error: err.message });
      }
      analytics.inventory = inventoryStats;

      // Vendor stats
      db.get(
        `SELECT 
          COUNT(*) as total_vendors,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_vendors,
          AVG(rating) as avg_rating
         FROM vendors`,
        (err, vendorStats) => {
          if (err) {
            return res.status(500).json({ message: 'Database error', error: err.message });
          }
          analytics.vendors = vendorStats;

          // Purchase Order stats
          db.get(
            `SELECT 
              COUNT(*) as total_orders,
              SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
              SUM(total_amount) as total_order_value,
              AVG(total_amount) as avg_order_value
             FROM purchase_orders`,
            (err, poStats) => {
              if (err) {
                return res.status(500).json({ message: 'Database error', error: err.message });
              }
              analytics.purchaseOrders = poStats;

              // Shipment stats
              db.get(
                `SELECT 
                  COUNT(*) as total_shipments,
                  SUM(CASE WHEN status = 'in_transit' THEN 1 ELSE 0 END) as in_transit,
                  SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
                  SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_shipments
                 FROM shipments`,
                (err, shipmentStats) => {
                  if (err) {
                    return res.status(500).json({ message: 'Database error', error: err.message });
                  }
                  analytics.shipments = shipmentStats;

                  res.json(analytics);
                }
              );
            }
          );
        }
      );
    }
  );
});

// Get inventory trends (last 30 days)
router.get('/inventory-trends', authenticate, (req, res) => {
  // This would typically come from a history table, but for now we'll return current data
  db.all(
    `SELECT category, COUNT(*) as count, SUM(quantity) as total_quantity
     FROM inventory
     GROUP BY category
     ORDER BY total_quantity DESC`,
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: 'Database error', error: err.message });
      }
      res.json(rows);
    }
  );
});

// Get vendor performance
router.get('/vendor-performance', authenticate, (req, res) => {
  db.all(
    `SELECT 
      v.id,
      v.name,
      COUNT(po.id) as total_orders,
      SUM(CASE WHEN po.status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
      SUM(po.total_amount) as total_value,
      AVG(po.total_amount) as avg_order_value,
      v.rating
     FROM vendors v
     LEFT JOIN purchase_orders po ON v.id = po.vendor_id
     GROUP BY v.id
     ORDER BY total_value DESC
     LIMIT 10`,
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: 'Database error', error: err.message });
      }
      res.json(rows);
    }
  );
});

// Get order trends (monthly)
router.get('/order-trends', authenticate, (req, res) => {
  db.all(
    `SELECT 
      strftime('%Y-%m', order_date) as month,
      COUNT(*) as order_count,
      SUM(total_amount) as total_value
     FROM purchase_orders
     GROUP BY month
     ORDER BY month DESC
     LIMIT 12`,
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: 'Database error', error: err.message });
      }
      res.json(rows);
    }
  );
});

// Export data
router.get('/export/:type', authenticate, (req, res) => {
  const { type } = req.params; // 'inventory', 'vendors', 'orders', 'shipments'

  let query;
  let filename;

  switch (type) {
    case 'inventory':
      query = 'SELECT * FROM inventory';
      filename = 'inventory.csv';
      break;
    case 'vendors':
      query = 'SELECT * FROM vendors';
      filename = 'vendors.csv';
      break;
    case 'orders':
      query = `SELECT po.*, v.name as vendor_name 
               FROM purchase_orders po 
               LEFT JOIN vendors v ON po.vendor_id = v.id`;
      filename = 'purchase_orders.csv';
      break;
    case 'shipments':
      query = `SELECT s.*, v.name as vendor_name 
               FROM shipments s 
               LEFT JOIN vendors v ON s.vendor_id = v.id`;
      filename = 'shipments.csv';
      break;
    default:
      return res.status(400).json({ message: 'Invalid export type' });
  }

  db.all(query, (err, rows) => {
    if (err) {
      return res.status(500).json({ message: 'Database error', error: err.message });
    }

    // Convert to CSV
    if (rows.length === 0) {
      return res.status(404).json({ message: 'No data to export' });
    }

    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(','),
      ...rows.map(row => headers.map(header => {
        const value = row[header];
        return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
      }).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  });
});

module.exports = router;

