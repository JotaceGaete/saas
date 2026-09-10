/**
 * orderPaymentService — MP-PAYMENT-DETAIL-2.
 * Lectura de wa_order_payments (fuente normalizada de "cómo se pagó
 * este pedido", MP-PAYMENT-DETAIL-1) y registro de pagos manuales vía
 * wa_register_manual_order_payment. Respeta RLS existente: SELECT
 * directo (la policy owner-only ya filtra por negocio del dueño
 * autenticado, sin necesidad de una RPC de lectura). Nunca lee
 * wa_merchant_payment_events desde el frontend -- esa tabla no otorga
 * ningún acceso al browser a propósito (RPC-only/service_role-only).
 */
import { supabase } from '../lib/supabase';

const ERROR_MESSAGES = {
  NOT_AUTHENTICATED: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  MISSING_REQUIRED_PARAMETER: 'Faltan datos para registrar el pago.',
  INVALID_PAYMENT_METHOD: 'Selecciona un método de pago válido.',
  INVALID_AMOUNT: 'El monto no es válido.',
  ORDER_NOT_FOUND_OR_NOT_OWNED: 'No pudimos encontrar este pedido.',
  ORDER_ALREADY_PAID: 'Este pedido ya está marcado como pagado.',
  AMOUNT_MISMATCH: 'El monto no coincide con el total del pedido.',
  CURRENCY_MISMATCH: 'La moneda no coincide con la del pedido.',
};
// Fallback genérica -- nunca se muestra el texto crudo de Postgres/Supabase.
const DEFAULT_ERROR_MESSAGE = 'No pudimos registrar el pago. Intenta nuevamente.';

/**
 * Mensaje amigable para el `error.message` de una RPC (RAISE EXCEPTION
 * devuelve el código tal cual en `.message`, sin envoltorio -- distinto
 * del patrón `error.reason` de las Edge Functions HTTP).
 * @param {string|undefined} reason
 * @returns {string}
 */
export function getManualPaymentErrorMessage(reason) {
  return ERROR_MESSAGES[reason] || DEFAULT_ERROR_MESSAGE;
}

/** Mapea fila `wa_order_payments` al shape usado en la app. Exportado para tests/reutilización. */
export function mapOrderPaymentFromDb(row) {
  if (!row) return null;
  return {
    id: row.id,
    businessId: row.business_id,
    orderId: row.order_id,
    provider: row.provider,
    method: row.method,
    providerPaymentId: row.provider_payment_id ?? null,
    status: row.status,
    grossAmount: row.gross_amount != null ? parseFloat(row.gross_amount) : null,
    currency: row.currency,
    walinkaFee: row.walinka_fee != null ? parseFloat(row.walinka_fee) : 0,
    mpFee: row.mp_fee != null ? parseFloat(row.mp_fee) : null,
    netAmount: row.net_amount != null ? parseFloat(row.net_amount) : null,
    payerName: row.payer_name ?? null,
    payerEmail: row.payer_email ?? null,
    paidAt: row.paid_at,
    registeredBy: row.registered_by ?? null,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Fila de wa_order_payments más reciente para un pedido -- fuente única
 * de verdad visible de "cómo se pagó". SELECT directo: la policy
 * `wa_order_payments_owner_select` ya filtra por negocio del dueño
 * autenticado (RLS), sin necesidad de una RPC de lectura dedicada.
 * `data: null` cubre tanto "pedido pendiente" como "pagado histórico
 * sin fila de detalle" -- la UI decide cómo distinguir ambos casos
 * usando el payment_status del pedido, nunca inventa un método acá.
 * @param {string} orderId
 * @returns {Promise<{data: object|null, error: Error|null}>}
 */
export async function getOrderPayment(orderId) {
  if (!orderId) return { data: null, error: null };
  const { data, error } = await supabase
    .from('wa_order_payments')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { data: null, error };
  return { data: mapOrderPaymentFromDb(data), error: null };
}

/**
 * Registra un pago manual (cash|bank_transfer|other) vía la RPC
 * wa_register_manual_order_payment -- nunca un INSERT directo (la tabla
 * no otorga INSERT a `authenticated`, ver migración). monto/moneda se
 * envían tal cual se recibieron (deben ser EXACTAMENTE el total del
 * pedido); la RPC es quien valida esto server-side -- este servicio
 * nunca recalcula ni relaja esa validación.
 * @param {{orderId: string, method: 'cash'|'bank_transfer'|'other', amount: number, currency: string, notes?: string}} params
 * @returns {Promise<{data: string|null, error: Error|null}>} data = id del pago creado (UUID)
 */
export async function registerManualOrderPayment({ orderId, method, amount, currency, notes }) {
  const { data, error } = await supabase.rpc('wa_register_manual_order_payment', {
    p_order_id: orderId,
    p_method: method,
    p_amount: amount,
    p_currency: currency,
    p_notes: notes?.trim() || null,
  });
  if (error) return { data: null, error };
  return { data, error: null };
}
