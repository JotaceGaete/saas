// Máquina de estados única del ledger fiscal (crm_fiscal_issuances).
// Espejo de F1 §2.2. Cualquier transición no listada es ilegal.

import { FiscalError } from './errors.mjs';

export const STATES = Object.freeze(['pending', 'sending', 'unknown', 'issued', 'failed', 'cancelled']);

const TRANSITIONS = Object.freeze({
  pending: ['sending'],
  sending: ['issued', 'unknown', 'failed'],
  unknown: ['issued', 'failed'], // solo vía reconciliación manual
  issued: ['cancelled'], // solo vía nota de crédito
  failed: [],
  cancelled: [],
});

export function canTransition(from, to) {
  return (TRANSITIONS[from] ?? []).includes(to);
}

// `via` identifica quién pide la transición:
//   'claim'        pending -> sending
//   'provider'     sending -> issued | unknown | failed
//   'reconcile'    unknown -> issued | failed (con evidencia)
//   'credit_note'  issued -> cancelled
export function assertTransition(from, to, via) {
  if (!canTransition(from, to)) {
    throw new FiscalError('ILLEGAL_TRANSITION', `illegal transition ${from} -> ${to}`);
  }
  const allowed = {
    pending: 'claim',
    sending: 'provider',
    unknown: 'reconcile',
    issued: 'credit_note',
  }[from];
  if (via !== allowed) {
    throw new FiscalError('ILLEGAL_TRANSITION', `transition ${from} -> ${to} not allowed via ${via}`);
  }
  return true;
}

// Un estado 'unknown' o 'sending' nunca se reintenta automáticamente.
export function isAutoRetryable(state) {
  return state === 'pending';
}
