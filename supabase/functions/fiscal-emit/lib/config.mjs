// Configuración operativa del emisor, leída del entorno. Valores por defecto seguros.
//
// FISCAL_STALE_AFTER_MS: antigüedad (ms) a partir de la cual una fila 'sending' se considera vencida
//   y puede pasar a finalizarse desde recibo o a 'unknown'. Por defecto 15 minutos.
//   Debe ser mucho mayor que el tiempo máximo de una emisión en curso (timeout del proveedor + reintentos).
//   Límites: entre 5 minutos (MIN) y 24 horas (MAX). Fuera de rango, el arranque falla.

export const DEFAULT_STALE_AFTER_MS = 15 * 60_000;
export const MIN_STALE_AFTER_MS = 5 * 60_000;
export const MAX_STALE_AFTER_MS = 24 * 60 * 60_000;

export function readRecoveryConfig(env = {}) {
  const raw = env.FISCAL_STALE_AFTER_MS;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return Object.freeze({ staleAfterMs: DEFAULT_STALE_AFTER_MS, source: 'default' });
  }
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) {
    throw new Error('FISCAL_STALE_AFTER_MS must be a whole number of milliseconds');
  }
  const value = Number(text);
  if (value < MIN_STALE_AFTER_MS || value > MAX_STALE_AFTER_MS) {
    throw new Error(`FISCAL_STALE_AFTER_MS must be between ${MIN_STALE_AFTER_MS} and ${MAX_STALE_AFTER_MS}`);
  }
  return Object.freeze({ staleAfterMs: value, source: 'env' });
}
