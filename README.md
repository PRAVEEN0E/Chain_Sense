# Chain Sense - Supply Chain Management Platform

A comprehensive web-mobile supply chain management platform designed for Micro, Small, and Medium Enterprises (MSMEs). Chain Sense helps businesses manage inventory, vendors, purchase orders, shipments, and analytics efficiently with real-time tracking and notifications.

## Features

### Core Functionality
- **Inventory Management**: Add, update, and track stock levels with low-stock alerts
- **Vendor Management**: Manage vendor details, pricing, and performance ratings
- **Purchase Orders**: Create and send purchase orders via email/WhatsApp
- **Shipment Tracking**: Track shipments in real-time with location updates
- **Role-Based Access Control**: Admin, Manager, and Staff access levels
- **Notifications**: Multi-channel alerts via SMS (Twilio), Email (Nodemailer), and WhatsApp
- **Analytics Dashboard**: Comprehensive charts, data tables, and export options
- **Secure Authentication**: BCrypt password hashing and JWT-based authentication

## Tech Stack

### Frontend
- React.js 18
- Tailwind CSS for styling
- Chart.js for data visualization
- React Router for navigation
- GSAP & Three.js for animations (available for future enhancements)

### Backend
- Node.js with Express.js
- SQLite database
- JWT for authentication
- BCrypt for password hashing

### Integrations
- **Email**: Nodemailer (SMTP)
- **SMS/WhatsApp**: Twilio API
- **Maps**: Google Maps API (for shipment tracking)

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Chainsense
   ```

2. **Install dependencies**
   ```bash
   npm run install-all
   ```
   This installs both backend and frontend dependencies.

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add your configuration:
   - SMTP credentials for email
   - Twilio credentials (optional) for SMS/WhatsApp
   - Google Maps API key (optional) for shipment tracking
   - JWT secret (change in production!)

4. **Start the development server**
   ```bash
   npm run dev
   ```
   This starts both the backend (port 5000) and frontend (port 3000) concurrently.

   Or start them separately:
   ```bash
   # Backend only
   npm run server

   # Frontend only (in another terminal)
   npm run client
   ```

5. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5000

### Default Credentials
- **Username**: `admin`
- **Password**: `admin123`

> ⚠️ **Important**: Change the default admin password after first login in production!

## Project Structure

```
Chainsense/
├── client/                 # React frontend
│   ├── public/
│   ├── src/
│   │   ├── components/    # Reusable components
│   │   ├── contexts/      # React contexts (Auth)
│   │   ├── pages/         # Page components
│   │   ├── App.js
│   │   └── index.js
│   ├── package.json
│   └── tailwind.config.js
├── server/                 # Node.js backend
│   ├── config/            # Database configuration
│   ├── middleware/        # Auth middleware
│   ├── routes/            # API routes
│   └── index.js           # Server entry point
├── data/                  # SQLite database (auto-created)
├── package.json
├── .env.example
└── README.md
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user

### Inventory
- `GET /api/inventory` - Get all items
- `GET /api/inventory/:id` - Get single item
- `POST /api/inventory` - Create item (Admin/Manager)
- `PUT /api/inventory/:id` - Update item
- `DELETE /api/inventory/:id` - Delete item (Admin)

### Vendors
- `GET /api/vendors` - Get all vendors
- `GET /api/vendors/:id` - Get single vendor
- `POST /api/vendors` - Create vendor (Admin/Manager)
- `PUT /api/vendors/:id` - Update vendor (Admin/Manager)
- `DELETE /api/vendors/:id` - Delete vendor (Admin)

### Purchase Orders
- `GET /api/purchase-orders` - Get all orders
- `GET /api/purchase-orders/:id` - Get single order
- `POST /api/purchase-orders` - Create order (Admin/Manager)
- `PUT /api/purchase-orders/:id` - Update order status
- `DELETE /api/purchase-orders/:id` - Delete order (Admin)

### Shipments
- `GET /api/shipments` - Get all shipments
- `GET /api/shipments/:id` - Get shipment with history
- `POST /api/shipments` - Create shipment
- `PUT /api/shipments/:id` - Update shipment location/status
- `DELETE /api/shipments/:id` - Delete shipment (Admin)

### Notifications
- `GET /api/notifications` - Get user notifications
- `PUT /api/notifications/:id/read` - Mark as read
- `PUT /api/notifications/read-all` - Mark all as read
- `POST /api/notifications/send` - Send notification

### Analytics
- `GET /api/analytics/dashboard` - Dashboard statistics
- `GET /api/analytics/inventory-trends` - Inventory trends
- `GET /api/analytics/vendor-performance` - Vendor performance
- `GET /api/analytics/order-trends` - Order trends
- `GET /api/analytics/export/:type` - Export data (CSV)

## Role-Based Access Control

### Admin
- Full access to all features
- Can delete records
- Can manage users

### Manager
- Can create and update inventory, vendors, orders
- Can view all analytics
- Cannot delete records

### Staff
- Can view inventory, vendors, orders, shipments
- Can update inventory quantities
- Limited access to analytics

## Database Schema

The application uses SQLite with the following main tables:
- `users` - User accounts and roles
- `inventory` - Inventory items
- `vendors` - Vendor information
- `purchase_orders` - Purchase orders
- `purchase_order_items` - Order line items
- `shipments` - Shipment tracking
- `shipment_history` - Shipment location history
- `notifications` - System notifications

## Configuration

### Email Setup (Gmail Example)
1. Enable 2-factor authentication on your Gmail account
2. Generate an app password: https://myaccount.google.com/apppasswords
3. Use the app password in `SMTP_PASS`

### Twilio Setup (Optional)
1. Sign up at https://www.twilio.com
2. Get your Account SID and Auth Token
3. Add phone numbers for SMS and WhatsApp
4. Update `.env` with your credentials

### Google Maps API (Optional)
1. Get API key from https://console.cloud.google.com
2. Enable Maps JavaScript API
3. Add key to `.env` as `GOOGLE_MAPS_API_KEY`

## Production Deployment

1. **Build the frontend**
   ```bash
   npm run build
   ```

2. **Set environment variables**
   - Use a strong `JWT_SECRET`
   - Configure production SMTP server
   - Set `NODE_ENV=production`

3. **Start the server**
   ```bash
   npm run server
   ```

4. **Database**
   - SQLite database file will be created at `data/chain_sense.db`
   - Backup this file regularly in production
   - Consider migrating to PostgreSQL for production use

## Security Considerations

- ✅ Password hashing with BCrypt
- ✅ JWT token authentication
- ✅ Role-based access control
- ✅ SQL injection protection (parameterized queries)
- ⚠️ Change default JWT secret in production
- ⚠️ Use HTTPS in production
- ⚠️ Implement rate limiting for production
- ⚠️ Add input validation middleware

## Future Enhancements

- [ ] Mobile app (React Native)
- [ ] Real-time notifications with WebSockets
- [ ] Advanced analytics with AI predictions
- [ ] Multi-language support
- [ ] Integration with accounting software
- [ ] Barcode/QR code scanning
- [ ] Advanced reporting with PDF generation

## License

MIT License - feel free to use this project for learning or commercial purposes.

## Support

For issues, questions, or contributions, please open an issue on the repository.

---

**Built with ❤️ for MSMEs**

#   C h a i n _ S e n s e  
 #   C h a i n _ S e n s e  
 