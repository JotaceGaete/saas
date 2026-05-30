import { supabase } from '../lib/supabase';

export const CRM_PAYMENT_METHODS = [
  { value: 'cash', label: 'Contado' },
  { value: 'bank_transfer', label: 'Transferencia' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'check', label: 'Cheque' },
  { value: 'other', label: 'Otro' },
];

export const FINANCIAL_BADGE_STYLES = {
  pending: 'bg-yellow-100 text-yellow-700',
  partial: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
};

export function getPaymentMethodLabel(value) {
  return CRM_PAYMENT_METHODS.find((m) => m.value === value)?.label || value || 'Otro';
}

export function getPaymentStatus(payment) {
  return payment?.payment_status || payment?.status || 'received';
}

export function getPaymentDate(payment) {
  return payment?.payment_date || payment?.created_at?.slice?.(0, 10) || null;
}

export function sumReceivedPayments(payments = []) {
  return payments
    .filter((payment) => getPaymentStatus(payment) === 'received')
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
}

export function getInvoiceFinancialState(total, payments = []) {
  const invoiceTotal = Number(total || 0);
  const paidTotal = sumReceivedPayments(payments);
  const pendingBalance = Math.max(0, invoiceTotal - paidTotal);

  if (paidTotal <= 0) {
    return {
      key: 'pending',
      label: 'Pendiente',
      invoiceTotal,
      paidTotal,
      pendingBalance: invoiceTotal,
    };
  }

  if (pendingBalance > 0) {
    return {
      key: 'partial',
      label: 'Pago parcial',
      invoiceTotal,
      paidTotal,
      pendingBalance,
    };
  }

  return {
    key: 'paid',
    label: 'Pagada',
    invoiceTotal,
    paidTotal,
    pendingBalance: 0,
  };
}

export async function listPaymentsByInvoice(invoiceId) {
  const { data, error } = await supabase
    .from('crm_payments')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) return { data: [], error };
  return { data: data || [], error: null };
}

export async function listPaymentsByBusiness(businessId, opts = {}) {
  let query = supabase
    .from('crm_payments')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (opts.limit) {
    query = query.limit(Math.min(Number(opts.limit) || 50, 200));
  }

  const { data, error } = await query;
  if (error) return { data: [], error };

  const rows = (data || []).filter((payment) => {
    if (opts.status && getPaymentStatus(payment) !== opts.status) return false;
    const paymentDate = getPaymentDate(payment);
    if (opts.dateFrom && (!paymentDate || paymentDate < opts.dateFrom)) return false;
    if (opts.dateTo && (!paymentDate || paymentDate > opts.dateTo)) return false;
    return true;
  });

  return { data: rows, error: null };
}

export async function createPayment(payment) {
  const payload = {
    ...payment,
    amount: Number(payment.amount || 0),
    payment_method: payment.payment_method || 'bank_transfer',
    payment_status: payment.payment_status || 'received',
  };

  const { data, error } = await supabase
    .from('crm_payments')
    .insert([payload])
    .select()
    .single();

  if (error && /payment_status|payment_date|reference/i.test(error.message || '')) {
    const legacyPayload = {
      business_id: payload.business_id,
      customer_id: payload.customer_id || null,
      invoice_id: payload.invoice_id || null,
      amount: payload.amount,
      payment_method: payload.payment_method,
      reference_number: payload.reference || null,
      notes: payload.notes || null,
    };

    const fallback = await supabase
      .from('crm_payments')
      .insert([legacyPayload])
      .select()
      .single();

    if (fallback.error) return { data: null, error: fallback.error };
    return { data: fallback.data, error: null };
  }

  if (error) return { data: null, error };
  return { data, error: null };
}

export async function deletePayment(paymentId) {
  const { error } = await supabase
    .from('crm_payments')
    .delete()
    .eq('id', paymentId);

  return { error: error || null };
}
