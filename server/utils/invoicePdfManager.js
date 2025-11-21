const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const db = require('../config/database');

const invoicesDir = path.join(__dirname, '../../data/invoices');

const ensureDirectory = () => {
  if (!fs.existsSync(invoicesDir)) {
    fs.mkdirSync(invoicesDir, { recursive: true });
  }
};

const BRAND = {
  primary: '#111827',
  accent: '#2563eb',
  accentLight: '#dbeafe',
  subtleBg: '#f8fafc',
  border: '#e5e7eb',
  muted: '#6b7280',
};

const COMPANY = {
  name: 'Chain Sense',
  tagline: 'Supply Chain Management Suite',
  address: '1st Floor, Tech Park Campus, Bengaluru, India',
  contact: 'support@chainsense.io • +91 98765 43210',
};

const formatCurrency = (value = 0) => {
  const amount = Number(value) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount);
};

const loadInvoiceData = (invoiceId) => (
  new Promise((resolve, reject) => {
    db.get(
      `SELECT i.*, v.name as vendor_name, v.address as vendor_address, v.email as vendor_email
       FROM invoices i
       LEFT JOIN vendors v ON i.vendor_id = v.id
       WHERE i.id = ?`,
      [invoiceId],
      (err, invoice) => {
        if (err) {
          return reject(err);
        }

        if (!invoice) {
          return resolve(null);
        }

        db.all(
          'SELECT description, quantity, unit_price, subtotal FROM invoice_items WHERE invoice_id = ?',
          [invoiceId],
          (itemsErr, items) => {
            if (itemsErr) {
              return reject(itemsErr);
            }

            resolve({ invoice, items: items || [] });
          }
        );
      }
    );
  })
);

const drawInvoiceHeader = (doc, invoice) => {
  const headerHeight = 90;
  doc.save();
  doc.rect(0, 0, doc.page.width, headerHeight).fill(BRAND.primary);

  doc.fillColor('#ffffff')
    .fontSize(24)
    .text(COMPANY.name, 50, 28);

  doc.fontSize(11).text(COMPANY.tagline, 50, 56);

  doc.fontSize(10)
    .text('Invoice', doc.page.width - 180, 28, { width: 130, align: 'right' })
    .fontSize(16)
    .text(invoice.invoice_number || '-', doc.page.width - 180, 44, { width: 130, align: 'right' });

  doc.restore();
  doc.moveDown(2);
};

const drawInvoiceMeta = (doc, invoice) => {
  const metaItems = [
    { label: 'Issue Date', value: new Date(invoice.issue_date || Date.now()).toLocaleDateString() },
    { label: 'Due Date', value: invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : 'N/A' },
    { label: 'PO Number', value: invoice.po_id ? `PO-${invoice.po_id}` : '—' },
    { label: 'Status', value: invoice.status ? invoice.status.toUpperCase() : 'UNPAID' },
  ];

  const columnWidth = 220;
  const startY = doc.y + 5;

  metaItems.forEach((item, idx) => {
    const row = Math.floor(idx / 2);
    const col = idx % 2;
    const x = 50 + col * columnWidth;
    const y = startY + row * 32;

    doc
      .fontSize(9)
      .fillColor(BRAND.muted)
      .text(item.label.toUpperCase(), x, y);
    doc
      .fontSize(12)
      .fillColor(BRAND.primary)
      .text(item.value, x, y + 12);
  });

  const summaryX = doc.page.width - 230;
  const summaryY = startY - 10;

  doc.save();
  doc.roundedRect(summaryX, summaryY, 180, 80, 10)
    .fill(BRAND.subtleBg)
    .strokeColor(BRAND.border)
    .lineWidth(1)
    .stroke();

  doc.fillColor(BRAND.muted)
    .fontSize(9)
    .text('Amount Due', summaryX + 18, summaryY + 16);
  doc
    .fontSize(20)
    .fillColor(BRAND.accent)
    .text(formatCurrency(invoice.amount_due), summaryX + 18, summaryY + 32);
  doc
    .fontSize(9)
    .fillColor(BRAND.muted)
    .text('Amount Paid', summaryX + 18, summaryY + 55);
  doc
    .fontSize(12)
    .fillColor(BRAND.primary)
    .text(formatCurrency(invoice.amount_paid), summaryX + 18, summaryY + 68);
  doc.restore();

  doc.moveDown(3);
};

const drawVendorAndBilling = (doc, invoice) => {
  const billingAddress = invoice.billing_address || invoice.vendor_address || 'N/A';
  const sectionTop = doc.y;
  const cardWidth = (doc.page.width - 130) / 2;

  const sections = [
    {
      title: 'Bill To',
      lines: [
        invoice.vendor_name || 'Vendor',
        billingAddress,
        invoice.vendor_email || '',
      ].filter(Boolean),
    },
    {
      title: 'Remit To',
      lines: [
        COMPANY.name,
        COMPANY.address,
        COMPANY.contact,
        `Payment Terms: ${invoice.terms || 'Net 30'}`,
      ],
    },
  ];

  sections.forEach((section, idx) => {
    const x = 50 + idx * (cardWidth + 30);
    doc.save();
    doc.roundedRect(x, sectionTop, cardWidth, 110, 8)
      .lineWidth(1)
      .strokeColor(BRAND.border)
      .fill(BRAND.subtleBg)
      .stroke()
      .fillColor(BRAND.subtleBg);
    doc.restore();

    doc
      .fontSize(10)
      .fillColor(BRAND.muted)
      .text(section.title.toUpperCase(), x + 14, sectionTop + 12);
    doc
      .fontSize(11)
      .fillColor(BRAND.primary);

    let lineY = sectionTop + 30;
    section.lines.forEach((line) => {
      doc.text(line, x + 14, lineY, { width: cardWidth - 28 });
      lineY += 14;
    });
  });

  doc.moveDown(7);
};

const drawLineItemsTable = (doc, items = []) => {
  const tableTop = doc.y + 5;
  const rowHeight = 24;
  const tableWidth = doc.page.width - 100;
  const columnPositions = [60, 320, 400, 470];

  doc.save();
  doc.rect(50, tableTop, tableWidth, 28).fill(BRAND.primary);
  doc.fillColor('#ffffff').fontSize(10);
  doc.text('Description', columnPositions[0], tableTop + 9, { width: 240 });
  doc.text('Qty', columnPositions[1], tableTop + 9, { width: 60, align: 'right' });
  doc.text('Unit Price', columnPositions[2], tableTop + 9, { width: 60, align: 'right' });
  doc.text('Subtotal', columnPositions[3], tableTop + 9, { width: 80, align: 'right' });
  doc.restore();

  let position = tableTop + 28;
  const rows = items.length > 0 ? items : [{ description: 'No line items recorded', quantity: 0, unit_price: 0, subtotal: 0 }];

  rows.forEach((item, index) => {
    doc.save();
    if (index % 2 === 0) {
      doc.rect(50, position, tableWidth, rowHeight).fill(BRAND.subtleBg);
    }
    doc.restore();

    doc
      .fontSize(10)
      .fillColor(BRAND.primary)
      .text(item.description, columnPositions[0], position + 8, { width: 240 })
      .text(String(item.quantity || 0), columnPositions[1], position + 8, { width: 60, align: 'right' })
      .text(formatCurrency(item.unit_price), columnPositions[2], position + 8, { width: 60, align: 'right' })
      .text(formatCurrency(item.subtotal), columnPositions[3], position + 8, { width: 80, align: 'right' });

    doc.moveTo(50, position + rowHeight).lineTo(50 + tableWidth, position + rowHeight)
      .strokeColor(BRAND.border)
      .lineWidth(0.5)
      .stroke();

    position += rowHeight;
  });

  doc.moveDown(2);
};

const drawTotals = (doc, invoice) => {
  const amountPaid = Number(invoice.amount_paid) || 0;
  const amountDue = Number(invoice.amount_due) || 0;
  const balance = Math.max(amountDue - amountPaid, 0);

  const summaryWidth = 230;
  const summaryX = doc.page.width - summaryWidth - 50;
  const summaryY = doc.y + 10;

  doc.save();
  doc.roundedRect(summaryX, summaryY, summaryWidth, 120, 10)
    .fill(BRAND.subtleBg)
    .strokeColor(BRAND.border)
    .lineWidth(1)
    .stroke();

  const rows = [
    { label: 'Subtotal', value: formatCurrency(amountDue) },
    { label: 'Paid to Date', value: formatCurrency(amountPaid) },
    { label: 'Outstanding Balance', value: formatCurrency(balance), highlight: true },
  ];

  let rowY = summaryY + 18;
  rows.forEach((row) => {
    doc
      .fontSize(10)
      .fillColor(row.highlight ? BRAND.accent : BRAND.muted)
      .text(row.label.toUpperCase(), summaryX + 18, rowY);
    doc
      .fontSize(row.highlight ? 16 : 12)
      .fillColor(BRAND.primary)
      .text(row.value, summaryX + 18, rowY + 14);
    rowY += row.highlight ? 34 : 28;
  });

  doc.restore();
  doc.moveDown(2);
};

const writeInvoicePdf = (invoice, items, filePath) => (
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);

    drawInvoiceHeader(doc, invoice);
    drawInvoiceMeta(doc, invoice);
    drawVendorAndBilling(doc, invoice);
    drawLineItemsTable(doc, items);
    drawTotals(doc, invoice);

    if (invoice.notes) {
      doc
        .moveDown()
        .fontSize(11)
        .fillColor(BRAND.primary)
        .text('Notes', { underline: true })
        .moveDown(0.2)
        .fontSize(10)
        .fillColor(BRAND.muted)
        .text(invoice.notes, { width: doc.page.width - 100 });
    }

    doc
      .moveDown(1.5)
      .fontSize(10)
      .fillColor(BRAND.muted)
      .text('Thank you for doing business with Chain Sense. For billing questions contact billing@chainsense.io.');

    doc.end();

    stream.on('finish', resolve);
    stream.on('error', reject);
  })
);

const ensureInvoicePdf = async (invoiceId, options = {}) => {
  const { data, force = false } = options;
  ensureDirectory();

  const invoiceData = data || await loadInvoiceData(invoiceId);

  if (!invoiceData || !invoiceData.invoice) {
    throw new Error('Invoice not found for PDF generation');
  }

  const fileName = `invoice-${invoiceData.invoice.invoice_number || invoiceId}.pdf`;
  const filePath = path.join(invoicesDir, fileName);

  const fileExists = fs.existsSync(filePath);
  if (!fileExists || force) {
    await writeInvoicePdf(invoiceData.invoice, invoiceData.items, filePath);
  }

  return { filePath, ...invoiceData };
};

module.exports = {
  ensureInvoicePdf,
  loadInvoiceData,
};
