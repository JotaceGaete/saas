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
});

export function describeFiscalEmitError(code) {
  return FISCAL_EMIT_MESSAGES[code] ?? 'No pudimos emitir la boleta. Inténtalo más tarde.';
}

// Devuelve { ok, status, folio?, code? }. Nunca lanza. Código = motivo estable; resultado incierto nunca se reintenta.
export async function emitFiscalSale(saleId) {
  const { data, error } = await supabase.functions.invoke('fiscal-emit', {
    body: { action: 'emit', saleId },
  });
  if (!error) {
    const status = data?.status ?? 'unknown';
    if (status === 'issued') return { ok: true, status, folio: data?.folio ?? null };
    return { ok: false, status, code: status === 'unknown' ? 'UNKNOWN_REQUIRES_RECONCILIATION' : (status === 'failed' ? 'PROVIDER_REJECTED' : 'SERVER_ERROR') };
  }
  let payload = null;
  try {
    if (error?.context && typeof error.context.json === 'function') payload = await error.context.json();
  } catch { /* sin detalle: código genérico */ }
  return { ok: false, status: 'error', code: payload?.error ?? 'SERVER_ERROR' };
}
