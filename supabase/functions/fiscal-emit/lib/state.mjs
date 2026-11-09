// Máquina de estados única del ledger fiscal (crm_fiscal_issuances).
// Cada transición lista qué "vía" puede pedirla. Cualquier otra combinación es ilegal.

import { FiscalError } from './errors.mjs';

export const STATES = Object.freeze(['pending', 'sending', 'unknown', 'issued', 'failed', 'cancelled']);

// from -> to -> vías permitidas
const ALLOWED = Object.freeze({
  pending: { sending: ['claim'] },
  sending: {
    issued: ['provider', 'recovery'], // recovery: finalizar desde recibo guardado, sin proveedor
    unknown: ['provider', 'recovery'], // recovery: vencido sin recibo; nunca reintenta
    failed: ['provider'], // solo rechazo explícito del proveedor
  },
  unknown: { issued: ['reconcile'], failed: ['reconcile'] },
  issued: { cancelled: ['credit_note'] },
  failed: {},
  cancelled: {},
});

export function canTransition(from, to) {
  return Object.hasOwn(ALLOWED[from] ?? {}, to);
}

export function assertTransition(from, to, via) {
  if (!canTransition(from, to)) {
    throw new FiscalError('ILLEGAL_TRANSITION', `illegal transition ${from} -> ${to}`);
  }
  if (!ALLOWED[from][to].includes(via)) {
    throw new FiscalError('ILLEGAL_TRANSITION', `transition ${from} -> ${to} not allowed via ${via}`);
  }
  return true;
}

// Un estado 'unknown' o 'sending' nunca se reintenta automáticamente con el proveedor.
export function isAutoRetryable(state) {
  return state === 'pending';
}
