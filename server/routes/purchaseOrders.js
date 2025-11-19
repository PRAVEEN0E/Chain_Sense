const express = require('express');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const nodemailer = require('nodemailer');
const router = express.Router();

// Email transporter setup
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Get all purchase orders
router.get('/', authenticate, (req, res) => {
  const { status, vendor_id } = req.query;
  let query = `SELECT po.*, v.name as vendor_name, u.username as created_by_name
               FROM purchase_orders po
               LEFT JOIN vendors v ON po.vendor_id = v.id
               LEFT JOIN users u ON po.created_by = u.id
               WHERE 1=1`;
  const params = [];

  // If vendor role, only show orders for vendors linked to this user
  // Note: This requires vendors table to have user_id or email matching
  // For now, vendors can see all orders. In production, link vendors to users.
  if (req.user.role === 'vendor') {
    // Try to match vendor by email
    db.get('SELECT id FROM vendors WHERE email = ?', [req.user.email], (err, vendor) => {
      if (!err && vendor) {
        query += ' AND po.vendor_id = ?';
        params.push(vendor.id);
      }
      // Continue with query execution
      executeQuery();
    });
  } else {
    executeQuery();
  }

  function executeQuery() {
    if (status) {
      query += ' AND po.status = ?';
      params.push(status);
    }

    if (vendor_id && req.user.role !== 'vendor') {
      query += ' AND po.vendor_id = ?';
      params.push(vendor_id);
    }

    query += ' ORDER BY po.order_date DESC';

    db.all(query, params, (err, orders) => {
      if (err) {
        return res.status(500).json({ message: 'Database error', error: err.message });
      }

      // Get items for each order
      const ordersWithItems = orders.map(order => {
        return new Promise((resolve) => {
          db.all(
            `SELECT poi.*, i.name as item_name, i.sku
             FROM purchase_order_items poi
             LEFT JOIN inventory i ON poi.item_id = i.id
             WHERE poi.po_id = ?`,
            [order.id],
            (err, items) => {
              if (err) {
                resolve({ ...order, items: [] });
              } else {
                resolve({ ...order, items });
              }
            }
          );
        });
      });

      Promise.all(ordersWithItems).then(results => {
        res.json(results);
      });
    });
  }
});

// Get single purchase order
router.get('/:id', authenticate, (req, res) => {
  db.get(
    `SELECT po.*, v.name as vendor_name, v.email as vendor_email, v.phone as vendor_phone,
            u.username as created_by_name
     FROM purchase_orders po
     LEFT JOIN vendors v ON po.vendor_id = v.id
     LEFT JOIN users u ON po.created_by = u.id
     WHERE po.id = ?`,
    [req.params.id],
    (err, order) => {
      if (err) {
        return res.status(500).json({ message: 'Database error', error: err.message });
      }
      if (!order) {
        return res.status(404).json({ message: 'Purchase order not found' });
      }

      // Check if vendor can access this order
      if (req.user.role === 'vendor') {
        db.get('SELECT id FROM vendors WHERE email = ?', [req.user.email], (err, vendor) => {
          if (err || !vendor || order.vendor_id !== vendor.id) {
            return res.status(403).json({ message: 'Access denied' });
          }
          getOrderItems();
        });
      } else {
        getOrderItems();
      }

      function getOrderItems() {
        // Get items
        db.all(
          `SELECT poi.*, i.name as item_name, i.sku
           FROM purchase_order_items poi
           LEFT JOIN inventory i ON poi.item_id = i.id
           WHERE poi.po_id = ?`,
          [req.params.id],
          (err, items) => {
            if (err) {
              return res.status(500).json({ message: 'Database error', error: err.message });
            }
            res.json({ ...order, items });
          }
        );
      }
    }
  );
});

// Create purchase order
router.post('/', authenticate, authorize('admin', 'manager'), (req, res) => {
  const { vendor_id, items, expected_delivery_date, notes } = req.body;

  if (!vendor_id || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Vendor ID and items are required' });
  }

  // Calculate total
  const total_amount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

  // Generate PO number
  const po_number = `PO-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

  db.run(
    `INSERT INTO purchase_orders (po_number, vendor_id, created_by, total_amount, expected_delivery_date, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [po_number, vendor_id, req.user.id, total_amount, expected_delivery_date || null, notes || null],
    function(err) {
      if (err) {
        return res.status(500).json({ message: 'Database error', error: err.message });
      }

      const poId = this.lastID;

      // Insert items
      const itemPromises = items.map(item => {
        return new Promise((resolve, reject) => {
          const subtotal = item.quantity * item.unit_price;
          db.run(
            `INSERT INTO purchase_order_items (po_id, item_id, quantity, unit_price, subtotal)
             VALUES (?, ?, ?, ?, ?)`,
            [poId, item.item_id, item.quantity, item.unit_price, subtotal],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      });

      Promise.all(itemPromises)
        .then(() => {
          // Get vendor email
          db.get('SELECT email, name FROM vendors WHERE id = ?', [vendor_id], (err, vendor) => {
            if (vendor && vendor.email && transporter.options.auth.user) {
              // Send email
              const mailOptions = {
                from: transporter.options.auth.user,
                to: vendor.email,
                subject: `Purchase Order ${po_number} - Chain Sense`,
                html: `
                  <h2>New Purchase Order: ${po_number}</h2>
                  <p>Dear ${vendor.name},</p>
                  <p>You have received a new purchase order. Please review the details below:</p>
                  <h3>Order Details:</h3>
                  <ul>
                    <li><strong>PO Number:</strong> ${po_number}</li>
                    <li><strong>Total Amount:</strong> $${total_amount.toFixed(2)}</li>
                    <li><strong>Expected Delivery:</strong> ${expected_delivery_date || 'Not specified'}</li>
                  </ul>
                  <h3>Items:</h3>
                  <table border="1" cellpadding="10">
                    <tr>
                      <th>Item</th>
                      <th>Quantity</th>
                      <th>Unit Price</th>
                      <th>Subtotal</th>
                    </tr>
                    ${items.map(item => `
                      <tr>
                        <td>${item.item_name || 'Item ' + item.item_id}</td>
                        <td>${item.quantity}</td>
                        <td>$${item.unit_price.toFixed(2)}</td>
                        <td>$${(item.quantity * item.unit_price).toFixed(2)}</td>
                      </tr>
                    `).join('')}
                  </table>
                  ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
                  <p>Thank you for your partnership.</p>
                `
              };

              transporter.sendMail(mailOptions, (err) => {
                if (err) console.error('Email send error:', err);
              });
            }
          });

          res.status(201).json({
            message: 'Purchase order created successfully',
            id: poId,
            po_number
          });
        })
        .catch(err => {
          res.status(500).json({ message: 'Error creating order items', error: err.message });
        });
    }
  );
});

// Update purchase order status (vendors can update status)
router.put('/:id', authenticate, (req, res) => {
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ message: 'Status is required' });
  }

  // Get current order status
  db.get('SELECT vendor_id, status as current_status, po_number FROM purchase_orders WHERE id = ?', [req.params.id], (err, order) => {
    if (err || !order) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }

    if (req.user.role === 'vendor') {
      db.get('SELECT id FROM vendors WHERE email = ?', [req.user.email], (err, vendor) => {
        if (err || !vendor || order.vendor_id !== vendor.id) {
          return res.status(403).json({ message: 'Access denied' });
        }
        updateStatus();
      });
    } else {
      updateStatus();
    }

    function updateStatus() {
      let responseSent = false;

      let inventoryUpdateResults = null;
      let inventoryUpdateError = null;

      function sendResponse() {
        if (responseSent) return;
        responseSent = true;

        // Create notification for PO status change
        const statusMessages = {
          'pending': 'Purchase Order has been set to pending',
          'completed': 'Purchase Order has been completed',
          'cancelled': 'Purchase Order has been cancelled'
        };

        db.run(
          `INSERT INTO notifications (user_id, type, title, message)
           VALUES (NULL, 'info', 'Purchase Order Status Updated', 
           'Purchase Order ${order.po_number} status changed to ${status}. ${statusMessages[status] || ''}')`,
          (notifErr) => {
            if (notifErr) console.error('Notification error:', notifErr);
          }
        );

        const wasCompleted = status === 'completed';
        const wasAlreadyCompleted = order.current_status === 'completed';
        const shouldUpdateInventory = wasCompleted && !wasAlreadyCompleted;

        res.json({ 
          message: 'Purchase order updated successfully',
          inventory_updated: shouldUpdateInventory && inventoryUpdateResults !== null,
          inventory_error: inventoryUpdateError,
          inventory_details: inventoryUpdateResults,
          previous_status: order.current_status,
          new_status: status,
          debug: {
            was_completed: wasCompleted,
            was_already_completed: wasAlreadyCompleted,
            should_update: shouldUpdateInventory
          }
        });
      }

      db.run(
        'UPDATE purchase_orders SET status = ? WHERE id = ?',
        [status, req.params.id],
        function(err) {
          if (err) {
            return res.status(500).json({ message: 'Database error', error: err.message });
          }
          if (this.changes === 0) {
            return res.status(404).json({ message: 'Purchase order not found' });
          }

          // If status changed to 'completed', update inventory
          if (status === 'completed' && order.current_status !== 'completed') {
            console.log(`🔄 Processing inventory update for PO ${order.po_number} (ID: ${req.params.id})`);
            console.log(`   Previous status: ${order.current_status}, New status: ${status}`);
            
            // Get all items in this purchase order
            db.all(
              'SELECT item_id, quantity FROM purchase_order_items WHERE po_id = ?',
              [req.params.id],
              (err, items) => {
                if (err) {
                  console.error('❌ Error fetching PO items:', err);
                  inventoryUpdateError = `Failed to fetch PO items: ${err.message}`;
                  sendResponse();
                  return;
                }

                if (!items || items.length === 0) {
                  console.log('⚠️ No items found in purchase order');
                  inventoryUpdateError = 'No items found in purchase order';
                  sendResponse();
                  return;
                }

                console.log(`   Found ${items.length} items to update:`, items);

                // Update inventory for each item using promises
                const updatePromises = items.map((item) => {
                  return new Promise((resolve, reject) => {
                    // Ensure item_id is an integer
                    const itemId = parseInt(item.item_id);
                    const quantityToAdd = parseInt(item.quantity);

                    if (isNaN(itemId) || isNaN(quantityToAdd)) {
                      const errorMsg = `Invalid item_id (${item.item_id}) or quantity (${item.quantity})`;
                      console.error(`❌ ${errorMsg}`);
                      reject(new Error(errorMsg));
                      return;
                    }

                    console.log(`   Processing item_id: ${itemId}, quantity to add: ${quantityToAdd}`);

                    // First verify item exists
                    db.get('SELECT id, name, quantity as current_quantity FROM inventory WHERE id = ?', [itemId], (getErr, inventoryItem) => {
                      if (getErr) {
                        console.error(`❌ Error checking inventory item ${itemId}:`, getErr);
                        reject(new Error(`Item ${itemId} check failed: ${getErr.message}`));
                        return;
                      }

                      if (!inventoryItem) {
                        console.error(`❌ Inventory item ${itemId} not found in database`);
                        reject(new Error(`Inventory item ${itemId} not found`));
                        return;
                      }

                      console.log(`   Found inventory item: ${inventoryItem.name}, current quantity: ${inventoryItem.current_quantity}`);

                      // Update inventory
                      db.run(
                        `UPDATE inventory 
                         SET quantity = quantity + ?,
                             updated_at = CURRENT_TIMESTAMP
                         WHERE id = ?`,
                        [quantityToAdd, itemId],
                        function(updateErr) {
                          if (updateErr) {
                            console.error(`❌ Error updating inventory for item ${itemId}:`, updateErr);
                            reject(new Error(`Item ${itemId} update failed: ${updateErr.message}`));
                          } else {
                            if (this.changes === 0) {
                              console.error(`❌ No rows updated for item ${itemId} - item may not exist`);
                              reject(new Error(`No rows updated for item ${itemId}`));
                              return;
                            }

                            const newQuantity = inventoryItem.current_quantity + quantityToAdd;
                            console.log(`✅ Inventory updated: Item ${itemId} (${inventoryItem.name}) - Added ${quantityToAdd} units (was ${inventoryItem.current_quantity}, now ${newQuantity})`);
                            
                            // Verify the update by reading back
                            db.get('SELECT quantity FROM inventory WHERE id = ?', [itemId], (verifyErr, verified) => {
                              if (verifyErr || !verified) {
                                console.error(`⚠️ Warning: Could not verify update for item ${itemId}`);
                              } else {
                                console.log(`   Verified: Current inventory quantity is now ${verified.quantity}`);
                              }
                            });

                            resolve({
                              item_id: itemId,
                              item_name: inventoryItem.name,
                              quantity_added: quantityToAdd,
                              old_quantity: inventoryItem.current_quantity,
                              new_quantity: newQuantity
                            });
                          }
                        }
                      );
                    });
                  });
                });

                // Wait for all updates to complete
                Promise.all(updatePromises)
                  .then((results) => {
                    console.log(`✅ Successfully updated inventory for ${results.length} items:`, results);
                    inventoryUpdateResults = results;

                    // Create notification for inventory update
                    const itemSummary = results.map(r => `${r.item_name}: +${r.quantity_added} (${r.old_quantity} → ${r.new_quantity})`).join(', ');
                    
                    db.run(
                      `INSERT INTO notifications (user_id, type, title, message)
                       VALUES (NULL, 'info', 'Inventory Updated', 
                       'Purchase Order ${order.po_number} completed. Inventory updated: ${itemSummary}')`,
                      (notifErr) => {
                        if (notifErr) console.error('Notification error:', notifErr);
                      }
                    );

                    // Send notification to admin/manager
                    db.all(
                      "SELECT id FROM users WHERE role IN ('admin', 'manager')",
                      [],
                      (err, managers) => {
                        if (!err && managers) {
                          managers.forEach((manager) => {
                            db.run(
                              `INSERT INTO notifications (user_id, type, title, message)
                               VALUES (?, 'info', 'Purchase Order Completed', 
                               'Purchase Order ${order.po_number} completed. Inventory updated: ${itemSummary}')`,
                              [manager.id],
                              () => {}
                            );
                          });
                        }
                      }
                    );

                    sendResponse();
                  })
                  .catch((error) => {
                    console.error('❌ Error updating inventory:', error);
                    console.error('   Error details:', error.message);
                    inventoryUpdateError = error.message;
                    // Still continue - PO status is updated
                    sendResponse();
                  });
              }
            );
          } else {
            // No inventory update needed, send response immediately
            sendResponse();
          }
        }
      );
    }
  });
});

// Delete purchase order (Admin only)
router.delete('/:id', authenticate, authorize('admin'), (req, res) => {
  db.run('DELETE FROM purchase_order_items WHERE po_id = ?', [req.params.id], (err) => {
    if (err) {
      return res.status(500).json({ message: 'Database error', error: err.message });
    }
    db.run('DELETE FROM purchase_orders WHERE id = ?', [req.params.id], function(err) {
      if (err) {
        return res.status(500).json({ message: 'Database error', error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ message: 'Purchase order not found' });
      }
      res.json({ message: 'Purchase order deleted successfully' });
    });
  });
});

module.exports = router;
