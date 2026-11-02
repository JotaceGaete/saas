// Emisión de boleta desde el TPV: llama a la función fiscal-emit (acción emit).
// Sin reintentos automáticos: un resultado incierto NO se repite; lo decide la recuperación.
import { supabase } from '../lib/supabase';

export const FISCAL_EMIT_MESSAGES = Object.freeze({
  PROVIDER_NOT_READY: 'DTECore todavía no está habilitado para emitir en este entorno.',
  CREDENTIALS_MISSING: 'Conecta la cuenta DTECore de tu negocio antes de emitir.',
  CREDENTIAL_INVALID: 'La credencial DTECore de tu negocio no es válida. Reemplázala en Configuración.',
  FISCAL_PROVIDER_MISMATCH: 'La cuenta DTECore no coincide con la configuración del emisor.',
  ALREADY_IN_PROGRESS: 'Esta venta ya tiene una emisión en curso.',
  NOT_EMITTABLE_IN_STATE: 'Esta venta ya fue emitida o está en proceso.',
  UNKNOWN_REQUIRES_RECONCILIATION: 'Hay un resultado pendiente de confirmar. No se reintenta automáticamente.',
  PERSIST_PENDING_RECOVERY: 'La emisión quedó pendiente de confirmación. No la repitas.',
  FISCAL_ROLE_REQUIRED: 'Tu rol no permite emitir boletas.',
  FISCAL_ISSUER_NOT_ENABLED: 'La cuenta fiscal del negocio aún no está verificada.',
  SALE_NOT_FOUND: 'No encontramos la venta.',
  SALE_NOT_SAME_DAY: 'Solo se emiten boletas de ventas del día. Esta venta es de otra fecha.',
  FISCAL_SALE_NOT_SAME_DAY: 'Solo se emiten boletas de ventas del día. Esta venta es de otra fecha.',
  SALE_NOT_ELIGIBLE: 'La venta no está pagada por completo.',
  FISCAL_EMISSION_DISABLED: 'La emisión de boletas está apagada para todos los comercios.',
  FISCAL_TAX_LINES_NOT_VERIFIED: 'Falta verificar el IVA de uno o más productos de la venta.',
  DISCOUNT_NOT_SUPPORTED: 'Las ventas con descuento todavía no se emiten como boleta.',
  MIXED_PAYMENTS: 'Las ventas con pago mixto todavía no se emiten como boleta.',
  NO_CONFIRMED_PAYMENT: 'La venta no tiene un pago confirmado.',
  POINT_NOT_CONFIRMED: 'El cobro con Point no está confirmado por Mercado Pago.',
  PAYMENT_AMOUNT_MISMATCH: 'El pago registrado no coincide con el total de la venta.',
  DESCRIPTION_TOO_LONG: 'Un producto tiene un nombre de más de 80 caracteres.',
  FISCAL_RETROACTIVE_BLOCKED: 'Esta venta está protegida: no se emite boleta retroactiva.',
  FISCAL_CROSS_PIPELINE_CONFLICT: 'Esta venta ya tiene una operación fiscal antigua. Se revisa manualmente.',
  ALREADY_ISSUED: 'Esta venta ya tiene boleta.',
  PROVIDER_REJECTED: 'DTE Core rechazó la boleta. No se asignó folio. Revisa el detalle antes de volver a intentarlo.',
  RESPONSE_LOST: 'No recibimos respuesta. No repitas la emisión: revisa el estado de la venta.',
});

export function describeFiscalEmitError(code) {
  return FISCAL_EMIT_MESSAGES[code] ?? 'No pudimos emitir la boleta. Inténtalo más tarde.';
}

// Códigos que bloquean el botón: el resultado pudo haber emitido una boleta y nunca se repite.
export const LOCKING_CODES = Object.freeze(new Set([
  'UNKNOWN_REQUIRES_RECONCILIATION', 'PERSIST_PENDING_RECOVERY', 'ALREADY_IN_PROGRESS', 'RESPONSE_LOST', 'INTERNAL',
]));

// Estado fiscal de la venta (solo lectura; nunca emite). Devuelve { ok, data } | { ok:false, code }.
export async function getFiscalSaleStatus(saleId) {
  try {
    const { data, error } = await supabase.functions.invoke('fiscal-emit', { body: { action: 'status', saleId } });
    if (!error && data && typeof data.state === 'string') return { ok: true, data };
    let payload = null;
    try {
      if (error?.context && typeof error.context.json === 'function') payload = await error.context.json();
    } catch { /* sin detalle */ }
    return { ok: false, code: payload?.error ?? 'STATUS_UNAVAILABLE' };
  } catch {
    return { ok: false, code: 'STATUS_UNAVAILABLE' };
  }
}

export const SII_STATUS_LABELS = Object.freeze({
  unverified: 'Emitida · estado SII sin verificar',
  received: 'Recibida por el SII · sin resultado aún',
  accepted: 'Aceptada por el SII',
  accepted_with_objections: 'Aceptada con reparos por el SII',
  rejected: 'Rechazada por el SII',
});

// Devuelve { ok, status, folio?, code? }. Nunca lanza. Código = motivo estable; resultado incierto nunca se reintenta.
export async function emitFiscalSale(saleId) {
  let data;
  let error;
  try {
    ({ data, error } = await supabase.functions.invoke('fiscal-emit', { body: { action: 'emit', saleId } }));
  } catch {
    // La solicitud pudo llegar al servidor: resultado incierto, nunca se repite.
    return { ok: false, status: 'error', code: 'RESPONSE_LOST' };
  }
  if (!error) {
    const status = data?.status ?? 'unknown';
    if (status === 'issued') return { ok: true, status, folio: data?.folio ?? null };
    return { ok: false, status, code: status === 'unknown' ? 'UNKNOWN_REQUIRES_RECONCILIATION' : (status === 'failed' ? 'PROVIDER_REJECTED' : 'SERVER_ERROR') };
  }
  let payload = null;
  try {
    if (error?.context && typeof error.context.json === 'function') payload = await error.context.json();
  } catch { /* sin detalle: código genérico */ }
  // Sin respuesta del handler (red, función caída): no sabemos si emitió.
  if (!payload?.error) return { ok: false, status: 'error', code: 'RESPONSE_LOST' };
  return { ok: false, status: 'error', code: payload.error };
}
