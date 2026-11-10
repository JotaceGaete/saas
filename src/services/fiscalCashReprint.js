// Reimpresión desde Caja: si la venta tiene una boleta electrónica emitida, se
// reimprime la BOLETA (desde su XML firmado, con la leyenda REIMPRESION), no el
// ticket interno. Solo lee: consulta el estado en fiscal-emit (acción `status`)
// y descarga el XML. Nunca emite, nunca gasta folios ni llama al SII.
import { FISCAL_AUTO_MODE } from './fiscalAutoMode';
import { createLiveEmitter } from './fiscalEmitters';
import { getFiscalSaleStatus } from './fiscalEmitService';
import { printIssuedBoleta, readFiscalPrintSettings } from './fiscalThermalPrintService';

function printableResolucion(resolucion) {
  if (!resolucion?.numero || !resolucion?.fecha) return { numero: '', anio: '' };
  const fecha = String(resolucion.fecha).slice(0, 10);
  return { numero: String(resolucion.numero), anio: fecha.slice(0, 4), fecha };
}

/**
 * @returns {Promise<{ handled: false } | { handled: true, ok: boolean, folio?: number, printerName?: string, message?: string }>}
 *   handled=false: la venta no tiene boleta emitida (o la boleta automática no
 *   está activa); quien llama imprime el ticket de siempre.
 */
export async function reprintBoletaIfIssued({
  businessId, invoiceId, saleNumber = null, branding = null, idempotencyKey,
  mode = FISCAL_AUTO_MODE,
  deps = {},
} = {}) {
  if (mode !== 'live' || !businessId || !invoiceId) return { handled: false };
  const status = deps.status || getFiscalSaleStatus;
  const r = await status(invoiceId);
  if (!r?.ok || r.data?.state !== 'issued' || !r.data?.folio) return { handled: false };
  const loadDte = deps.loadDte || ((id) => createLiveEmitter({ businessId }).loadDte(id));
  let bytes;
  try {
    bytes = await loadDte(invoiceId);
  } catch (err) {
    return { handled: true, ok: false, message: err?.message || 'No se pudo descargar el XML de la boleta.' };
  }
  const print = deps.print || printIssuedBoleta;
  const settings = { ...readFiscalPrintSettings(), resolucion: printableResolucion(r.data.resolucion) };
  const p = await print({ businessId, bytes, reprint: true, idempotencyKey, saleNumber, branding, settings });
  return p?.ok
    ? { handled: true, ok: true, folio: p.folio, printerName: p.printerName }
    : { handled: true, ok: false, message: p?.message || 'No se pudo reimprimir la boleta.' };
}
