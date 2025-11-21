const express = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { geocodeAddress } = require('../utils/geocode');
const router = express.Router();

// Get all shipments
router.get('/', authenticate, (req, res) => {
  const { status } = req.query;
  let query = `SELECT s.*, v.name as vendor_name, po.po_number
               FROM shipments s
               LEFT JOIN vendors v ON s.vendor_id = v.id
               LEFT JOIN purchase_orders po ON s.po_id = po.id
               WHERE 1=1`;
  const params = [];

  // If vendor role, only show shipments for vendors linked to this user
  if (req.user.role === 'vendor') {
    db.get('SELECT id FROM vendors WHERE email = ?', [req.user.email], (err, vendor) => {
      if (!err && vendor) {
        query += ' AND s.vendor_id = ?';
        params.push(vendor.id);
      }
      executeQuery();
    });
  } else {
    executeQuery();
  }

  function executeQuery() {
    if (status) {
      query += ' AND s.status = ?';
      params.push(status);
    }

    query += ' ORDER BY s.created_at DESC';

    db.all(query, params, (err, rows) => {
      if (err) {
        return res.status(500).json({ message: 'Database error', error: err.message });
      }
      res.json(rows);
    });
  }
});

// Get single shipment with history
router.get('/:id', authenticate, (req, res) => {
  db.get(
    `SELECT s.*, v.name as vendor_name, v.email as vendor_email, po.po_number
     FROM shipments s
     LEFT JOIN vendors v ON s.vendor_id = v.id
     LEFT JOIN purchase_orders po ON s.po_id = po.id
     WHERE s.id = ?`,
    [req.params.id],
    (err, shipment) => {
      if (err) {
        return res.status(500).json({ message: 'Database error', error: err.message });
      }
      if (!shipment) {
        return res.status(404).json({ message: 'Shipment not found' });
      }

      // Check if vendor can access this shipment
      if (req.user.role === 'vendor') {
        db.get('SELECT id FROM vendors WHERE email = ?', [req.user.email], (err, vendor) => {
          if (err || !vendor || shipment.vendor_id !== vendor.id) {
            return res.status(403).json({ message: 'Access denied' });
          }
          getHistory();
        });
      } else {
        getHistory();
      }

      function getHistory() {
        // Get shipment history
        db.all(
          'SELECT * FROM shipment_history WHERE shipment_id = ? ORDER BY timestamp DESC',
          [req.params.id],
          (err, history) => {
            if (err) {
              return res.status(500).json({ message: 'Database error', error: err.message });
            }
            res.json({ ...shipment, history });
          }
        );
      }
    }
  );
});

// Create shipment
router.post('/', authenticate, async (req, res) => {
  const { po_id, vendor_id, origin_address, destination_address, carrier, estimated_delivery } = req.body;

  if (!vendor_id || !origin_address || !destination_address) {
    return res.status(400).json({ message: 'Vendor ID, origin, and destination addresses are required' });
  }

  // Generate tracking number
  const tracking_number = `TRK-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

  let originCoords = null;
  try {
    originCoords = await geocodeAddress(origin_address);
  } catch (error) {
    console.error('Origin geocoding failed:', error.message);
  }

  const initialLat = originCoords?.lat || null;
  const initialLng = originCoords?.lng || null;

  db.run(
    `INSERT INTO shipments (tracking_number, po_id, vendor_id, origin_address, destination_address, carrier, estimated_delivery, current_location, current_lat, current_lng)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tracking_number,
      po_id || null,
      vendor_id,
      origin_address,
      destination_address,
      carrier || null,
      estimated_delivery || null,
      origin_address,
      initialLat,
      initialLng,
    ],
    function(err) {
      if (err) {
        return res.status(500).json({ message: 'Database error', error: err.message });
      }

      const shipmentId = this.lastID;

      // Create initial history entry
      db.run(
        `INSERT INTO shipment_history (shipment_id, status, location, lat, lng, notes)
         VALUES (?, 'pending', ?, ?, ?, 'Shipment created')`,
        [shipmentId, origin_address, initialLat, initialLng],
        () => {}
      );

      res.status(201).json({
        message: 'Shipment created successfully',
        id: shipmentId,
        tracking_number
      });
    }
  );
});

// Update shipment location/status
router.put('/:id', authenticate, async (req, res) => {
  const { status, current_location, current_lat, current_lng, notes } = req.body;

  try {
    const shipment = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM shipments WHERE id = ?', [req.params.id], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });

    if (!shipment) {
      return res.status(404).json({ message: 'Shipment not found' });
    }

    const newStatus = status || shipment.status;
    let newLocation = current_location || shipment.current_location;
    let newLat = current_lat !== undefined ? current_lat : shipment.current_lat;
    let newLng = current_lng !== undefined ? current_lng : shipment.current_lng;

    if (current_location && (current_lat === undefined || current_lng === undefined)) {
      try {
        const coords = await geocodeAddress(current_location);
        if (coords) {
          newLat = coords.lat;
          newLng = coords.lng;
        }
      } catch (error) {
        console.error('Update geocoding failed:', error.message);
      }
    }

    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE shipments 
         SET status = ?,
             current_location = ?,
             current_lat = ?,
             current_lng = ?,
             updated_at = CURRENT_TIMESTAMP,
             actual_delivery = CASE WHEN ? = 'delivered' THEN CURRENT_TIMESTAMP ELSE actual_delivery END
         WHERE id = ?`,
        [newStatus, newLocation, newLat, newLng, newStatus, req.params.id],
        function(err) {
          if (err) return reject(err);
          resolve();
        }
      );
    });

    if (status || current_location || current_lat !== undefined || current_lng !== undefined) {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO shipment_history (shipment_id, status, location, lat, lng, notes)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [req.params.id, newStatus, newLocation, newLat, newLng, notes || 'Status updated'],
          (err) => {
            if (err) return reject(err);
            resolve();
          }
        );
      });
    }

    res.json({ message: 'Shipment updated successfully', current_lat: newLat, current_lng: newLng });
  } catch (error) {
    if (error && error.message === 'Shipment not found') {
      return res.status(404).json({ message: 'Shipment not found' });
    }
    console.error('Shipment update failed:', error);
    res.status(500).json({ message: 'Database error', error: error.message });
  }
});

// Delete shipment (Admin only)
router.delete('/:id', authenticate, (req, res) => {
  db.run('DELETE FROM shipment_history WHERE shipment_id = ?', [req.params.id], (err) => {
    if (err) {
      return res.status(500).json({ message: 'Database error', error: err.message });
    }
    db.run('DELETE FROM shipments WHERE id = ?', [req.params.id], function(err) {
      if (err) {
        return res.status(500).json({ message: 'Database error', error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ message: 'Shipment not found' });
      }
      res.json({ message: 'Shipment deleted successfully' });
    });
  });
});

module.exports = router;

