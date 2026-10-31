// PRINT-CONN — decisión de ruta de impresión: Walinka Print Connector (local)
// o QZ Tray. Módulo puro (sin React ni localStorage) para poder probarlo con
// node:test.
//
// Reglas:
// - Si el conector está activado Y emparejado, ES la ruta. Un error del
//   conector nunca cambia silenciosamente a QZ Tray: se muestra al cajero.
// - Si no, la ruta es QZ Tray, igual que antes.

import { createLocalConnectorProvider } from './providers/localConnectorProvider.js';

export const ROUTE = Object.freeze({
  CONNECTOR: 'local-connector',
  QZ: 'qz',
});

export const PRINT_ERROR = Object.freeze({
  MISSING_PRINTER: 'missing_printer',
});

/** Ruta activa según la configuración del conector. */
export function resolvePrintRoute(connectorConfig) {
  return connectorConfig?.enabled && connectorConfig?.token ? ROUTE.CONNECTOR : ROUTE.QZ;
}

/**
 * Destino listo para printService.printReceipt.
 * Devuelve { route, printerName, connector?, idempotencyKey?, error? }.
 * Con ruta conector y sin impresora elegida devuelve error, nunca cae a QZ.
 */
export function buildPrintTarget({
  connectorConfig,
  qzPrinterName = null,
  idempotencyKey,
  fetchImpl,
} = {}) {
  const route = resolvePrintRoute(connectorConfig);
  if (route === ROUTE.QZ) {
    return { route, printerName: qzPrinterName || null, error: qzPrinterName ? null : PRINT_ERROR.MISSING_PRINTER };
  }
  if (!connectorConfig.printerName) {
    return { route, printerName: null, error: PRINT_ERROR.MISSING_PRINTER };
  }
  return {
    route,
    printerName: connectorConfig.printerName,
    idempotencyKey,
    connector: createLocalConnectorProvider({
      baseUrl: connectorConfig.baseUrl,
      token: connectorConfig.token,
      fetchImpl,
    }),
    error: null,
  };
}

/**
 * Clave de idempotencia para un trabajo de impresión.
 * kind: 'ticket' (venta automática), 'reprint', 'test', 'logo', 'cut', 'diag'.
 * Solo 'ticket' es determinística; el resto lleva un sufijo único porque son
 * acciones explícitas que sí deben imprimir.
 */
export function buildPrintKey(kind, scopeId, { now = Date.now(), nonce = randomNonce() } = {}) {
  const scope = String(scopeId ?? 'sin-negocio');
  if (kind === 'ticket') return `sale:${scope}:ticket`;
  return `${kind}:${scope}:${now}${nonce}`;
}

function randomNonce() {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * Vista del estado del conector para la pantalla. Función pura: nunca
 * decide por QZ.
 * @returns {{ tone: 'ok'|'warn'|'error'|'idle', label: string, canPrint: boolean }}
 */
export function connectorStatusView({ active, paired = false, health, printerName }) {
  if (!active) {
    return { tone: 'idle', label: paired ? 'Pausado' : 'Sin emparejar', canPrint: false };
  }
  if (health === 'checking') return { tone: 'idle', label: 'Verificando conector…', canPrint: false };
  if (health !== 'ok') return { tone: 'error', label: 'Conector no encontrado', canPrint: false };
  if (!printerName) return { tone: 'warn', label: 'Conectado · elige una impresora', canPrint: false };
  return { tone: 'ok', label: 'Conectado', canPrint: true };
}

export const CONNECTOR_TONE_CLASSES = Object.freeze({
  ok: 'bg-emerald-500',
  warn: 'bg-amber-400',
  error: 'bg-rose-400',
  idle: 'bg-slate-300',
});
