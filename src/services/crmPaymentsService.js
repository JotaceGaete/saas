/**
 * Servicio CRM: pagos asociados a facturas (crm_payments).
 * Operaciones mínimas: listar por factura y registrar un pago.
 */
import { supabase } from '../lib/supabase';
import {
  getInvoicePaymentSummary,
  getOpenCashSession,
  isCashRelevantPaymentMethod,
  normalizePaymentMethod,
  reconcileCrmInvoicePaymentStatus,
} from './crmService';

/**
 * Lista los pagos de una factura.
 * @param {string} invoiceId - UUID de la factura
 */
export async function listPaymentsByInvoice(invoiceId) {
  const { data, error } = await supabase
    .from('crm_payments')
    .select('*')
    .eq('invoice_id', invoiceId)
    .eq('payment_status', 'received')
    .is('voided_at', null)
    .order('payment_date', { ascending: false });
  if (error) return { data: [], error };
  return {
    data: (data || []).filter(payment => isCashRelevantPaymentMethod(payment.payment_method)),
    error: null,
  };
}

/**
 * Registra un nuevo pago para una factura.
 * @param {Object} payment
 * @param {string} payment.invoice_id
 * @param {number} payment.amount
 * @param {string} payment.payment_date  - YYYY-MM-DD
 * @param {string} [payment.method]      - ej: "transferencia", "efectivo", "tarjeta"
 * @param {string} [payment.notes]
 */
export async function createPayment(payment) {
  const normalizedMethod = normalizePaymentMethod(payment.payment_method || payment.method);
  const { data: { user } } = await supabase.auth.getUser();
  let cashSessionId = payment.cash_session_id || null;

  if (payment.invoice_id) {
    const summaryRes = await getInvoicePaymentSummary(payment.invoice_id);
    if (summaryRes.error) return { data: null, error: summaryRes.error };
    if (Number(payment.amount || 0) > summaryRes.data.pending) {
      return {
        data: null,
        error: { message: `El pago supera el saldo pendiente (${summaryRes.data.pending.toLocaleString('es-CL')}).` },
      };
    }
  }

  if (!cashSessionId && isCashRelevantPaymentMethod(normalizedMethod) && payment.business_id) {
    const { data: openSession } = await getOpenCashSession(payment.business_id);
    cashSessionId = openSession?.id || null;
  }

  const { data, error } = await supabase
    .from('crm_payments')
    .insert([{
      ...payment,
      payment_method: normalizedMethod,
      payment_status: payment.payment_status || 'received',
      cash_session_id: cashSessionId,
      created_by: payment.created_by || user?.id || null,
    }])
    .select()
    .single();
  if (error) return { data: null, error };
  if (payment.invoice_id) {
    const reconcileRes = await reconcileCrmInvoicePaymentStatus(payment.invoice_id);
    if (reconcileRes.error) return { data: null, error: reconcileRes.error };
  }
  return { data, error: null };
}

/**
 * @deprecated No elimina registros. Anula el pago para conservar auditoria.
 * @param {string} paymentId - UUID del pago
 */
export async function deletePayment(paymentId, { reason = 'Anulacion de pago' } = {}) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('crm_payments')
    .update({
      voided_at: new Date().toISOString(),
      voided_by: user?.id || null,
      void_reason: reason,
    })
    .eq('id', paymentId);
  return { error: error || null };
}
