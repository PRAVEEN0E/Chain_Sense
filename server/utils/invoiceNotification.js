const { sendEmail, isEmailConfigured } = require('./emailService');

const formatCurrency = (value = 0) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(value || 0));

const buildInvoiceHtml = ({ vendorName, invoiceNumber, amountDue, dueDate }) => {
  const greeting = vendorName ? `Dear ${vendorName},` : 'Hello,';
  const dueDateLine = dueDate ? `<p><strong>Due Date:</strong> ${new Date(dueDate).toLocaleDateString()}</p>` : '';

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <p>${greeting}</p>
      <p>This is a friendly reminder that payment is pending for your invoice <strong>${invoiceNumber}</strong>.</p>
      <p><strong>Amount Due:</strong> ${formatCurrency(amountDue)}</p>
      ${dueDateLine}
      <p>Please review the attached invoice and let us know if you have any questions.</p>
      <p>Thank you,<br/>Chain Sense Billing</p>
    </div>
  `;
};

const sendInvoicePendingEmail = async ({ vendorEmail, vendorName, invoiceNumber, amountDue, dueDate, pdfPath }) => {
  if (!isEmailConfigured || !vendorEmail) {
    return { skipped: true };
  }

  const attachments = pdfPath
    ? [{ filename: `invoice-${invoiceNumber}.pdf`, path: pdfPath }]
    : undefined;

  try {
    await sendEmail({
      to: vendorEmail,
      subject: `Payment Pending - Invoice ${invoiceNumber}`,
      html: buildInvoiceHtml({ vendorName, invoiceNumber, amountDue, dueDate }),
      attachments,
    });
    return { sent: true };
  } catch (err) {
    console.error('Invoice email send error:', err.message);
    return { error: err.message };
  }
};

module.exports = {
  sendInvoicePendingEmail,
};
