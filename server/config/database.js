const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../../data/chain_sense.db');

// Create database directory if it doesn't exist
const fs = require('fs');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

function initializeDatabase() {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff',
    full_name TEXT,
    phone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Inventory table
  db.run(`CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sku TEXT UNIQUE,
    description TEXT,
    category TEXT,
    quantity INTEGER NOT NULL DEFAULT 0,
    min_stock_level INTEGER DEFAULT 10,
    unit_price REAL,
    supplier_id INTEGER,
    location TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES vendors(id)
  )`);

  // Vendors table
  db.run(`CREATE TABLE IF NOT EXISTS vendors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    contact_person TEXT,
    payment_terms TEXT,
    rating REAL DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Purchase Orders table
  db.run(`CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number TEXT UNIQUE NOT NULL,
    vendor_id INTEGER NOT NULL,
    created_by INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    total_amount REAL NOT NULL,
    order_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    expected_delivery_date DATETIME,
    notes TEXT,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  )`);

  // Purchase Order Items table
  db.run(`CREATE TABLE IF NOT EXISTS purchase_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    subtotal REAL NOT NULL,
    FOREIGN KEY (po_id) REFERENCES purchase_orders(id),
    FOREIGN KEY (item_id) REFERENCES inventory(id)
  )`);

  // Shipments table
  db.run(`CREATE TABLE IF NOT EXISTS shipments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tracking_number TEXT UNIQUE NOT NULL,
    po_id INTEGER,
    vendor_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    origin_address TEXT,
    destination_address TEXT,
    current_location TEXT,
    current_lat REAL,
    current_lng REAL,
    estimated_delivery DATETIME,
    actual_delivery DATETIME,
    carrier TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (po_id) REFERENCES purchase_orders(id),
    FOREIGN KEY (vendor_id) REFERENCES vendors(id)
  )`);

  // Shipment History table
  db.run(`CREATE TABLE IF NOT EXISTS shipment_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    location TEXT,
    lat REAL,
    lng REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    FOREIGN KEY (shipment_id) REFERENCES shipments(id)
  )`);

  // Notifications table
  db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    read BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // Create default admin user if doesn't exist
  const bcrypt = require('bcryptjs');
  const defaultPassword = bcrypt.hashSync('admin123', 10);
  
  db.get("SELECT id FROM users WHERE username = 'admin'", (err, row) => {
    if (!row) {
      db.run(`INSERT INTO users (username, email, password, role, full_name) 
              VALUES ('admin', 'admin@chainsense.com', ?, 'admin', 'Administrator')`, 
              [defaultPassword]);
      console.log('Default admin user created (username: admin, password: admin123)');
    }
  });

  // Create default vendor user if doesn't exist
  const vendorPassword = bcrypt.hashSync('vendor123', 10);
  
  db.get("SELECT id FROM users WHERE username = 'vendor'", (err, row) => {
    if (!row) {
      db.run(`INSERT INTO users (username, email, password, role, full_name) 
              VALUES ('vendor', 'vendor@chainsense.com', ?, 'vendor', 'Default Vendor')`, 
              [vendorPassword]);
      console.log('Default vendor user created (username: vendor, password: vendor123)');
    }
  });
}

module.exports = db;

