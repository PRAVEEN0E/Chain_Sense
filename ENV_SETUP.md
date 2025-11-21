# Environment Setup Guide

## Quick Start

1. Copy the environment example file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` file with your configuration

## Required Configuration

### Minimum Setup (Basic Functionality)
```env
PORT=5000
NODE_ENV=development
JWT_SECRET=your-secret-key-change-in-production
```

### Email Configuration (For Purchase Order Notifications)

#### Gmail Setup:
1. Enable 2-Factor Authentication on your Gmail account
2. Go to: https://myaccount.google.com/apppasswords
3. Generate an App Password for "Mail"
4. Use your email and the app password:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password-here
```

#### Other SMTP Providers:
- **Outlook/Hotmail**: `smtp-mail.outlook.com` port 587
- **Yahoo**: `smtp.mail.yahoo.com` port 587
- **Custom SMTP**: Use your provider's SMTP settings

### Optional: Twilio Setup (SMS/WhatsApp Notifications)

1. Sign up at: https://www.twilio.com
2. Get your Account SID and Auth Token from the dashboard
3. Purchase a phone number (for SMS) or use WhatsApp sandbox
4. Add to `.env`:

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_WHATSAPP_NUMBER=whatsapp:+1234567890
```

**Note**: Twilio is optional. The app will work without it, but SMS/WhatsApp notifications won't be sent.

### Maps (Shipment Tracking)

We now use [Leaflet](https://leafletjs.com/) with free OpenStreetMap tiles, so there is no API key required. The map will work out of the box after installing dependencies.

## Production Configuration

For production deployment:

1. **Change JWT_SECRET**: Use a strong random string
   ```bash
   # Generate a secure secret:
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```

2. **Set NODE_ENV**:
   ```env
   NODE_ENV=production
   ```

3. **Use Production SMTP Server**:
   - Consider services like SendGrid, Mailgun, or AWS SES
   - Update SMTP credentials accordingly

4. **Database**: 
   - SQLite is fine for small-medium deployments
   - For larger scale, consider migrating to PostgreSQL

5. **HTTPS**: Ensure your production server uses HTTPS
   - The app uses HTTPS-ready configuration
   - Set up SSL certificates with your hosting provider

## Security Checklist

- [ ] Changed default JWT_SECRET
- [ ] Changed default admin password
- [ ] Set NODE_ENV=production
- [ ] Using HTTPS in production
- [ ] SMTP credentials are secure
- [ ] API keys are kept secret
- [ ] Database is backed up regularly

## Testing Configuration

After setting up `.env`:

1. Test email: Create a purchase order and check if vendor receives email
2. Test SMS: Send a test notification (if Twilio configured)
3. Test Maps: View shipment details (if Google Maps API configured)

## Troubleshooting

### Email Not Sending
- Check SMTP credentials
- Verify firewall isn't blocking port 587
- Check spam folder
- For Gmail: Ensure 2FA is enabled and using App Password

### Twilio Errors
- Verify Account SID and Auth Token
- Check phone number format (include country code)
- Ensure sufficient Twilio account balance

### Maps Not Loading
- Verify API key is correct
- Check API key restrictions in Google Cloud Console
- Ensure Maps JavaScript API is enabled

