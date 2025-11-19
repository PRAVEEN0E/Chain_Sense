# Quick Start Guide - Chain Sense

## Installation (5 minutes)

### Step 1: Install Dependencies
```bash
npm run install-all
```

This installs both backend and frontend dependencies automatically.

### Step 2: Configure Environment
```bash
# Windows (PowerShell)
Copy-Item .env.example .env

# Linux/Mac
cp .env.example .env
```

Edit `.env` file - minimum required:
```env
PORT=5000
JWT_SECRET=change-this-to-random-string
```

For email notifications (optional but recommended):
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

See `ENV_SETUP.md` for detailed configuration.

### Step 3: Start the Application
```bash
npm run dev
```

This starts both backend (port 5000) and frontend (port 3000).

### Step 4: Access the App
- Open browser: http://localhost:3000
- Login with:
  - **Username**: `admin`
  - **Password**: `admin123`

## First Steps After Login

1. **Change Admin Password** (Important!)
   - Go to profile settings (future feature)
   - Or use API: `POST /api/auth/register` to create new admin

2. **Add Your First Inventory Item**
   - Click "Inventory" in sidebar
   - Click "+ Add Item"
   - Fill in details and save

3. **Add a Vendor**
   - Click "Vendors" in sidebar
   - Click "+ Add Vendor"
   - Enter vendor information

4. **Create a Purchase Order**
   - Click "Purchase Orders"
   - Click "+ Create PO"
   - Select vendor and add items
   - Vendor will receive email notification (if SMTP configured)

5. **Track a Shipment**
   - Click "Shipments"
   - Click "+ Create Shipment"
   - Enter origin and destination
   - Update location as shipment progresses

6. **View Analytics**
   - Click "Analytics" for charts and insights
   - Export data to CSV for reporting

## Common Commands

```bash
# Development (both frontend and backend)
npm run dev

# Backend only
npm run server

# Frontend only
npm run client

# Build for production
npm run build

# Install all dependencies
npm run install-all
```

## Troubleshooting

### Port Already in Use
If port 5000 or 3000 is in use:
- Change `PORT` in `.env` file
- Or stop the conflicting process

### Database Issues
- Database is auto-created at `data/chain_sense.db`
- Delete this file to reset database (you'll lose all data)
- Database directory is auto-created

### Email Not Working
- Check `ENV_SETUP.md` for SMTP configuration
- For Gmail: Must use App Password, not regular password
- Check spam folder for test emails

### Frontend Not Loading
- Make sure backend is running first
- Check browser console for errors
- Verify proxy setting in `client/package.json`

## Next Steps

- Read full `README.md` for detailed documentation
- Check `ENV_SETUP.md` for advanced configuration
- Explore the dashboard and features
- Configure Twilio for SMS notifications (optional)
- Add Google Maps API key for enhanced tracking (optional)

## Getting Help

- Check the README.md for API documentation
- Review error messages in browser console and terminal
- Ensure all environment variables are set correctly

---

**Happy Supply Chain Managing! 🚀**

