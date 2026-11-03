// FISCAL-80MM — REIMPRESIÓN térmica de una boleta YA emitida, desde su XML
// auténtico. Solo lectura: toma el XML de la ruta existente
// /api/fiscal/download (guardada por dueño) o de un archivo que elige el
// usuario, lo valida y envía bytes a la impresora. Está separado del flujo
// de emisión: nunca llama al proveedor (DTE Core), nunca emite, nunca
// consume folios, nunca cambia el estado fiscal y nunca crea ventas.
//
// Apagado en producción. Se ve con VITE_FISCAL_THERMAL_PRINT=preview, con
// VITE_VERCEL_ENV=preview o en el alias de rama de una Preview de Vercel
// (saas-git-<rama>-…vercel.app, nunca main). VITE_FISCAL_THERMAL_PRINT=off lo
// apaga siempre. Todo ticket sale rotulado como REIMPRESION de un documento
// existente.

import { supabase } from '../lib/supabase';
import { decodeDteBytes, parseDteXml, DteXmlError } from '../lib/fiscal/dte/parseDteXml';
import { verifyTedSignature } from '../lib/fiscal/dte/verifyTed';
import {
  buildBoletaReceipt, buildTimbreDiagnosticReceipt, BoletaReceiptError, resolveTimbreStrategyId,
} from '../lib/printing/receipts/buildBoletaReceipt';
import { printService } from '../lib/printing/printService';
import { buildPrinterConfigKey, readPrinterConfig } from '../lib/printing/printerConfigStorage';
import { buildConnectorConfigKey, readConnectorConfig } from '../lib/printing/connectorConfigStorage';
import { buildPrintTarget, buildPrintKey, resolvePrintRoute, ROUTE } from '../lib/printing/printRouting';
import { isSimulatedDte } from '../lib/fiscal/dte/simulatedDte';
import { AUTO_TIMBRE_STRATEGY_ID, MANUAL_TIMBRE_STRATEGY_IDS } from '../lib/printing/receipts/buildBoletaReceipt';

// Alias de rama de Vercel (saas-git-<rama>-<equipo>.vercel.app), salvo el de
// main, que sirve lo mismo que producción. Los dominios propios
// (go.ventalink.app, go.walinka.com) y las URL de producción nunca coinciden.
const PREVIEW_BRANCH_HOST = /^saas-git-(?!main-)[a-z0-9-]+\.vercel\.app$/i;

export function isFiscalThermalPrintEnabled(env = {}, hostname = '') {
  if (env.VITE_FISCAL_THERMAL_PRINT === 'off') return false;
  if (env.VITE_VERCEL_ENV === 'production') return env.VITE_FISCAL_THERMAL_PRINT === 'preview';
  return env.VITE_FISCAL_THERMAL_PRINT === 'preview'
    || env.VITE_VERCEL_ENV === 'preview'
    || PREVIEW_BRANCH_HOST.test(String(hostname || ''));
}
export const FISCAL_THERMAL_PRINT_ENABLED = isFiscalThermalPrintEnabled(
  import.meta.env || {},
  typeof window !== 'undefined' ? window.location?.hostname : '',
);
export const MAX_XML_FILE_BYTES = 200 * 1024;

const MESSAGES = {
  XML_DOWNLOAD_FAILED: 'No se pudo descargar el XML de la boleta.',
  TED_NOT_VERIFIED: 'La firma del timbre no es válida. No se imprime.',
  TED_MISMATCH: 'El timbre no coincide con los datos de la boleta. No se imprime.',
  RESOLUCION_REQUIRED: 'Ingresa el número y el año de la resolución del SII, o deja ambos vacíos.',
  PAPER_WIDTH_UNSUPPORTED: 'La boleta térmica requiere papel de 80 mm.',
  MISSING_PRINTER: 'No hay impresora configurada para este equipo.',
  CONNECTOR_REQUIRED: 'La boleta se imprime solo con el Walinka Print Connector. Actívalo y emparéjalo en Configuración de impresión.',
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

// La boleta sale SOLO por el Walinka Print Connector (el mismo de los
// tickets). No hay ruta QZ Tray para documentos fiscales: sin conector
// activo y emparejado no se imprime y se avisa.
function resolveTarget(businessId, kind, folio, idempotencyKey) {
  const printerConfig = readPrinterConfig(buildPrinterConfigKey(businessId));
  const connectorConfig = readConnectorConfig(buildConnectorConfigKey(businessId));
  if (resolvePrintRoute(connectorConfig) !== ROUTE.CONNECTOR) {
    throw Object.assign(new Error(MESSAGES.CONNECTOR_REQUIRED), { code: 'CONNECTOR_REQUIRED' });
  }
  const target = buildPrintTarget({
    connectorConfig,
    idempotencyKey: idempotencyKey || buildPrintKey(kind, `${businessId}:${folio}`),
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
// Número interno de la venta desde el servidor (crm_invoices.invoice_number),
// para el pie de la reimpresión. Mejor esfuerzo: sin él, el papel sale sin
// número, nunca con uno inventado.
async function lookupSaleNumber(businessId, invoiceId) {
  try {
    if (!invoiceId || typeof supabase.from !== 'function') return null;
    const { data, error } = await supabase.from('crm_invoices')
      .select('invoice_number').eq('id', invoiceId).eq('business_id', businessId).maybeSingle();
    return error ? null : (data?.invoice_number ?? null);
  } catch {
    return null;
  }
}

export async function printBoletaThermal({ businessId, invoiceId, file, resolucion, unidadSii, timbreStrategyId, saleNumber = null }) {
  try {
    if (saleNumber == null && invoiceId) saleNumber = await lookupSaleNumber(businessId, invoiceId);
    const { dte, tedVerified } = await loadSource({ businessId, invoiceId, file });
    const { printerConfig, target } = resolveTarget(businessId, 'fiscal-reprint', dte.folio);
    const { receipt, timbre } = await buildBoletaReceipt({
      dte,
      tedVerified,
      resolucion,
      unidadSii,
      timbreStrategyId: resolveTimbreStrategyId(
        { printerName: target.printerName, imageMode: printerConfig.imageMode },
        timbreStrategyId,
      ),
      reprint: true,
      saleNumber,
      paperWidthMm: printerConfig.paperWidthMm,
      autoCut: printerConfig.autoCut,
      cutStrategyId: printerConfig.cutStrategyId,
    });
    await send(receipt, target);
    return { ok: true, folio: dte.folio, printerName: target.printerName, timbre };
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

// Ajustes de la representación guardados en este equipo desde /crm/impresion
// (CrmFiscalThermalPrint): resolución SII y modo del timbre. La resolución
// es un dato del emisor; vive aquí hasta que la configuración del emisor la
// guarde en el servidor.
export const FISCAL_RESOLUCION_STORAGE_KEY = 'walinka:fiscal:resolucion-prueba';
export const FISCAL_TIMBRE_STRATEGY_STORAGE_KEY = 'walinka:fiscal:timbre-strategy:v2';

function readStoredJson(key, fallback) {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function readFiscalPrintSettings() {
  const res = readStoredJson(FISCAL_RESOLUCION_STORAGE_KEY, null);
  const strategy = readStoredJson(FISCAL_TIMBRE_STRATEGY_STORAGE_KEY, AUTO_TIMBRE_STRATEGY_ID);
  return {
    resolucion: { numero: String(res?.numero ?? '').trim(), anio: String(res?.anio ?? '').trim() },
    timbreStrategyId: MANUAL_TIMBRE_STRATEGY_IDS.includes(strategy) ? strategy : AUTO_TIMBRE_STRATEGY_ID,
  };
}

/**
 * Lo que falta en este equipo para imprimir una boleta NUEVA, o null.
 * Se revisa ANTES de emitir: no se emite una boleta que no se puede imprimir.
 * Solo mira la configuración guardada (conector activo y emparejado, con
 * impresora); si el conector no responde al imprimir, la boleta queda
 * emitida y se reintenta el papel con la misma clave.
 */
export function fiscalPrintBlocker(businessId, { requireResolucion = false, settings = readFiscalPrintSettings() } = {}) {
  const connectorConfig = readConnectorConfig(buildConnectorConfigKey(businessId));
  if (resolvePrintRoute(connectorConfig) !== ROUTE.CONNECTOR) return 'CONNECTOR_REQUIRED';
  if (!connectorConfig.printerName) return 'MISSING_PRINTER';
  if (requireResolucion && !hasValidResolucion(settings.resolucion)) return 'RESOLUCION_REQUIRED';
  return null;
}

export function hasValidResolucion(resolucion) {
  return /^\d{1,6}$/.test(String(resolucion?.numero ?? '')) && /^\d{4}$/.test(String(resolucion?.anio ?? ''));
}

/**
 * Imprime la boleta recién emitida (original) o una reimpresión, desde los
 * bytes del XML. Usado por el flujo automático del TPV (fiscalSaleFlow).
 * Nunca emite ni llama al proveedor. Si el XML es una simulación, el papel
 * sale rotulado SIMULACION / SIN VALOR TRIBUTARIO: lo decide el documento,
 * no quien llama.
 * @param {{ businessId: string, bytes: ArrayBuffer|Uint8Array, reprint?: boolean, idempotencyKey?: string, settings?: ReturnType<typeof readFiscalPrintSettings>, sender?: Function }} params
 */
export async function printIssuedBoleta({ businessId, bytes, reprint = false, idempotencyKey, saleNumber = null, settings = readFiscalPrintSettings(), sender = send }) {
  try {
    const { dte, tedVerified } = await verifyDteBytes(bytes);
    const simulation = isSimulatedDte(dte);
    const { printerConfig, target } = resolveTarget(businessId, reprint ? 'fiscal-reprint' : 'fiscal', dte.folio, idempotencyKey);
    const { receipt, timbre } = await buildBoletaReceipt({
      dte,
      tedVerified,
      resolucion: settings.resolucion,
      timbreStrategyId: resolveTimbreStrategyId(
        { printerName: target.printerName, imageMode: printerConfig.imageMode },
        settings.timbreStrategyId,
      ),
      reprint,
      simulation,
      saleNumber,
      paperWidthMm: printerConfig.paperWidthMm,
      autoCut: printerConfig.autoCut,
      cutStrategyId: printerConfig.cutStrategyId,
    });
    await sender(receipt, target);
    return { ok: true, folio: dte.folio, simulation, printerName: target.printerName, timbre };
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
