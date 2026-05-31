/**
 * Servicio CRM: pagos asociados a facturas (crm_payments).
 * Operaciones mínimas: listar por factura y registrar un pago.
 */
import { supabase } from '../lib/supabase';

/**
 * Lista los pagos de una factura.
 * @param {string} invoiceId - UUID de la factura
 */
export async function listPaymentsByInvoice(invoiceId) {
  const { data, error } = await supabase
    .from('crm_payments')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('payment_date', { ascending: false });
  if (error) return { data: [], error };
  return { data: data || [], error: null };
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
  const { data, error } = await supabase
    .from('crm_payments')
    .insert([payment])
    .select()
    .single();
  if (error) return { data: null, error };
  return { data, error: null };
}

/**
 * Elimina un pago (para correcciones).
 * @param {string} paymentId - UUID del pago
 */
export async function deletePayment(paymentId) {
  const { error } = await supabase
    .from('crm_payments')
    .delete()
    .eq('id', paymentId);
  return { error: error || null };
}
