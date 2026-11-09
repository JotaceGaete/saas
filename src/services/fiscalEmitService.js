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
  FISCAL_BUSINESS_NOT_ALLOWED: 'La boleta electrónica no está habilitada para este negocio.',
  FISCAL_RUT_NOT_CONFIRMED: 'Antes de la primera boleta, el propietario debe confirmar el RUT en Configuración → Facturación electrónica.',
  FISCAL_DOCUMENT_ISSUER_MISMATCH: 'El documento recibido no corresponde al RUT del comercio. Se revisa manualmente.',
  FISCAL_FOLIO_DUPLICATE: 'El folio recibido ya existe para este RUT. Se revisa manualmente.',
  NOT_UNKNOWN: 'Esta venta no tiene un resultado pendiente de confirmar.',
  NOT_ISSUED: 'Esta venta no tiene una boleta emitida.',
});

export function describeFiscalEmitError(code) {
  return FISCAL_EMIT_MESSAGES[code] ?? 'No pudimos emitir la boleta. Inténtalo más tarde.';
}

// Plazos máximos de espera del navegador. Si fiscal-emit no responde, el TPV no queda
// «emitiendo» para siempre. El de emisión supera el peor caso del servidor (proveedor 20 s +
// descarga de XML y PDF 12 s c/u + base): cortarlo antes no deshace nada en el servidor, y el
// resultado queda incierto (RESPONSE_LOST), nunca «no emitida».
export const FISCAL_STATUS_TIMEOUT_MS = 15_000;
export const FISCAL_EMIT_TIMEOUT_MS = 60_000;
export const FISCAL_QUERY_TIMEOUT_MS = 20_000;

// Códigos que bloquean el botón: el resultado pudo haber emitido una boleta y nunca se repite.
export const LOCKING_CODES = Object.freeze(new Set([
  'UNKNOWN_REQUIRES_RECONCILIATION', 'PERSIST_PENDING_RECOVERY', 'ALREADY_IN_PROGRESS', 'RESPONSE_LOST', 'INTERNAL',
]));

// Estado fiscal de la venta (solo lectura; nunca emite). Devuelve { ok, data } | { ok:false, code }.
export async function getFiscalSaleStatus(saleId) {
  try {
    const { data, error } = await supabase.functions.invoke('fiscal-emit', { body: { action: 'status', saleId }, timeout: FISCAL_STATUS_TIMEOUT_MS });
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

// Estado único para mostrar, a partir de los DOS ejes: el del proveedor (status del ledger) y el
// del SII (sii_status). "Emitida" solo significa folio + XML firmado; "Aceptada"/"Rechazada" son del SII.
export function describeFiscalState({ state, siiStatus } = {}) {
  switch (state) {
    case 'none':
    case 'pending': return { key: 'pendiente', label: 'Pendiente de emisión' };
    case 'sending': return { key: 'enviando', label: 'Enviando a DTE Core' };
    case 'unknown': return { key: 'desconocido', label: 'Resultado desconocido · requiere conciliación' };
    case 'failed': return { key: 'fallida', label: 'Rechazada por DTE Core (sin folio)' };
    case 'cancelled': return { key: 'anulada', label: 'Anulada con nota de crédito' };
    case 'issued':
      if (siiStatus === 'accepted' || siiStatus === 'accepted_with_objections') return { key: 'aceptada', label: SII_STATUS_LABELS[siiStatus] };
      if (siiStatus === 'rejected') return { key: 'rechazada', label: SII_STATUS_LABELS.rejected };
      return { key: 'emitida', label: SII_STATUS_LABELS[siiStatus] ?? SII_STATUS_LABELS.unverified };
    default: return { key: 'desconocido', label: 'Estado no disponible' };
  }
}

// Devuelve { ok, status, folio?, code? }. Nunca lanza. Código = motivo estable; resultado incierto nunca se reintenta.
export async function emitFiscalSale(saleId) {
  let data;
  let error;
  try {
    ({ data, error } = await supabase.functions.invoke('fiscal-emit', { body: { action: 'emit', saleId }, timeout: FISCAL_EMIT_TIMEOUT_MS }));
  } catch {
    // La solicitud pudo llegar al servidor: resultado incierto, nunca se repite.
    return { ok: false, status: 'error', code: 'RESPONSE_LOST' };
  }
  if (!error) {
    const status = data?.status ?? 'unknown';
    if (status === 'issued') return { ok: true, status, folio: data?.folio ?? null };
    if (status === 'failed') return { ok: false, status, code: 'PROVIDER_REJECTED' };
    // Respuesta del servidor sin un resultado reconocible (unknown, sending u otro): la venta pudo
    // quedar reclamada o emitida. Es incierta y nunca se trata como «no emitida».
    return { ok: false, status: 'unknown', code: 'UNKNOWN_REQUIRES_RECONCILIATION' };
  }
  let payload = null;
  try {
    if (error?.context && typeof error.context.json === 'function') payload = await error.context.json();
  } catch { /* sin detalle: código genérico */ }
  // Sin respuesta del handler (red, función caída): no sabemos si emitió.
  if (!payload?.error) return { ok: false, status: 'error', code: 'RESPONSE_LOST' };
  return { ok: false, status: 'error', code: payload.error };
}

// Invoca una acción de CONSULTA de fiscal-emit. Nunca emite. Devuelve { ok, data } | { ok:false, code }.
async function invokeQuery(action, saleId) {
  try {
    const { data, error } = await supabase.functions.invoke('fiscal-emit', { body: { action, saleId }, timeout: FISCAL_QUERY_TIMEOUT_MS });
    if (!error && data && typeof data === 'object') return { ok: true, data };
    let payload = null;
    try {
      if (error?.context && typeof error.context.json === 'function') payload = await error.context.json();
    } catch { /* sin detalle */ }
    return { ok: false, code: payload?.error ?? 'QUERY_UNAVAILABLE' };
  } catch {
    return { ok: false, code: 'QUERY_UNAVAILABLE' };
  }
}

/**
 * Resultado desconocido: pregunta a DTE Core por la operación de la venta. Solo consulta: no
 * emite, no reintenta y no cambia la venta (sigue «por confirmar» hasta la conciliación manual).
 */
export function lookupFiscalOperation(saleId) {
  return invokeQuery('lookup', saleId);
}

/** Estado SII de una boleta ya emitida, consultado a DTE Core. Nunca emite. */
export function refreshFiscalSiiStatus(saleId) {
  return invokeQuery('sii-status', saleId);
}

/** Texto para el cajero con el resultado de lookupFiscalOperation. */
export function describeLookupResult(r) {
  if (!r?.ok) return describeFiscalEmitError(r?.code);
  const d = r.data;
  if (d.result === 'found') {
    const docs = d.documents === 'valid' ? 'XML y PDF verificados' : 'sin poder verificar XML y PDF';
    return `DTE Core informa la boleta folio ${d.folio} (${docs}). Falta conciliarla; no se emitió otra.`;
  }
  if (d.result === 'not_found') return 'DTE Core no informa esta operación. La venta sigue bloqueada: no se emite sola.';
  return 'DTE Core no dio una respuesta clara. La venta sigue bloqueada: no se emite sola.';
}
