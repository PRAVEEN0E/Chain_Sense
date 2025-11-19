const express = require('express');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const router = express.Router();

// Get all vendors
router.get('/', authenticate, (req, res) => {
  const { status } = req.query;
  let query = 'SELECT * FROM vendors WHERE 1=1';
  const params = [];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY created_at DESC';

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ message: 'Database error', error: err.message });
    }
    res.json(rows);
  });
});

// Get single vendor
router.get('/:id', authenticate, (req, res) => {
  db.get('SELECT * FROM vendors WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      return res.status(500).json({ message: 'Database error', error: err.message });
    }
    if (!row) {
      return res.status(404).json({ message: 'Vendor not found' });
    }
    res.json(row);
  });
});

// Get vendor performance stats
router.get('/:id/performance', authenticate, (req, res) => {
  const vendorId = req.params.id;

  db.all(
    `SELECT 
      COUNT(*) as total_orders,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
      AVG(total_amount) as avg_order_value,
      SUM(total_amount) as total_value
     FROM purchase_orders
     WHERE vendor_id = ?`,
    [vendorId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: 'Database error', error: err.message });
      }
      res.json(rows[0] || {});
    }
  );
});

// Create vendor (Manager/Admin only)
router.post('/', authenticate, authorize('admin', 'manager'), async (req, res) => {
  const { name, email, phone, address, contact_person, payment_terms, rating, status, create_account, password } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'Vendor name is required' });
  }

  if (create_account && !email) {
    return res.status(400).json({ message: 'Email is required to create vendor account' });
  }

  db.run(
    `INSERT INTO vendors (name, email, phone, address, contact_person, payment_terms, rating, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, email || null, phone || null, address || null, contact_person || null, payment_terms || null, rating || 0, status || 'active'],
    async function(err) {
      if (err) {
        return res.status(500).json({ message: 'Database error', error: err.message });
      }

      const vendorId = this.lastID;
      let userAccount = null;

      // Create user account if requested and email is provided
      if (create_account && email) {
        // Generate username from email or vendor name
        const username = email.split('@')[0] || name.toLowerCase().replace(/\s+/g, '');
        
        // Generate default password if not provided
        const defaultPassword = password || `${username}123`;
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);

        // Check if user already exists
        db.get('SELECT id FROM users WHERE username = ? OR email = ?', [username, email], async (err, existingUser) => {
          if (err) {
            return res.status(500).json({ message: 'Database error', error: err.message });
          }

          if (existingUser) {
            // User exists, just return vendor info
            res.status(201).json({
              message: 'Vendor created successfully',
              id: vendorId,
              user_account: {
                username: existingUser.username,
                email: email,
                note: 'Account already exists'
              }
            });
          } else {
            // Create new user account
            db.run(
              `INSERT INTO users (username, email, password, role, full_name, phone)
               VALUES (?, ?, ?, 'vendor', ?, ?)`,
              [username, email, hashedPassword, name, phone || null],
              function(userErr) {
                if (userErr) {
                  console.error('Error creating user account:', userErr);
                  // Still return vendor creation success
                  res.status(201).json({
                    message: 'Vendor created successfully, but user account creation failed',
                    id: vendorId,
                    error: userErr.message
                  });
                } else {
                  res.status(201).json({
                    message: 'Vendor created successfully with login account',
                    id: vendorId,
                    user_account: {
                      username: username,
                      email: email,
                      password: defaultPassword,
                      role: 'vendor',
                      note: 'Please save these credentials securely'
                    }
                  });
                }
              }
            );
          }
        });
      } else {
        res.status(201).json({
          message: 'Vendor created successfully',
          id: vendorId
        });
      }
    }
  );
});

// Update vendor
router.put('/:id', authenticate, authorize('admin', 'manager'), (req, res) => {
  const { name, email, phone, address, contact_person, payment_terms, rating, status } = req.body;

  db.run(
    `UPDATE vendors 
     SET name = COALESCE(?, name),
         email = COALESCE(?, email),
         phone = COALESCE(?, phone),
         address = COALESCE(?, address),
         contact_person = COALESCE(?, contact_person),
         payment_terms = COALESCE(?, payment_terms),
         rating = COALESCE(?, rating),
         status = COALESCE(?, status)
     WHERE id = ?`,
    [name, email, phone, address, contact_person, payment_terms, rating, status, req.params.id],
    function(err) {
      if (err) {
        return res.status(500).json({ message: 'Database error', error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ message: 'Vendor not found' });
      }
      res.json({ message: 'Vendor updated successfully' });
    }
  );
});

// Delete vendor (Admin only)
router.delete('/:id', authenticate, authorize('admin'), (req, res) => {
  db.run('DELETE FROM vendors WHERE id = ?', [req.params.id], function(err) {
    if (err) {
      return res.status(500).json({ message: 'Database error', error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ message: 'Vendor not found' });
    }
    res.json({ message: 'Vendor deleted successfully' });
  });
});

module.exports = router;

