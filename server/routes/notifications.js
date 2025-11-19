const express = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const router = express.Router();

// Email transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER|| 'pp0600310@gmail.com',
    pass: process.env.SMTP_PASS|| 'mspyffquelfhsgnd'
  }
});

// Twilio client (optional)
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

// Get user notifications
router.get('/', authenticate, (req, res) => {
  const { unread_only } = req.query;
  let query = 'SELECT * FROM notifications WHERE user_id = ? OR user_id IS NULL';
  const params = [req.user.id];

  if (unread_only === 'true') {
    query += ' AND read = 0';
  }

  query += ' ORDER BY created_at DESC LIMIT 50';

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ message: 'Database error', error: err.message });
    }
    res.json(rows);
  });
});

// Mark notification as read
router.put('/:id/read', authenticate, (req, res) => {
  db.run(
    'UPDATE notifications SET read = 1 WHERE id = ? AND (user_id = ? OR user_id IS NULL)',
    [req.params.id, req.user.id],
    function(err) {
      if (err) {
        return res.status(500).json({ message: 'Database error', error: err.message });
      }
      res.json({ message: 'Notification marked as read' });
    }
  );
});

// Mark all as read
router.put('/read-all', authenticate, (req, res) => {
  db.run(
    'UPDATE notifications SET read = 1 WHERE (user_id = ? OR user_id IS NULL) AND read = 0',
    [req.user.id],
    function(err) {
      if (err) {
        return res.status(500).json({ message: 'Database error', error: err.message });
      }
      res.json({ message: 'All notifications marked as read' });
    }
  );
});

// Send notification via multiple channels
router.post('/send', authenticate, (req, res) => {
  const { user_id, type, title, message, channels } = req.body;
  // channels: ['email', 'sms', 'whatsapp', 'in_app']

  if (!type || !title || !message) {
    return res.status(400).json({ message: 'Type, title, and message are required' });
  }

  // Save to database
  db.run(
    'INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)',
    [user_id || null, type, title, message],
    function(err) {
      if (err) {
        return res.status(500).json({ message: 'Database error', error: err.message });
      }

      const notificationId = this.lastID;
      const sendPromises = [];

      // Get user details if user_id provided
      if (user_id && (channels?.includes('email') || channels?.includes('sms') || channels?.includes('whatsapp'))) {
        db.get('SELECT email, phone FROM users WHERE id = ?', [user_id], (err, user) => {
          if (!err && user) {
            // Send email
            if (channels?.includes('email') && user.email && transporter.options.auth.user) {
              const mailOptions = {
                from: transporter.options.auth.user,
                to: user.email,
                subject: title,
                text: message,
                html: `<h2>${title}</h2><p>${message}</p>`
              };
              sendPromises.push(transporter.sendMail(mailOptions).catch(err => console.error('Email error:', err)));
            }

            // Send SMS via Twilio
            if (channels?.includes('sms') && user.phone && twilioClient && process.env.TWILIO_PHONE_NUMBER) {
              sendPromises.push(
                twilioClient.messages.create({
                  body: `${title}: ${message}`,
                  from: process.env.TWILIO_PHONE_NUMBER,
                  to: user.phone
                }).catch(err => console.error('SMS error:', err))
              );
            }

            // WhatsApp (can use Twilio WhatsApp API)
            if (channels?.includes('whatsapp') && user.phone && twilioClient && process.env.TWILIO_WHATSAPP_NUMBER) {
              sendPromises.push(
                twilioClient.messages.create({
                  body: `${title}: ${message}`,
                  from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
                  to: `whatsapp:${user.phone}`
                }).catch(err => console.error('WhatsApp error:', err))
              );
            }
          }
        });
      }

      Promise.all(sendPromises).then(() => {
        res.status(201).json({
          message: 'Notification sent successfully',
          id: notificationId
        });
      }).catch(() => {
        // Even if external sends fail, notification is saved
        res.status(201).json({
          message: 'Notification saved (some channels may have failed)',
          id: notificationId
        });
      });
    }
  );
});

module.exports = router;

