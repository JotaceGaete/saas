// Flujo único del TPV: venta cobrada -> boleta DTE 39 -> impresión con PDF417.
//
// Reglas (no negociables):
//  1. Una sola emisión por venta. El servidor manda (reclamo atómico, una fila
//     por venta); aquí además: un solo envío en vuelo por venta, y una marca
//     local de "ya se envió" que impide reenviar solo, aunque se recargue.
//  2. Ningún resultado incierto se repite solo (unknown, sending, respuesta
//     perdida): queda bloqueado hasta conciliar.
//  3. Imprimir nunca emite. La impresión automática usa una clave fija por
//     folio, así que el conector no imprime dos veces el original; reintentar
//     tras un fallo reusa esa clave. Reimprimir usa una clave nueva, sale
//     rotulada REIMPRESION y nunca toca el folio.
//  4. Si la venta abre de nuevo (recarga, otro equipo), se parte del estado
//     del servidor: si ya hay boleta, no se emite; si ya se imprimió en este
//     equipo, no se imprime solo otra vez.
//
// Sin React: se prueba con emisor, impresora y almacenamiento falsos.

import { LOCKING_CODES, describeFiscalEmitError } from './fiscalEmitService';

export const PHASE = Object.freeze({
  CHECKING: 'checking',
  EMITTING: 'emitting',
  PRINTING: 'printing',
  PRINTED: 'printed',
  PRINT_FAILED: 'print_failed', // boleta emitida; falta el papel
  NOT_ELIGIBLE: 'not_eligible', // la venta no lleva boleta (p. ej. no pagada): ticket normal
  BLOCKED: 'blocked', // no se emitió por una regla (resolución, IVA, emisor...)
  UNCERTAIN: 'uncertain', // pudo emitirse: no se repite, se concilia
  REJECTED: 'rejected', // DTE Core rechazó, sin folio
  ERROR: 'error', // no se pudo consultar el estado: no se emitió
});

// El comercio no usa facturación electrónica (módulo opcional): no se emite ni se muestra nada
// fiscal; el TPV imprime el comprobante interno de siempre.
export const MODULE_OFF_CODES = Object.freeze(new Set([
  'FISCAL_ISSUER_NOT_ENABLED', 'FISCAL_EMISSION_DISABLED', 'COUNTRY_NOT_SUPPORTED',
  // Negocio fuera de la lista de empresas autorizadas del servidor (alcance actual).
  'FISCAL_BUSINESS_NOT_ALLOWED',
]));

// Motivos por los que la venta no lleva boleta electrónica: el TPV imprime el comprobante
// interno de siempre y nunca se reintenta la emisión sola. No incluye los bloqueos que se
// arreglan en el equipo (conector, impresora, resolución), que sí se reintentan.
export const NOT_ELIGIBLE_CODES = Object.freeze(new Set([
  'SALE_NOT_ELIGIBLE', 'NO_CONFIRMED_PAYMENT', 'POINT_NOT_CONFIRMED', 'SALE_NOT_SAME_DAY', 'FISCAL_SALE_NOT_SAME_DAY',
  ...MODULE_OFF_CODES,
  'FISCAL_NON_TAXABLE_NOT_SUPPORTED', 'FISCAL_TAX_LINES_NOT_VERIFIED', 'DISCOUNT_NOT_SUPPORTED', 'MIXED_PAYMENTS',
  'UNSUPPORTED_PAYMENT_METHOD', 'PAYMENT_AMOUNT_MISMATCH', 'FISCAL_ROLE_REQUIRED', 'FISCAL_RETROACTIVE_BLOCKED',
  // Migración H: API key sin verificar contra el RUT. Se resuelve en la configuración, no en caja.
  'FISCAL_IDENTITY_NOT_VERIFIED',
]));

const MESSAGES = Object.freeze({
  ATTEMPT_ALREADY_SENT: 'Esta venta ya se envió a emisión desde este equipo y no hay confirmación. No se reenvía sola: consulta el estado.',
  RESOLUCION_REQUIRED: 'Falta la resolución del SII del emisor (Configuración > Facturación). No se emitió la boleta.',
  CONNECTOR_REQUIRED: 'El Walinka Print Connector no está activo y emparejado en este equipo. No se emitió la boleta.',
  MISSING_PRINTER: 'El conector no tiene impresora elegida. No se emitió la boleta.',
  STATUS_UNAVAILABLE: 'No se pudo consultar el estado fiscal de la venta. No se emitió ninguna boleta.',
  FISCAL_NON_TAXABLE_NOT_SUPPORTED: 'La venta incluye productos exentos o no afectos a IVA: Walinka todavía no emite esas boletas. Emite el documento tributario por otro medio.',
  FISCAL_TAX_LINES_NOT_VERIFIED: 'Falta el tratamiento tributario (IVA) de algún producto. Configúralo en el editor de productos o en Configuración > Facturación.',
  DISCOUNT_NOT_SUPPORTED: 'Las ventas con descuento todavía no generan boleta electrónica. Emite el documento tributario por otro medio.',
  MIXED_PAYMENTS: 'Las ventas con pago dividido todavía no generan boleta electrónica. Emite el documento tributario por otro medio.',
  UNSUPPORTED_PAYMENT_METHOD: 'Este medio de pago todavía no genera boleta electrónica (solo efectivo o Point). Emite el documento tributario por otro medio.',
  FISCAL_ROLE_REQUIRED: 'Tu usuario no tiene permiso para emitir boletas en este negocio.',
});

export function describeFlowCode(code) {
  return MESSAGES[code] || describeFiscalEmitError(code);
}

// Compartido por todas las instancias del flujo (React StrictMode, remontajes):
// dos llamadas simultáneas para la misma venta comparten el mismo envío.
const inFlight = new Map(); // `${businessId}:${saleId}` -> Promise

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

// Las boletas reales y las simuladas no comparten marcas ni claves de impresión: el folio
// simulado 900001 no puede hacer creer que el folio real 900001 ya se imprimió. Las simuladas
// conservan el formato anterior (así no se pierden las marcas que ya existen en los equipos).
const isLive = (mode) => mode === 'live';

/** Marcas locales por negocio: envío de emisión por venta e impresión del original por folio. */
export function createFlowMarks({ businessId, storage, mode = 'simulated' } = {}) {
  const s = storage || globalThis.localStorage || memoryStorage();
  const prefix = isLive(mode) ? 'walinka:fiscal-flow:live' : 'walinka:fiscal-flow';
  const key = (kind, id) => `${prefix}:${kind}:${businessId}:${id}`;
  const get = (k) => { try { return s.getItem(k); } catch { return null; } };
  const set = (k, v) => { try { s.setItem(k, v); } catch { /* sin almacenamiento */ } };
  const del = (k) => { try { s.removeItem(k); } catch { /* sin almacenamiento */ } };
  return Object.freeze({
    attempted: (saleId) => get(key('attempt', saleId)) != null,
    markAttempt: (saleId) => set(key('attempt', saleId), new Date().toISOString()),
    clearAttempt: (saleId) => del(key('attempt', saleId)),
    printed: (folio) => get(key('printed', folio)) != null,
    markPrinted: (folio) => set(key('printed', folio), new Date().toISOString()),
  });
}

/** Clave del trabajo de impresión del ORIGINAL: fija por folio (el conector descarta duplicados). */
export function originalPrintKey(businessId, folio, mode = 'simulated') {
  return isLive(mode) ? `fiscal-live:${businessId}:39:${folio}:boleta` : `fiscal:${businessId}:${folio}:boleta`;
}

export function reprintKey(businessId, folio, { now = Date.now(), nonce = Math.random().toString(36).slice(2, 8), mode = 'simulated' } = {}) {
  return isLive(mode) ? `fiscal-live-reprint:${businessId}:39:${folio}:${now}${nonce}` : `fiscal-reprint:${businessId}:${folio}:${now}${nonce}`;
}

/**
 * @param {Object} deps
 * @param {string} deps.businessId
 * @param {ReturnType<import('./fiscalEmitters').createLiveEmitter>} deps.emitter
 * @param {(p: { bytes: Uint8Array, reprint: boolean, idempotencyKey: string, saleNumber: (number|string|null) }) => Promise<{ ok: boolean, code?: string, message?: string, simulation?: boolean }>} deps.print
 * @param {ReturnType<typeof createFlowMarks>} [deps.marks]
 * @param {() => (string|null)} [deps.printBlocker] - código si falta algo para imprimir una boleta nueva
 *   (conector no activo, sin impresora, resolución en modo real); null si se puede imprimir
 */
export function createFiscalSaleFlow({
  businessId, emitter, print, mode = emitter?.mode === 'live' ? 'live' : 'simulated',
  marks = createFlowMarks({ businessId, mode }), printBlocker = () => null,
}) {

  // Número interno de cada venta (invoice_number del servidor), para el pie
  // de la boleta y de sus reimpresiones. Lo trae el contexto de la venta.
  const saleNumbers = new Map();
  const remember = (saleId, sale) => {
    if (sale && sale.saleNumber != null) saleNumbers.set(saleId, sale.saleNumber);
  };
  const saleNumberOf = (saleId) => saleNumbers.get(saleId) ?? null;

  async function printOriginal(saleId, folio, { force = false } = {}) {
    if (!force && marks.printed(folio)) return { phase: PHASE.PRINTED, folio, alreadyPrinted: true };
    let bytes;
    try {
      bytes = await emitter.loadDte(saleId);
    } catch (err) {
      return { phase: PHASE.PRINT_FAILED, folio, code: err?.code || 'XML_DOWNLOAD_FAILED', message: err?.message };
    }
    const r = await print({ bytes, reprint: false, idempotencyKey: originalPrintKey(businessId, folio, mode), saleNumber: saleNumberOf(saleId) });
    if (!r?.ok) return { phase: PHASE.PRINT_FAILED, folio, code: r?.code || 'PRINT_FAILED', message: r?.message };
    marks.markPrinted(folio);
    return { phase: PHASE.PRINTED, folio, simulation: Boolean(r.simulation) };
  }

  async function fromStatus(saleId, sale, { allowEmit }) {
    const st = await emitter.status(saleId, sale);
    if (!st?.ok) return { phase: PHASE.ERROR, code: st?.code || 'STATUS_UNAVAILABLE' };
    const d = st.data;
    switch (d.state) {
      case 'issued':
      case 'cancelled':
        marks.clearAttempt(saleId);
        return { ...(await printOriginal(saleId, d.folio)), siiStatus: d.siiStatus ?? null };
      case 'unknown':
      case 'sending':
        return { phase: PHASE.UNCERTAIN, code: 'UNKNOWN_REQUIRES_RECONCILIATION', folio: d.folio ?? null, detail: d.errorCode ?? null };
      case 'failed':
        return { phase: PHASE.REJECTED, code: 'PROVIDER_REJECTED' };
      default:
        break;
    }
    if (!d.canEmit) {
      const code = d.blockedReason || 'SALE_NOT_ELIGIBLE';
      return { phase: NOT_ELIGIBLE_CODES.has(code) ? PHASE.NOT_ELIGIBLE : PHASE.BLOCKED, code };
    }
    if (marks.attempted(saleId) && !allowEmit.manual) return { phase: PHASE.UNCERTAIN, code: 'ATTEMPT_ALREADY_SENT' };
    if (!allowEmit.auto && !allowEmit.manual) return { phase: PHASE.BLOCKED, code: 'NOT_EMITTED' };
    // Una boleta nueva que no se puede imprimir no se emite.
    const blocker = printBlocker();
    if (blocker) return { phase: PHASE.BLOCKED, code: blocker, retryable: true };

    marks.markAttempt(saleId);
    const r = await emitter.emit(saleId, sale);
    if (r?.ok) {
      marks.clearAttempt(saleId);
      return printOriginal(saleId, r.folio);
    }
    const code = r?.code || 'RESPONSE_LOST';
    if (code === 'ALREADY_ISSUED') return fromStatus(saleId, sale, { allowEmit: {} });
    if (LOCKING_CODES.has(code) || r?.status === 'unknown') return { phase: PHASE.UNCERTAIN, code };
    if (code === 'PROVIDER_REJECTED' || r?.status === 'failed') { marks.clearAttempt(saleId); return { phase: PHASE.REJECTED, code: 'PROVIDER_REJECTED' }; }
    // El servidor rechazó antes de reclamar la venta (regla de negocio): no hubo emisión.
    marks.clearAttempt(saleId);
    return { phase: NOT_ELIGIBLE_CODES.has(code) ? PHASE.NOT_ELIGIBLE : PHASE.BLOCKED, code };
  }

  function once(saleId, fn) {
    const k = `${businessId}:${saleId}`;
    if (inFlight.has(k)) return inFlight.get(k);
    const p = (async () => {
      try { return await fn(); } catch (err) {
        // Un error inesperado después de enviar a emitir es incierto.
        return { phase: marks.attempted(saleId) ? PHASE.UNCERTAIN : PHASE.ERROR, code: err?.code || 'INTERNAL', message: err?.message };
      } finally { inFlight.delete(k); }
    })();
    inFlight.set(k, p);
    return p;
  }

  return Object.freeze({
    /** Al confirmar la venta cobrada: emite si corresponde e imprime. */
    start: (saleId, sale) => { remember(saleId, sale); return once(saleId, () => fromStatus(saleId, sale, { allowEmit: { auto: true } })); },
    /** Vuelve a consultar el estado (p. ej. tras conciliar). Nunca reenvía una emisión ya enviada. */
    refresh: (saleId, sale) => { remember(saleId, sale); return once(saleId, () => fromStatus(saleId, sale, { allowEmit: {} })); },
    /** Acción explícita del cajero cuando el envío anterior no llegó al servidor (estado sin fila). */
    emitAgain: (saleId, sale) => { remember(saleId, sale); return once(saleId, () => fromStatus(saleId, sale, { allowEmit: { manual: true } })); },
    /** Reintenta el papel del original (misma clave): nunca emite. */
    retryPrint: (saleId, folio) => once(saleId, () => printOriginal(saleId, folio, { force: true })),
    /** Copia rotulada REIMPRESION con clave nueva: nunca emite ni consume folio. */
    reprint: (saleId, folio) => once(saleId, async () => {
      const bytes = await emitter.loadDte(saleId);
      const r = await print({ bytes, reprint: true, idempotencyKey: reprintKey(businessId, folio, { mode }), saleNumber: saleNumberOf(saleId) });
      return r?.ok ? { phase: PHASE.PRINTED, folio, reprinted: true, simulation: Boolean(r.simulation) }
        : { phase: PHASE.PRINT_FAILED, folio, code: r?.code || 'PRINT_FAILED', message: r?.message, reprint: true };
    }),
  });
}
