// FISCAL-80MM — impresión térmica de una boleta YA emitida, desde su XML
// auténtico. Solo lectura: descarga el XML por la ruta existente
// /api/fiscal/download (guardada por dueño), lo valida y envía bytes a la
// impresora. Nunca llama al proveedor, nunca emite ni cambia el estado
// fiscal, nunca crea ventas ni movimientos.
//
// Apagado por defecto: requiere VITE_FISCAL_THERMAL_PRINT=preview. El
// cumplimiento de la representación con la norma del SII está pendiente de
// validación; hasta entonces todo ticket sale rotulado como prueba.

import { supabase } from '../lib/supabase';
import { decodeDteBytes, parseDteXml, DteXmlError } from '../lib/fiscal/dte/parseDteXml';
import { verifyTedSignature } from '../lib/fiscal/dte/verifyTed';
import { buildBoletaReceipt, buildTimbreDiagnosticReceipt, BoletaReceiptError } from '../lib/printing/receipts/buildBoletaReceipt';
import { printService } from '../lib/printing/printService';
import { buildPrinterConfigKey, readPrinterConfig } from '../lib/printing/printerConfigStorage';
import { buildConnectorConfigKey, readConnectorConfig } from '../lib/printing/connectorConfigStorage';
import { buildPrintTarget, buildPrintKey } from '../lib/printing/printRouting';

export const FISCAL_THERMAL_PRINT_ENABLED = import.meta.env?.VITE_FISCAL_THERMAL_PRINT === 'preview';
export const TEST_COPY_LABEL = 'PRUEBA DE IMPRESION - NO OFICIAL';

const MESSAGES = {
  XML_DOWNLOAD_FAILED: 'No se pudo descargar el XML de la boleta.',
  TED_NOT_VERIFIED: 'La firma del timbre no es válida. No se imprime.',
  TED_MISMATCH: 'El timbre no coincide con los datos de la boleta. No se imprime.',
  RESOLUCION_REQUIRED: 'Ingresa el número y año de la resolución del SII.',
  PAPER_WIDTH_UNSUPPORTED: 'La boleta térmica requiere papel de 80 mm.',
  MISSING_PRINTER: 'No hay impresora configurada para este equipo.',
  DTE_TYPE_UNSUPPORTED: 'Solo se pueden imprimir boletas electrónicas (DTE 39).',
};

export function describeFiscalPrintError(code) {
  return MESSAGES[code] || `No se pudo preparar la boleta (${code || 'error desconocido'}).`;
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
  const dte = parseDteXml(decodeDteBytes(await response.arrayBuffer()));
  const tedVerified = await verifyTedSignature(dte.ted);
  if (!tedVerified) throw Object.assign(new Error(MESSAGES.TED_NOT_VERIFIED), { code: 'TED_NOT_VERIFIED' });
  return { dte, tedVerified };
}

function resolveTarget(businessId, kind, folio) {
  const printerConfig = readPrinterConfig(buildPrinterConfigKey(businessId));
  const target = buildPrintTarget({
    connectorConfig: readConnectorConfig(buildConnectorConfigKey(businessId)),
    qzPrinterName: printerConfig.printerName,
    idempotencyKey: buildPrintKey(kind, `${businessId}:${folio}`),
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
 * @param {{ businessId: string, invoiceId: string, resolucion: { numero: string, anio: string }, unidadSii?: string, timbreStrategyId?: string }} params
 * @returns {Promise<{ ok: true, folio: number, timbre: Object } | { ok: false, code: string, message: string }>}
 */
export async function printBoletaThermal({ businessId, invoiceId, resolucion, unidadSii, timbreStrategyId }) {
  try {
    const { dte, tedVerified } = await loadVerifiedDte({ businessId, invoiceId });
    const { printerConfig, target } = resolveTarget(businessId, 'fiscal-print', dte.folio);
    const { receipt, timbre } = await buildBoletaReceipt({
      dte,
      tedVerified,
      resolucion,
      unidadSii,
      timbreStrategyId,
      copyLabel: TEST_COPY_LABEL,
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
export async function printTimbreDiagnostic({ businessId, invoiceId }) {
  try {
    const { dte, tedVerified } = await loadVerifiedDte({ businessId, invoiceId });
    const { printerConfig, target } = resolveTarget(businessId, 'diag', dte.folio);
    const { receipt, timbres } = await buildTimbreDiagnosticReceipt({
      dte, tedVerified, paperWidthMm: printerConfig.paperWidthMm, cutStrategyId: printerConfig.cutStrategyId,
    });
    await send(receipt, target);
    return { ok: true, folio: dte.folio, timbres };
  } catch (err) {
    return toFailure(err);
  }
}

function toFailure(err) {
  const code = err?.code || (err instanceof DteXmlError || err instanceof BoletaReceiptError ? err.code : 'PRINT_FAILED');
  const message = MESSAGES[code] || err?.message || describeFiscalPrintError(code);
  return { ok: false, code, message };
}
