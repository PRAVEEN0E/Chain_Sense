const nodemailer = require('nodemailer');

const smtpConfig = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
};

if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  smtpConfig.auth = {
    user:  'pp0600310@gmail.com',
    pass: 'mspyffquelfhsgnd',
  };
}

const transporter = (process.env.SMTP_USER && process.env.SMTP_PASS)
  ? nodemailer.createTransport(smtpConfig)
  : null;

const isEmailConfigured = !!transporter;

const sendEmail = async (mailOptions = {}) => {
  if (!transporter) {
    console.warn('Email not configured. Skipping send.');
    return { skipped: true };
  }

  const finalOptions = {
    from: mailOptions.from || process.env.SMTP_USER,
    ...mailOptions,
  };
    
  return transporter.sendMail(finalOptions);
};

module.exports = {
  sendEmail,
  isEmailConfigured,
};
