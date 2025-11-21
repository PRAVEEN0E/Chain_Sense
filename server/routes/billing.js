const express = require('express');
const path = require('path');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { ensureInvoicePdf } = require('../utils/invoicePdfManager');

const router = express.Router();

const getVendorIdForUser = (user, callback) => {
  if (!user || !user.email) {
    return callback(null, null);
  }

  db.get('SELECT id FROM vendors WHERE email = ?', [user.email], (err, vendor) => {
    if (err) {
      return callback(err);
    }
    callback(null, vendor ? vendor.id : null);
  });
};

const enrichInvoice = (invoice) => {
  const amountRemaining = Math.max(invoice.amount_due - invoice.amount_paid, 0);
  let isOverdue = false;

  if (invoice.due_date && invoice.status !== 'paid') {
    const dueDate = new Date(invoice.due_date);
    const now = new Date();
    isOverdue = dueDate < now;
  }

  return {
    ...invoice,
    amount_remaining: amountRemaining,
    is_overdue: isOverdue,
  };
};

// Get invoices
router.get('/invoices', authenticate, (req, res) => {
  const { status, vendor_id, overdue } = req.query;
  let query = `SELECT i.*, v.name as vendor_name
               FROM invoices i
               LEFT JOIN vendors v ON i.vendor_id = v.id
               WHERE 1=1`;
  const params = [];

  const executeQuery = () => {
    if (status) {
      query += ' AND i.status = ?';
      params.push(status);
    }

    if (overdue === 'true') {
      query += " AND i.status != 'paid' AND i.due_date IS NOT NULL AND DATE(i.due_date) < DATE('now')";
    }

    if (vendor_id && req.user.role !== 'vendor') {
      query += ' AND i.vendor_id = ?';
      params.push(vendor_id);
    }

    query += ' ORDER BY i.issue_date DESC';

    db.all(query, params, (err, invoices) => {
      if (err) {
        return res.status(500).json({ message: 'Database error', error: err.message });
      }

      res.json(invoices.map(enrichInvoice));
    });
  };

  if (req.user.role === 'vendor') {
    getVendorIdForUser(req.user, (err, vendorId) => {
      if (err) {
        return res.status(500).json({ message: 'Database error', error: err.message });
      }

      if (!vendorId) {
        return res.json([]);
      }

      query += ' AND i.vendor_id = ?';
      params.push(vendorId);
      executeQuery();
    });
  } else {
    executeQuery();
  }
});

// Get single invoice with items and payments
router.get('/invoices/:id', authenticate, (req, res) => {
  db.get(
    `SELECT i.*, v.name as vendor_name, v.email as vendor_email
     FROM invoices i
     LEFT JOIN vendors v ON i.vendor_id = v.id
     WHERE i.id = ?`,
    [req.params.id],
    (err, invoice) => {
      if (err) {
        return res.status(500).json({ message: 'Database error', error: err.message });
      }

      if (!invoice) {
        return res.status(404).json({ message: 'Invoice not found' });
      }

      if (req.user.role === 'vendor') {
        getVendorIdForUser(req.user, (vendorErr, vendorId) => {
          if (vendorErr) {
            return res.status(500).json({ message: 'Database error', error: vendorErr.message });
          }

          if (!vendorId || invoice.vendor_id !== vendorId) {
            return res.status(403).json({ message: 'Access denied' });
          }

          return loadInvoiceDetails(invoice);
        });
      } else {
        return loadInvoiceDetails(invoice);
      }
    }
  );

  function loadInvoiceDetails(invoice) {
    db.all('SELECT * FROM invoice_items WHERE invoice_id = ?', [invoice.id], (itemsErr, items) => {
      if (itemsErr) {
        return res.status(500).json({ message: 'Database error', error: itemsErr.message });
      }

      db.all(
        `SELECT p.*, u.username as recorded_by_name
         FROM payments p
         LEFT JOIN users u ON p.recorded_by = u.id
         WHERE p.invoice_id = ?
         ORDER BY datetime(p.payment_date) DESC`,
        [invoice.id],
        (paymentsErr, payments) => {
          if (paymentsErr) {
            return res.status(500).json({ message: 'Database error', error: paymentsErr.message });
          }

          res.json({ ...enrichInvoice(invoice), items, payments });
        }
      );
    });
  }
});

// Download invoice PDF
router.get('/invoices/:id/pdf', authenticate, (req, res) => {
  const invoiceId = req.params.id;

  const sendFileResponse = (filePath, invoiceNumber) => {
    res.download(filePath, `invoice-${invoiceNumber || invoiceId}.pdf`, (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({ message: 'Failed to download invoice PDF' });
      }
    });
  };

  db.get('SELECT id, invoice_number FROM invoices WHERE id = ?', [invoiceId], async (err, invoice) => {
    if (err || !invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    if (req.user.role === 'vendor') {
      getVendorIdForUser(req.user, async (vendorErr, vendorId) => {
        if (vendorErr) {
          return res.status(500).json({ message: 'Database error', error: vendorErr.message });
        }

        if (!vendorId) {
          return res.status(403).json({ message: 'Access denied' });
        }

        db.get('SELECT vendor_id FROM invoices WHERE id = ?', [invoiceId], async (vendorCheckErr, invoiceRow) => {
          if (vendorCheckErr || !invoiceRow || invoiceRow.vendor_id !== vendorId) {
            return res.status(403).json({ message: 'Access denied' });
          }

          try {
            const { filePath } = await ensureInvoicePdf(invoiceId);
            sendFileResponse(filePath, invoice.invoice_number);
          } catch (pdfErr) {
            res.status(500).json({ message: 'Failed to generate invoice PDF', error: pdfErr.message });
          }
        });
      });
      return;
    }

    ensureInvoicePdf(invoiceId)
      .then(({ filePath }) => sendFileResponse(filePath, invoice.invoice_number))
      .catch((pdfErr) => {
        res.status(500).json({ message: 'Failed to generate invoice PDF', error: pdfErr.message });
      });
  });
});

// Create invoice
router.post('/invoices', authenticate, authorize('admin', 'manager'), (req, res) => {
  const { vendor_id, po_id, items, due_date, billing_address, terms, notes } = req.body;

  if (!vendor_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Vendor and at least one line item are required' });
  }

  const sanitizedItems = items.map((item) => ({
    description: item.description?.trim(),
    quantity: Number(item.quantity),
    unit_price: Number(item.unit_price),
  }));

  if (sanitizedItems.some((item) => !item.description || item.quantity <= 0 || item.unit_price < 0)) {
    return res.status(400).json({ message: 'Invalid invoice item data' });
  }

  const amountDue = sanitizedItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);

  if (amountDue <= 0) {
    return res.status(400).json({ message: 'Invoice total must be greater than zero' });
  }

  const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

  db.run(
    `INSERT INTO invoices (invoice_number, po_id, vendor_id, amount_due, amount_paid, status, due_date, notes, billing_address, terms, created_by)
     VALUES (?, ?, ?, ?, 0, 'unpaid', ?, ?, ?, ?, ?)`,
    [
      invoiceNumber,
      po_id || null,
      vendor_id,
      amountDue,
      due_date || null,
      notes || null,
      billing_address || null,
      terms || null,
      req.user.id,
    ],
    function (err) {
      if (err) {
        return res.status(500).json({ message: 'Database error', error: err.message });
      }

      const invoiceId = this.lastID;
      const insertItems = sanitizedItems.map(
        (item) =>
          new Promise((resolve, reject) => {
            const subtotal = item.quantity * item.unit_price;
            db.run(
              `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, subtotal)
               VALUES (?, ?, ?, ?, ?)`,
              [invoiceId, item.description, item.quantity, item.unit_price, subtotal],
              (itemErr) => {
                if (itemErr) reject(itemErr);
                else resolve();
              }
            );
          })
      );

      Promise.all(insertItems)
        .then(() => {
          db.get('SELECT * FROM invoices WHERE id = ?', [invoiceId], (fetchErr, invoice) => {
            if (fetchErr || !invoice) {
              return res.status(201).json({
                message: 'Invoice created, but fetching details failed',
                invoice_id: invoiceId,
                invoice_number: invoiceNumber,
              });
            }

            res.status(201).json({
              message: 'Invoice created successfully',
              invoice: enrichInvoice(invoice),
            });
          });
        })
        .catch((itemErr) => {
          res.status(500).json({
            message: 'Invoice created but item insertion failed',
            error: itemErr.message,
            invoice_id: invoiceId,
          });
        });
    }
  );
});

// Record payment
router.post('/invoices/:id/payments', authenticate, authorize('admin', 'manager'), (req, res) => {
  const { amount, method, reference, notes, payment_date } = req.body;

  const paymentAmount = Number(amount);
  if (!paymentAmount || paymentAmount <= 0) {
    return res.status(400).json({ message: 'Payment amount must be greater than zero' });
  }

  db.get('SELECT * FROM invoices WHERE id = ?', [req.params.id], (err, invoice) => {
    if (err) {
      return res.status(500).json({ message: 'Database error', error: err.message });
    }
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const remaining = Math.max(invoice.amount_due - invoice.amount_paid, 0);
    if (remaining <= 0) {
      return res.status(400).json({ message: 'Invoice is already fully paid' });
    }

    if (paymentAmount > remaining) {
      return res.status(400).json({ message: 'Payment exceeds remaining balance' });
    }

    const newAmountPaid = invoice.amount_paid + paymentAmount;
    const amountRemaining = Math.max(invoice.amount_due - newAmountPaid, 0);
    const newStatus = amountRemaining <= 0 ? 'paid' : 'partial';

    db.run(
      `INSERT INTO payments (invoice_id, amount, payment_date, method, reference, notes, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        invoice.id,
        paymentAmount,
        payment_date || null,
        method || null,
        reference || null,
        notes || null,
        req.user.id,
      ],
      function (paymentErr) {
        if (paymentErr) {
          return res.status(500).json({ message: 'Database error', error: paymentErr.message });
        }

        db.run(
          'UPDATE invoices SET amount_paid = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [newAmountPaid, newStatus, invoice.id],
          (updateErr) => {
            if (updateErr) {
              return res.status(500).json({ message: 'Database error', error: updateErr.message });
            }

            db.get('SELECT * FROM invoices WHERE id = ?', [invoice.id], (fetchErr, updatedInvoice) => {
              if (fetchErr || !updatedInvoice) {
                return res.json({
                  message: 'Payment recorded, but fetching updated invoice failed',
                  invoice_id: invoice.id,
                });
              }

              db.all(
                `SELECT p.*, u.username as recorded_by_name
                 FROM payments p
                 LEFT JOIN users u ON p.recorded_by = u.id
                 WHERE p.invoice_id = ?
                 ORDER BY datetime(p.payment_date) DESC`,
                [invoice.id],
                (paymentsErr, payments) => {
                  if (paymentsErr) {
                    return res.status(500).json({ message: 'Payment recorded but fetching payments failed', error: paymentsErr.message });
                  }

                  res.json({
                    message: 'Payment recorded successfully',
                    invoice: enrichInvoice(updatedInvoice),
                    payments,
                  });
                }
              );
            });
          }
        );
      }
    );
  });
});

module.exports = router;
