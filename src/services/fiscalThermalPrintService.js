// FISCAL-80MM — REIMPRESIÓN térmica de una boleta YA emitida, desde su XML
// auténtico. Solo lectura: toma el XML de la ruta existente
// /api/fiscal/download (guardada por dueño) o de un archivo que elige el
// usuario, lo valida y envía bytes a la impresora. Está separado del flujo
// de emisión: nunca llama al proveedor (DTE Core), nunca emite, nunca
// consume folios, nunca cambia el estado fiscal y nunca crea ventas.
//
// Apagado por defecto: requiere VITE_FISCAL_THERMAL_PRINT=preview. Todo
// ticket sale rotulado como REIMPRESION de un documento existente.

import { supabase } from '../lib/supabase';
import { decodeDteBytes, parseDteXml, DteXmlError } from '../lib/fiscal/dte/parseDteXml';
import { verifyTedSignature } from '../lib/fiscal/dte/verifyTed';
import { buildBoletaReceipt, buildTimbreDiagnosticReceipt, BoletaReceiptError } from '../lib/printing/receipts/buildBoletaReceipt';
import { printService } from '../lib/printing/printService';
import { buildPrinterConfigKey, readPrinterConfig } from '../lib/printing/printerConfigStorage';
import { buildConnectorConfigKey, readConnectorConfig } from '../lib/printing/connectorConfigStorage';
import { buildPrintTarget, buildPrintKey } from '../lib/printing/printRouting';

export const FISCAL_THERMAL_PRINT_ENABLED = import.meta.env?.VITE_FISCAL_THERMAL_PRINT === 'preview';
export const MAX_XML_FILE_BYTES = 200 * 1024;

const MESSAGES = {
  XML_DOWNLOAD_FAILED: 'No se pudo descargar el XML de la boleta.',
  TED_NOT_VERIFIED: 'La firma del timbre no es válida. No se imprime.',
  TED_MISMATCH: 'El timbre no coincide con los datos de la boleta. No se imprime.',
  RESOLUCION_REQUIRED: 'Ingresa el número y año de la resolución del SII.',
  PAPER_WIDTH_UNSUPPORTED: 'La boleta térmica requiere papel de 80 mm.',
  MISSING_PRINTER: 'No hay impresora configurada para este equipo.',
  DTE_TYPE_UNSUPPORTED: 'Solo se pueden imprimir boletas electrónicas (DTE 39).',
  XML_FILE_INVALID: 'El archivo no es un XML de boleta válido.',
  XML_FILE_TOO_LARGE: 'El archivo es demasiado grande para ser el XML de una boleta.',
  XML_NOT_WELL_FORMED: 'El archivo no es un XML válido.',
  TED_NOT_FOUND: 'El XML no trae el timbre electrónico (TED).',
  DTE_TOTALS_INCONSISTENT: 'Los totales del XML no cuadran. No se imprime.',
  TIMBRE_STRATEGY_INVALID: 'Modo de impresión del timbre no válido.',
};

export function describeFiscalPrintError(code) {
  return MESSAGES[code] || `No se pudo preparar la boleta (${code || 'error desconocido'}).`;
}

/** Valida bytes de un XML de DTE (decodifica, parsea y verifica el timbre). */
export async function verifyDteBytes(bytes) {
  const dte = parseDteXml(decodeDteBytes(bytes));
  const tedVerified = await verifyTedSignature(dte.ted);
  if (!tedVerified) throw Object.assign(new Error(MESSAGES.TED_NOT_VERIFIED), { code: 'TED_NOT_VERIFIED' });
  return { dte, tedVerified };
}

/** Lee un archivo XML elegido por el usuario (p. ej. DTE_39_51106.xml) y lo valida. */
export async function loadVerifiedDteFromFile(file) {
  if (!file || typeof file.arrayBuffer !== 'function') throw Object.assign(new Error(MESSAGES.XML_FILE_INVALID), { code: 'XML_FILE_INVALID' });
  if (file.size > MAX_XML_FILE_BYTES) throw Object.assign(new Error(MESSAGES.XML_FILE_TOO_LARGE), { code: 'XML_FILE_TOO_LARGE' });
  return verifyDteBytes(await file.arrayBuffer());
}

/** Descarga el XML auténtico y lo valida. Devuelve { dte, tedVerified }. */
export async function loadVerifiedDte({ businessId, invoiceId, fetchImpl = fetch }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw Object.assign(new Error('Debes iniciar sesión.'), { code: 'AUTH_REQUIRED' });
  const params = new URLSearchParams({ businessId, invoiceId, format: 'xml' });
  const response = await fetchImpl(`/api/fiscal/download?${params}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: 'no-store',
  });
  if (!response.ok) throw Object.assign(new Error(MESSAGES.XML_DOWNLOAD_FAILED), { code: 'XML_DOWNLOAD_FAILED' });
  return verifyDteBytes(await response.arrayBuffer());
}

// Origen del XML: { invoiceId } (registro guardado) o { file } (archivo local).
function loadSource({ businessId, invoiceId, file }) {
  return file ? loadVerifiedDteFromFile(file) : loadVerifiedDte({ businessId, invoiceId });
}

function resolveTarget(businessId, kind, folio) {
  const printerConfig = readPrinterConfig(buildPrinterConfigKey(businessId));
  const target = buildPrintTarget({
    connectorConfig: readConnectorConfig(buildConnectorConfigKey(businessId)),
    qzPrinterName: printerConfig.printerName,
    // Cada pulsación es una nueva reimpresión voluntaria. Evitar una clave fija
    // que el conector pueda interpretar como duplicado y omitir silenciosamente.
    idempotencyKey: buildPrintKey(kind, `${businessId}:${folio}:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`),
  });
  if (target.error) throw Object.assign(new Error(MESSAGES.MISSING_PRINTER), { code: 'MISSING_PRINTER' });
  return { printerConfig, target };
}

async function send(receipt, target) {
  return printService.printReceipt(receipt, {
    printerName: target.printerName,
    connector: target.connector,
    idempotencyKey: target.idempotencyKey,
  });
}

/**
 * Reimprime una boleta existente. El XML viene de `invoiceId` o de `file`.
 * @param {{ businessId: string, invoiceId?: string, file?: File, resolucion: { numero: string, anio: string }, unidadSii?: string, timbreStrategyId?: string }} params
 * @returns {Promise<{ ok: true, folio: number, timbre: Object } | { ok: false, code: string, message: string }>}
 */
export async function printBoletaThermal({ businessId, invoiceId, file, resolucion, unidadSii, timbreStrategyId }) {
  try {
    const { dte, tedVerified } = await loadSource({ businessId, invoiceId, file });
    const { printerConfig, target } = resolveTarget(businessId, 'fiscal-reprint', dte.folio);
    const { receipt, timbre } = await buildBoletaReceipt({
      dte,
      tedVerified,
      resolucion,
      unidadSii,
      timbreStrategyId,
      reprint: true,
      paperWidthMm: printerConfig.paperWidthMm,
      autoCut: printerConfig.autoCut,
      cutStrategyId: printerConfig.cutStrategyId,
    });
    await send(receipt, target);
    return { ok: true, folio: dte.folio, timbre };
  } catch (err) {
    return toFailure(err);
  }
}

/** Ticket de diagnóstico del timbre (tres estrategias). Sin valor tributario. */
export async function printTimbreDiagnostic({ businessId, invoiceId, file }) {
  try {
    const { dte, tedVerified } = await loadSource({ businessId, invoiceId, file });
    const { printerConfig, target } = resolveTarget(businessId, 'diag', dte.folio);
    const { receipt, timbres } = await buildTimbreDiagnosticReceipt({
      dte, tedVerified, paperWidthMm: printerConfig.paperWidthMm, cutStrategyId: printerConfig.cutStrategyId,
    });
    await send(receipt, target);
    return { ok: true, folio: dte.folio, timbres: timbres.map(({ strategyId, widthMm, heightMm, widthDots }) => ({ strategyId, widthMm, heightMm, widthDots })) };
  } catch (err) {
    return toFailure(err);
  }
}

function toFailure(err) {
  const code = err?.code || (err instanceof DteXmlError || err instanceof BoletaReceiptError ? err.code : 'PRINT_FAILED');
  if (err instanceof DteXmlError && !MESSAGES[code]) return { ok: false, code, message: `${MESSAGES.XML_FILE_INVALID} (${code})` };
  const message = MESSAGES[code] || err?.message || describeFiscalPrintError(code);
  return { ok: false, code, message };
}
