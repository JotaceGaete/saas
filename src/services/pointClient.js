// Cliente Point del TPV. Mismas funciones que crmService (mp-point-*):
//   live       -> crmService, Mercado Pago real (cobro real en la terminal).
//   simulated  -> pointSimulator.js, sin red ni cobro. Solo en Preview o
//                 localhost; en un dominio de producción nunca se activa.
//
// VITE_POINT_MODE=live fuerza Point real también en Preview (solo con
// autorización explícita para cobrar de verdad). VITE_POINT_MODE=simulated
// fuera de Preview se ignora.

import * as live from './crmService';
import { isPreviewLike } from './fiscalAutoMode';
import { createPointSimulator } from './pointSimulator';

export function resolvePointMode(env = {}, hostname = '') {
  const raw = String(env.VITE_POINT_MODE || '').trim().toLowerCase();
  if (raw === 'live') return 'live';
  return isPreviewLike(env, hostname) ? 'simulated' : 'live';
}

export const POINT_MODE = resolvePointMode(
  import.meta.env || {},
  typeof window !== 'undefined' ? window.location?.hostname : '',
);

const NAMES = [
  'startPointOauth', 'getPointConnection', 'disconnectPointConnection', 'getPointTerminals',
  'getPointTerminalPreference', 'selectPointTerminal', 'unlinkPointTerminal', 'verifyPointTerminal',
  'setupPointTerminal', 'createPointOrder', 'getPointOrder', 'cancelPointOrder',
];

export function createPointClient(mode = POINT_MODE, { simulator } = {}) {
  if (mode !== 'simulated') {
    return Object.freeze({ mode: 'live', ...Object.fromEntries(NAMES.map((n) => [n, live[n]])) });
  }
  const sim = simulator || createPointSimulator({ businessId: 'preview' });
  return Object.freeze({ mode: 'simulated', ...Object.fromEntries(NAMES.map((n) => [n, (...a) => sim[n](...a)])) });
}

export const pointClient = createPointClient();
