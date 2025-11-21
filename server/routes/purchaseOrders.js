const express = require('express');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const nodemailer = require('nodemailer');
const { ensureInvoicePdf } = require('../utils/invoicePdfManager');
const { sendInvoicePendingEmail } = require('../utils/invoiceNotification');
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

const DEFAULT_INVOICE_DUE_DAYS = 30;

const formatCurrencyINR = (value = 0) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
}).format(Number(value || 0));

const calculateDueDateFromTerms = (paymentTerms) => {
  const baselineDays = DEFAULT_INVOICE_DUE_DAYS;
  if (!paymentTerms) {
    const defaultDate = new Date(Date.now() + baselineDays * 24 * 60 * 60 * 1000);
    return defaultDate.toISOString();
  }

  const match = paymentTerms.match(/(\d+)/);
  const parsedDays = match ? parseInt(match[1], 10) : baselineDays;
  const daysToAdd = Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : baselineDays;
  const dueDate = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000);
  return dueDate.toISOString();
};

const createInvoiceForPurchaseOrder = (poId, userId) => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT i.*, v.name as vendor_name
       FROM invoices i
       LEFT JOIN vendors v ON i.vendor_id = v.id
       WHERE i.po_id = ?`,
      [poId],
      (existingErr, existingInvoice) => {
        if (existingErr) {
          return reject(existingErr);
        }

        if (existingInvoice) {
          return resolve({ alreadyExisted: true, invoice: existingInvoice });
        }

        db.get(
          `SELECT po.*, v.name as vendor_name, v.address as vendor_address, v.payment_terms
           FROM purchase_orders po
           LEFT JOIN vendors v ON po.vendor_id = v.id
           WHERE po.id = ?`,
          [poId],
          (poErr, po) => {
            if (poErr) {
              return reject(poErr);
            }

            if (!po) {
              return reject(new Error('Purchase order not found for invoice generation'));
            }

            const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
            const dueDate = calculateDueDateFromTerms(po.payment_terms);
            const notes = `Auto-generated from Purchase Order ${po.po_number}`;
            const billingAddress = po.vendor_address || null;
            const terms = po.payment_terms || 'Net 30';

            db.run(
              `INSERT INTO invoices (invoice_number, po_id, vendor_id, amount_due, amount_paid, status, due_date, notes, billing_address, terms, created_by)
               VALUES (?, ?, ?, ?, 0, 'unpaid', ?, ?, ?, ?, ?)`,
              [
                invoiceNumber,
                po.id,
                po.vendor_id,
                po.total_amount,
                dueDate,
                notes,
                billingAddress,
                terms,
                userId || null,
              ],
              function(insertErr) {
                if (insertErr) {
                  return reject(insertErr);
                }

                const invoiceId = this.lastID;

                db.all(
                  `SELECT poi.*, i.name as item_name
                   FROM purchase_order_items poi
                   LEFT JOIN inventory i ON poi.item_id = i.id
                   WHERE poi.po_id = ?`,
                  [po.id],
                  (itemsErr, items) => {
                    if (itemsErr) {
                      return reject(itemsErr);
                    }

                    const hasItems = Array.isArray(items) && items.length > 0;
                    const invoiceLineItems = (hasItems ? items : [{
                      item_id: null,
                      item_name: `Purchase Order ${po.po_number}`,
                      quantity: 1,
                      unit_price: po.total_amount,
                      subtotal: po.total_amount,
                    }]).map((item) => {
                      const quantity = Number(item.quantity) || 0;
                      const unitPrice = Number(item.unit_price) || 0;
                      const subtotal = Number(item.subtotal || quantity * unitPrice);
                      return {
                        description: item.item_name || `Item ${item.item_id || ''}`.trim(),
                        quantity: quantity > 0 ? quantity : 1,
                        unit_price: unitPrice > 0 ? unitPrice : subtotal,
                        subtotal: subtotal > 0 ? subtotal : po.total_amount,
                      };
                    });

                    const insertItemPromises = invoiceLineItems.map((line) => (
                      new Promise((resolveLine, rejectLine) => {
                        db.run(
                          `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, subtotal)
                           VALUES (?, ?, ?, ?, ?)`,
                          [invoiceId, line.description, line.quantity, line.unit_price, line.subtotal],
                          (lineErr) => {
                            if (lineErr) rejectLine(lineErr);
                            else resolveLine();
                          }
                        );
                      })
                    ));

                    Promise.all(insertItemPromises)
                      .then(() => {
                        db.get(
                          `SELECT i.*, v.name as vendor_name, v.email as vendor_email
                           FROM invoices i
                           LEFT JOIN vendors v ON i.vendor_id = v.id
                           WHERE i.id = ?`,
                          [invoiceId],
                          (fetchErr, invoiceRow) => {
                            if (fetchErr || !invoiceRow) {
                              return reject(fetchErr || new Error('Invoice fetch failed after creation'));
                            }

                            const finalize = () => resolve({ created: true, invoice: invoiceRow });

                            ensureInvoicePdf(invoiceId)
                              .then(async ({ filePath }) => {
                                try {
                                  if (invoiceRow.vendor_email) {
                                    await sendInvoicePendingEmail({
                                      vendorEmail: invoiceRow.vendor_email,
                                      vendorName: invoiceRow.vendor_name,
                                      invoiceNumber: invoiceRow.invoice_number,
                                      amountDue: invoiceRow.amount_due,
                                      dueDate: invoiceRow.due_date,
                                      pdfPath: filePath,
                                    });
                                  }
                                } catch (emailErr) {
                                  console.error('Invoice email send failed:', emailErr);
                                } finally {
                                  finalize();
                                }
                              })
                              .catch((pdfErr) => {
                                console.error('Invoice PDF generation failed:', pdfErr);
                                finalize();
                              });
                          }
                        );
                      })
                      .catch((lineErr) => reject(lineErr));
                  }
                );
              }
            );
          }
        );
      }
    );
  });
};

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
                    <li><strong>Total Amount:</strong> ${formatCurrencyINR(total_amount)}</li>
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
                        <td>${formatCurrencyINR(item.unit_price)}</td>
                        <td>${formatCurrencyINR(item.quantity * item.unit_price)}</td>
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

      const shouldGenerateInvoice = status === 'completed' && order.current_status !== 'completed';
      let invoiceDetails = null;
      let invoiceGenerationError = null;
      let invoiceCreated = false;
      let invoiceAlreadyExisted = false;
      let invoiceStepStarted = false;
      let invoiceStepFinished = false;

      const sendStatusNotification = () => {
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
      };

      const sendResponseBody = () => {
        if (responseSent) return;
        responseSent = true;

        sendStatusNotification();

        const wasCompleted = status === 'completed';
        const wasAlreadyCompleted = order.current_status === 'completed';
        const shouldUpdateInventory = wasCompleted && !wasAlreadyCompleted;

        res.json({ 
          message: 'Purchase order updated successfully',
          inventory_updated: shouldUpdateInventory && inventoryUpdateResults !== null,
          inventory_error: inventoryUpdateError,
          inventory_details: inventoryUpdateResults,
          billing: shouldGenerateInvoice ? {
            attempted: true,
            created: invoiceCreated,
            already_existed: invoiceAlreadyExisted,
            invoice: invoiceDetails,
            error: invoiceGenerationError
          } : { attempted: false },
          previous_status: order.current_status,
          new_status: status,
          debug: {
            was_completed: wasCompleted,
            was_already_completed: wasAlreadyCompleted,
            should_update: shouldUpdateInventory
          }
        });
      };

      const finalizeResponse = () => {
        if (!shouldGenerateInvoice) {
          sendResponseBody();
          return;
        }

        if (invoiceStepFinished) {
          sendResponseBody();
          return;
        }

        if (invoiceStepStarted) {
          return;
        }

        invoiceStepStarted = true;

        createInvoiceForPurchaseOrder(req.params.id, req.user.id)
          .then((result) => {
            invoiceDetails = result.invoice || null;
            invoiceCreated = !!result.created;
            invoiceAlreadyExisted = !!result.alreadyExisted;
          })
          .catch((invoiceErr) => {
            console.error('Invoice generation error:', invoiceErr);
            invoiceGenerationError = invoiceErr.message || 'Failed to generate invoice';
          })
          .finally(() => {
            invoiceStepFinished = true;
            sendResponseBody();
          });
      };

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
                  finalizeResponse();
                  return;
                }

                if (!items || items.length === 0) {
                  console.log('⚠️ No items found in purchase order');
                  inventoryUpdateError = 'No items found in purchase order';
                  finalizeResponse();
                  return;
                }

                console.log(`   Found ${items.length} items to update:`, items);

                // Update inventory for each item using promises
                const updatePromises = items.map((item) => {
                  return new Promise((resolve, reject) => {
                    // Ensure item_id is an integer
                    const itemId = parseInt(item.item_id);
                    const quantityToReduce = parseInt(item.quantity);

                    if (isNaN(itemId) || isNaN(quantityToReduce)) {
                      const errorMsg = `Invalid item_id (${item.item_id}) or quantity (${item.quantity})`;
                      console.error(`❌ ${errorMsg}`);
                      reject(new Error(errorMsg));
                      return;
                    }

                    console.log(`   Processing item_id: ${itemId}, quantity to deduct: ${quantityToReduce}`);

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
                         SET quantity = MAX(quantity - ?, 0),
                             updated_at = CURRENT_TIMESTAMP
                         WHERE id = ?`,
                        [quantityToReduce, itemId],
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

                            const newQuantity = Math.max(inventoryItem.current_quantity - quantityToReduce, 0);
                            console.log(`✅ Inventory updated: Item ${itemId} (${inventoryItem.name}) - Deducted ${quantityToReduce} units (was ${inventoryItem.current_quantity}, now ${newQuantity})`);
                            
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
                              quantity_deducted: quantityToReduce,
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
                    const itemSummary = results.map(r => `${r.item_name}: -${r.quantity_deducted} (${r.old_quantity} → ${r.new_quantity})`).join(', ');
                    
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

                    finalizeResponse();
                  })
                  .catch((error) => {
                    console.error('❌ Error updating inventory:', error);
                    console.error('   Error details:', error.message);
                    inventoryUpdateError = error.message;
                    // Still continue - PO status is updated
                    finalizeResponse();
                  });
              }
            );
          } else {
            // No inventory update needed, send response immediately
            finalizeResponse();
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
