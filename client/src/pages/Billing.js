import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrencyINR } from '../utils/currency';

const statusColors = {
  paid: 'bg-green-100 text-green-800',
  partial: 'bg-yellow-100 text-yellow-800',
  unpaid: 'bg-red-100 text-red-800',
  overdue: 'bg-red-100 text-red-800',
};

const Billing = () => {
  const { isAdmin, isManager, isVendor } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [activeInvoice, setActiveInvoice] = useState(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [fetchingDetails, setFetchingDetails] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'bank_transfer', reference: '', notes: '' });
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);

  const canRecordPayments = isAdmin || isManager;

  useEffect(() => {
    fetchInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, overdueOnly]);

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (overdueOnly) params.append('overdue', 'true');
      const response = await axios.get(`/api/billing/invoices${params.toString() ? `?${params.toString()}` : ''}`);
      setInvoices(response.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  const fetchInvoiceDetails = async (invoiceId) => {
    setFetchingDetails(true);
    try {
      const response = await axios.get(`/api/billing/invoices/${invoiceId}`);
      setActiveInvoice(response.data);
      setShowInvoiceModal(true);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load invoice');
    } finally {
      setFetchingDetails(false);
    }
  };

  const downloadInvoicePdf = async (invoiceId) => {
    if (!invoiceId) return;

    try {
      const response = await axios.get(`/api/billing/invoices/${invoiceId}/pdf`, {
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const tempLink = document.createElement('a');

      const disposition = response.headers['content-disposition'];
      const filenameMatch = disposition && disposition.match(/filename="?([^";]+)"?/);
      const filename = filenameMatch ? filenameMatch[1] : `invoice-${invoiceId}.pdf`;

      tempLink.href = url;
      tempLink.setAttribute('download', filename);
      document.body.appendChild(tempLink);
      tempLink.click();
      tempLink.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Invoice PDF downloaded');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to download invoice PDF');
    }
  };

  const closeModal = () => {
    setShowInvoiceModal(false);
    setActiveInvoice(null);
    setPaymentForm({ amount: '', method: 'bank_transfer', reference: '', notes: '' });
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    if (!activeInvoice) return;

    if (!paymentForm.amount) {
      toast.error('Enter payment amount');
      return;
    }

    setPaymentSubmitting(true);
    try {
      const response = await axios.post(`/api/billing/invoices/${activeInvoice.id}/payments`, {
        amount: paymentForm.amount,
        method: paymentForm.method,
        reference: paymentForm.reference || undefined,
        notes: paymentForm.notes || undefined,
      });

      const { invoice, payments, message } = response.data;
      toast.success(message || 'Payment recorded');
      setActiveInvoice((prev) => ({
        ...(invoice || prev),
        items: prev?.items || [],
        payments: payments || prev?.payments || [],
      }));
      setPaymentForm({ amount: '', method: 'bank_transfer', reference: '', notes: '' });
      fetchInvoices();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to record payment');
    } finally {
      setPaymentSubmitting(false);
    }
  };

  const cards = useMemo(() => {
    const total = invoices.reduce((sum, inv) => sum + (inv.amount_due || 0), 0);
    const paid = invoices.reduce((sum, inv) => sum + (inv.status === 'paid' ? inv.amount_due : inv.amount_paid || 0), 0);
    const outstanding = invoices.reduce((sum, inv) => sum + (inv.amount_remaining || Math.max((inv.amount_due || 0) - (inv.amount_paid || 0), 0)), 0);
    const overdue = invoices.filter((inv) => inv.is_overdue && inv.status !== 'paid').length;

    return [
      { label: 'Total Billed', value: formatCurrencyINR(total) },
      { label: 'Collected', value: formatCurrencyINR(paid) },
      { label: 'Outstanding', value: formatCurrencyINR(outstanding) },
      { label: 'Overdue Invoices', value: overdue },
    ];
  }, [invoices]);

  const statusLabel = (invoice) => {
    if (invoice.is_overdue && invoice.status !== 'paid') {
      return { text: 'overdue', color: statusColors.overdue };
    }
    return { text: invoice.status, color: statusColors[invoice.status] || 'bg-gray-100 text-gray-800' };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Billing & Payments</h1>
          <p className="mt-1 text-sm text-gray-500">
            {isVendor ? 'View your invoices and payment history' : 'Track invoices, outstanding balances, and payments'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow p-4 flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="">All</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
          </select>
        </div>
        <label className="inline-flex items-center text-sm text-gray-700">
          <input
            type="checkbox"
            className="form-checkbox h-4 w-4 text-primary-600"
            checked={overdueOnly}
            onChange={(e) => setOverdueOnly(e.target.checked)}
          />
          <span className="ml-2">Only overdue</span>
        </label>
      </div>

      <div className="space-y-4">
        {invoices.length === 0 && (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
            No invoices found.
          </div>
        )}

        {invoices.map((invoice) => {
          const status = statusLabel(invoice);
          return (
            <div key={invoice.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex flex-col md:flex-row md:justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{invoice.invoice_number}</h3>
                  <p className="text-sm text-gray-500">Vendor: {invoice.vendor_name || 'N/A'}</p>
                  {invoice.due_date && (
                    <p className="text-sm text-gray-500">Due: {new Date(invoice.due_date).toLocaleDateString()}</p>
                  )}
                </div>
                <div className="flex flex-col items-start md:items-end gap-2">
                  <span className="text-xl font-bold text-gray-900">{formatCurrencyINR(invoice.amount_due)}</span>
                  <span className={`px-3 py-1 text-sm font-semibold rounded-full capitalize ${status.color}`}>
                    {status.text}
                  </span>
                  <button
                    onClick={() => fetchInvoiceDetails(invoice.id)}
                    className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                  >
                    View Details
                  </button>
                  <button
                    onClick={() => downloadInvoicePdf(invoice.id)}
                    className="px-4 py-2 text-sm border border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50"
                  >
                    Download PDF
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showInvoiceModal && activeInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{activeInvoice.invoice_number}</h2>
                  <p className="text-sm text-gray-500">Vendor: {activeInvoice.vendor_name}</p>
                  <p className="text-sm text-gray-500">Status: {activeInvoice.status}</p>
                </div>
                <button onClick={closeModal} className="text-gray-500 hover:text-gray-800">
                  ✕
                </button>
              </div>
              <div className="flex justify-end mb-4">
                <button
                  onClick={() => downloadInvoicePdf(activeInvoice.id)}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  Download PDF
                </button>
              </div>

              {fetchingDetails ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-sm text-gray-500">Amount Due</p>
                      <p className="text-2xl font-semibold text-gray-900">{formatCurrencyINR(activeInvoice.amount_due)}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-sm text-gray-500">Amount Paid</p>
                      <p className="text-2xl font-semibold text-gray-900">{formatCurrencyINR(activeInvoice.amount_paid)}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-sm text-gray-500">Outstanding</p>
                      <p className="text-2xl font-semibold text-gray-900">
                        {formatCurrencyINR(Math.max((activeInvoice.amount_due || 0) - (activeInvoice.amount_paid || 0), 0))}
                      </p>
                    </div>
                  </div>

                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Invoice Items</h3>
                    {(!activeInvoice.items || activeInvoice.items.length === 0) ? (
                      <p className="text-sm text-gray-500">No items recorded.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left font-medium text-gray-500">Description</th>
                              <th className="px-4 py-2 text-left font-medium text-gray-500">Qty</th>
                              <th className="px-4 py-2 text-left font-medium text-gray-500">Unit Price</th>
                              <th className="px-4 py-2 text-left font-medium text-gray-500">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {activeInvoice.items.map((item) => (
                              <tr key={`${item.id}-${item.description}`}>
                                <td className="px-4 py-2 text-gray-900">{item.description}</td>
                                <td className="px-4 py-2 text-gray-900">{item.quantity}</td>
                                <td className="px-4 py-2 text-gray-900">{formatCurrencyINR(item.unit_price)}</td>
                                <td className="px-4 py-2 text-gray-900">{formatCurrencyINR(item.subtotal)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Payments</h3>
                      {(!activeInvoice.payments || activeInvoice.payments.length === 0) ? (
                        <p className="text-sm text-gray-500">No payments recorded.</p>
                      ) : (
                        <div className="space-y-2">
                          {activeInvoice.payments.map((payment) => (
                            <div key={payment.id} className="p-3 border rounded-lg">
                              <p className="text-sm font-semibold text-gray-900">{formatCurrencyINR(payment.amount)}</p>
                              <p className="text-xs text-gray-500">
                                {payment.method || 'N/A'} · {new Date(payment.payment_date).toLocaleDateString()} by {payment.recorded_by_name || 'System'}
                              </p>
                              {payment.reference && (
                                <p className="text-xs text-gray-500">Ref: {payment.reference}</p>
                              )}
                              {payment.notes && (
                                <p className="text-xs text-gray-500">Notes: {payment.notes}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {canRecordPayments && activeInvoice.status !== 'paid' && (
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Record Payment</h3>
                        <form className="space-y-3" onSubmit={handlePaymentSubmit}>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={paymentForm.amount}
                              onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Method</label>
                            <select
                              value={paymentForm.method}
                              onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            >
                              <option value="bank_transfer">Bank Transfer</option>
                              <option value="cash">Cash</option>
                              <option value="online">Online</option>
                              <option value="cheque">Cheque</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
                            <input
                              type="text"
                              value={paymentForm.reference}
                              onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              placeholder="Transaction reference"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                            <textarea
                              value={paymentForm.notes}
                              onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              rows="3"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={paymentSubmitting}
                            className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-60"
                          >
                            {paymentSubmitting ? 'Recording...' : 'Record Payment'}
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Billing;
