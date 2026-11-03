// Cliente Point del TPV. Mismas funciones que crmService (mp-point-*):
//   live       -> crmService, Mercado Pago real (cobro real en la terminal).
//   simulated  -> pointSimulator.js, sin red ni cobro.
//
// Producción: siempre real (nunca se simula).
// Preview / localhost: simulado por defecto. El cajero puede activar Point
// REAL en ESTE navegador con una confirmación explícita (previewRealPoint):
// caduca sola, solo admite ventas pequeñas y nunca habilita la emisión real
// de boletas (el flujo fiscal sigue simulado, ver TpvFiscalAutoBoleta).
//
// VITE_POINT_MODE=live fuerza Point real en Preview para todos los equipos.
// VITE_POINT_MODE=simulated fuera de Preview se ignora.

import * as live from './crmService';
import { isPreviewLike } from './fiscalAutoMode';
import { createPointSimulator } from './pointSimulator';

/** Importe máximo de un cobro Point REAL hecho desde una Preview (CLP). */
export const PREVIEW_REAL_POINT_MAX_AMOUNT = 1000;
/** Cuánto dura la activación de Point real en una Preview. */
export const PREVIEW_REAL_POINT_TTL_MS = 2 * 60 * 60 * 1000;
export const PREVIEW_REAL_POINT_KEY = 'walinka:point-preview-real';

const ENV = import.meta.env || {};
const HOST = typeof window !== 'undefined' ? window.location?.hostname : '';

function defaultStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

/** Activación de Point real en este navegador (solo tiene efecto en Preview). */
export function createPreviewRealPoint({ storage = defaultStorage(), now = () => Date.now(), ttlMs = PREVIEW_REAL_POINT_TTL_MS } = {}) {
  const read = () => {
    try { return JSON.parse(storage?.getItem(PREVIEW_REAL_POINT_KEY)) || null; } catch { return null; }
  };
  return Object.freeze({
    /** null si no está activo o ya caducó. */
    get() {
      const v = read();
      if (!v?.enabledAt || now() - v.enabledAt > ttlMs) return null;
      return { enabledAt: v.enabledAt, expiresAt: v.enabledAt + ttlMs };
    },
    enable() {
      try { storage?.setItem(PREVIEW_REAL_POINT_KEY, JSON.stringify({ enabledAt: now() })); } catch { /* sin almacenamiento */ }
    },
    /** Mantiene activo el modo mientras se usa (no caduca a mitad de un cobro). */
    touch() {
      if (!this.get()) return;
      try { storage?.setItem(PREVIEW_REAL_POINT_KEY, JSON.stringify({ enabledAt: now() })); } catch { /* sin almacenamiento */ }
    },
    disable() {
      try { storage?.removeItem(PREVIEW_REAL_POINT_KEY); } catch { /* sin almacenamiento */ }
    },
  });
}

export const previewRealPoint = createPreviewRealPoint();

/**
 * @param {object} env
 * @param {string} hostname
 * @param {{ realOptIn?: boolean }} [opts]
 */
export function resolvePointMode(env = {}, hostname = '', { realOptIn = false } = {}) {
  const raw = String(env.VITE_POINT_MODE || '').trim().toLowerCase();
  if (raw === 'live') return 'live';
  if (!isPreviewLike(env, hostname)) return 'live';
  return realOptIn ? 'live' : 'simulated';
}

/** ¿Este sitio es una Preview (donde Point real es opcional y limitado)? */
export const POINT_PREVIEW = isPreviewLike(ENV, HOST) && String(ENV.VITE_POINT_MODE || '').trim().toLowerCase() !== 'live';

const NAMES = [
  'startPointOauth', 'getPointConnection', 'disconnectPointConnection', 'getPointTerminals',
  'getPointTerminalPreference', 'selectPointTerminal', 'unlinkPointTerminal', 'verifyPointTerminal',
  'setupPointTerminal', 'createPointOrder', 'getPointOrder', 'cancelPointOrder',
];

function orderAmount({ items = [], discount = 0 } = {}) {
  const sum = items.reduce((a, it) => a + Math.round(Number(it.unit_price || 0) * Number(it.quantity || 0)), 0);
  return sum - Math.round(Number(discount || 0));
}

/**
 * @param {'live'|'simulated'|(() => ('live'|'simulated'))} mode - fijo, o una función que se consulta en cada llamada
 * @param {{ simulator?: object, liveApi?: object, previewLimit?: boolean | (() => boolean), maxAmount?: number }} [opts]
 */
export function createPointClient(mode, { simulator, liveApi = live, previewLimit = false, maxAmount = PREVIEW_REAL_POINT_MAX_AMOUNT, onLiveCall } = {}) {
  const currentMode = typeof mode === 'function' ? mode : () => mode;
  const limited = typeof previewLimit === 'function' ? previewLimit : () => previewLimit;
  let sim = simulator || null;
  const simApi = () => (sim ||= createPointSimulator({ businessId: 'preview' }));

  const api = {};
  for (const name of NAMES) {
    api[name] = async (...args) => {
      if (currentMode() === 'simulated') return simApi()[name](...args);
      onLiveCall?.();
      if (name === 'createPointOrder' && limited()) {
        const amount = orderAmount(args[0]);
        if (amount > maxAmount) {
          return {
            data: null,
            error: {
              message: `Point real en Preview admite cobros de hasta $${maxAmount.toLocaleString('es-CL')}. Este cobro es de $${amount.toLocaleString('es-CL')}: no se envió a la terminal.`,
              reason: 'PREVIEW_REAL_POINT_LIMIT',
              status: null,
            },
          };
        }
      }
      return liveApi[name](...args);
    };
  }
  return Object.freeze({
    get mode() { return currentMode(); },
    ...api,
  });
}

export function currentPointMode() {
  return resolvePointMode(ENV, HOST, { realOptIn: Boolean(previewRealPoint.get()) });
}

export const pointClient = createPointClient(currentPointMode, {
  previewLimit: () => POINT_PREVIEW && currentPointMode() === 'live',
  onLiveCall: () => { if (POINT_PREVIEW) previewRealPoint.touch(); },
});
