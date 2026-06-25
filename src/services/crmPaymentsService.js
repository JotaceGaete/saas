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
 * Lista TODOS los pagos reales de una factura, incluyendo anulados.
 * Usar para historial/auditoría. No filtra por voided_at.
 * Excluye método 'credit' (igual que listPaymentsByInvoice) para que
 * el totalPagado en UI no cuente crédito como cobro real en caja.
 */
export async function listAllPaymentsByInvoice(invoiceId) {
  const { data, error } = await supabase
    .from('crm_payments')
    .select('*')
    .eq('invoice_id', invoiceId)
    .eq('payment_status', 'received')
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false });
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

  // Todos los pagos received con método real (no crédito) requieren caja abierta.
  // Si no hay sesión, bloquear — nunca insertar con cash_session_id nulo.
  if (isCashRelevantPaymentMethod(normalizedMethod) && (payment.payment_status || 'received') === 'received') {
    if (!payment.business_id) {
      return { data: null, error: { code: 'CASH_SESSION_REQUIRED', message: 'CASH_SESSION_REQUIRED' } };
    }
    if (!cashSessionId) {
      const { data: openSession } = await getOpenCashSession(payment.business_id);
      if (!openSession) {
        return { data: null, error: { code: 'CASH_SESSION_REQUIRED', message: 'CASH_SESSION_REQUIRED' } };
      }
      cashSessionId = openSession.id;
    }
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
