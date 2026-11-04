// Cliente Point del TPV. Mismas funciones que crmService (mp-point-*):
//   live       -> crmService, Mercado Pago real (cobro real en la terminal).
//   simulated  -> pointSimulator.js, sin red ni cobro (modo DEMO).
//
// Producción: siempre real (nunca se simula).
// Preview / localhost: REAL por defecto, con dos límites: cobros de hasta
// PREVIEW_REAL_POINT_MAX_AMOUNT y boleta siempre SIMULADA (sin DTE Core ni
// SII, ver TpvFiscalAutoBoleta). El simulador solo se usa si el cajero
// activa el modo DEMO en su navegador; caduca solo y se rotula en pantalla.
//
// VITE_POINT_MODE=simulated hace DEMO por defecto en Preview; fuera de
// Preview se ignora.

import * as live from './crmService';
import { isPreviewLike } from '../lib/deployEnv';
import { createPointSimulator } from './pointSimulator';

/** Importe máximo de un cobro Point REAL hecho desde una Preview (CLP). */
export const PREVIEW_REAL_POINT_MAX_AMOUNT = 1000;
/** Cuánto dura el modo DEMO (Point simulada) en una Preview. */
export const PREVIEW_POINT_DEMO_TTL_MS = 2 * 60 * 60 * 1000;
export const PREVIEW_POINT_DEMO_KEY = 'walinka:point-preview-demo';
// Clave de la versión anterior (Point real como opción). Ya no se usa.
const LEGACY_REAL_OPT_IN_KEY = 'walinka:point-preview-real';

const ENV = import.meta.env || {};
const HOST = typeof window !== 'undefined' ? window.location?.hostname : '';

function defaultStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

/** Modo DEMO (Point simulada) en este navegador. Solo tiene efecto en Preview. */
export function createPreviewPointDemo({ storage = defaultStorage(), now = () => Date.now(), ttlMs = PREVIEW_POINT_DEMO_TTL_MS } = {}) {
  try { storage?.removeItem(LEGACY_REAL_OPT_IN_KEY); } catch { /* sin almacenamiento */ }
  const read = () => {
    try { return JSON.parse(storage?.getItem(PREVIEW_POINT_DEMO_KEY)) || null; } catch { return null; }
  };
  const write = () => {
    try { storage?.setItem(PREVIEW_POINT_DEMO_KEY, JSON.stringify({ enabledAt: now() })); } catch { /* sin almacenamiento */ }
  };
  const api = {
    /** null si no está activo o ya caducó. */
    get() {
      const v = read();
      if (!v?.enabledAt || now() - v.enabledAt > ttlMs) return null;
      return { enabledAt: v.enabledAt, expiresAt: v.enabledAt + ttlMs };
    },
    enable: write,
    /** Mantiene el modo mientras se usa (no cambia a mitad de un cobro simulado). */
    touch() { if (api.get()) write(); },
    disable() {
      try { storage?.removeItem(PREVIEW_POINT_DEMO_KEY); } catch { /* sin almacenamiento */ }
    },
  };
  return Object.freeze(api);
}

export const previewPointDemo = createPreviewPointDemo();

/**
 * @param {object} env
 * @param {string} hostname
 * @param {{ demoOptIn?: boolean }} [opts]
 */
export function resolvePointMode(env = {}, hostname = '', { demoOptIn = false } = {}) {
  if (!isPreviewLike(env, hostname)) return 'live';
  const raw = String(env.VITE_POINT_MODE || '').trim().toLowerCase();
  if (raw === 'simulated') return 'simulated';
  return demoOptIn ? 'simulated' : 'live';
}

/** ¿Este sitio es una Preview (Point real limitado, demo opcional)? */
export const POINT_PREVIEW = isPreviewLike(ENV, HOST);

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
export function createPointClient(mode, { simulator, liveApi = live, previewLimit = false, maxAmount = PREVIEW_REAL_POINT_MAX_AMOUNT, onSimulatedCall } = {}) {
  const currentMode = typeof mode === 'function' ? mode : () => mode;
  const limited = typeof previewLimit === 'function' ? previewLimit : () => previewLimit;
  let sim = simulator || null;
  const simApi = () => (sim ||= createPointSimulator({ businessId: 'preview' }));

  const api = {};
  for (const name of NAMES) {
    api[name] = async (...args) => {
      if (currentMode() === 'simulated') {
        onSimulatedCall?.();
        return simApi()[name](...args);
      }
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
  return resolvePointMode(ENV, HOST, { demoOptIn: POINT_PREVIEW && Boolean(previewPointDemo.get()) });
}

export const pointClient = createPointClient(currentPointMode, {
  previewLimit: () => POINT_PREVIEW && currentPointMode() === 'live',
  onSimulatedCall: () => previewPointDemo.touch(),
});
