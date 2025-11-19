const express = require('express');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const router = express.Router();

// Get all inventory items
router.get('/', authenticate, (req, res) => {
  const { category, low_stock } = req.query;
  let query = `SELECT i.*, v.name as supplier_name 
               FROM inventory i 
               LEFT JOIN vendors v ON i.supplier_id = v.id 
               WHERE 1=1`;
  const params = [];

  if (category) {
    query += ' AND i.category = ?';
    params.push(category);
  }

  if (low_stock === 'true') {
    query += ' AND i.quantity <= i.min_stock_level';
  }

  query += ' ORDER BY i.updated_at DESC';

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ message: 'Database error', error: err.message });
    }
    res.json(rows);
  });
});

// Get single inventory item
router.get('/:id', authenticate, (req, res) => {
  db.get(`SELECT i.*, v.name as supplier_name 
          FROM inventory i 
          LEFT JOIN vendors v ON i.supplier_id = v.id 
          WHERE i.id = ?`, 
          [req.params.id], 
          (err, row) => {
    if (err) {
      return res.status(500).json({ message: 'Database error', error: err.message });
    }
    if (!row) {
      return res.status(404).json({ message: 'Item not found' });
    }
    res.json(row);
  });
});

// Create inventory item (Manager/Admin only)
router.post('/', authenticate, authorize('admin', 'manager'), (req, res) => {
  const { name, sku, description, category, quantity, min_stock_level, unit_price, supplier_id, location } = req.body;

  if (!name || quantity === undefined) {
    return res.status(400).json({ message: 'Name and quantity are required' });
  }

  db.run(
    `INSERT INTO inventory (name, sku, description, category, quantity, min_stock_level, unit_price, supplier_id, location)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, sku || null, description || null, category || null, quantity, min_stock_level || 10, unit_price || null, supplier_id || null, location || null],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          return res.status(400).json({ message: 'SKU already exists' });
        }
        return res.status(500).json({ message: 'Database error', error: err.message });
      }

      // Check for low stock alert
      if (quantity <= (min_stock_level || 10)) {
        // Trigger notification (will be handled by notification service)
        db.run(
          `INSERT INTO notifications (user_id, type, title, message)
           VALUES (NULL, 'alert', 'Low Stock Alert', '${name} is running low. Current quantity: ${quantity}')`
        );
      }

      res.status(201).json({
        message: 'Inventory item created successfully',
        id: this.lastID
      });
    }
  );
});

// Update inventory item
router.put('/:id', authenticate, (req, res) => {
  const { name, sku, description, category, quantity, min_stock_level, unit_price, supplier_id, location } = req.body;

  // Check if item exists and get old quantity
  db.get('SELECT quantity, name FROM inventory WHERE id = ?', [req.params.id], (err, item) => {
    if (err || !item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    const oldQuantity = item.quantity;
    const newQuantity = quantity !== undefined ? quantity : oldQuantity;
    const minStock = min_stock_level !== undefined ? min_stock_level : item.min_stock_level;

    db.run(
      `UPDATE inventory 
       SET name = COALESCE(?, name),
           sku = COALESCE(?, sku),
           description = COALESCE(?, description),
           category = COALESCE(?, category),
           quantity = COALESCE(?, quantity),
           min_stock_level = COALESCE(?, min_stock_level),
           unit_price = COALESCE(?, unit_price),
           supplier_id = COALESCE(?, supplier_id),
           location = COALESCE(?, location),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name, sku, description, category, quantity, min_stock_level, unit_price, supplier_id, location, req.params.id],
      function(err) {
        if (err) {
          return res.status(500).json({ message: 'Database error', error: err.message });
        }

        // Check for low stock alert
        if (newQuantity <= minStock && oldQuantity > minStock) {
          db.run(
            `INSERT INTO notifications (user_id, type, title, message)
             VALUES (NULL, 'alert', 'Low Stock Alert', '${item.name} is running low. Current quantity: ${newQuantity}')`
          );
        }

        res.json({ message: 'Inventory item updated successfully' });
      }
    );
  });
});

// Delete inventory item (Admin only)
router.delete('/:id', authenticate, authorize('admin'), (req, res) => {
  db.run('DELETE FROM inventory WHERE id = ?', [req.params.id], function(err) {
    if (err) {
      return res.status(500).json({ message: 'Database error', error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ message: 'Item not found' });
    }
    res.json({ message: 'Inventory item deleted successfully' });
  });
});

module.exports = router;

