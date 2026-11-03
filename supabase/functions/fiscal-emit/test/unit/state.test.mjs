import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertTransition, canTransition, isAutoRetryable } from '../../lib/state.mjs';

test('transiciones legales del ledger', () => {
  assert.equal(assertTransition('pending', 'sending', 'claim'), true);
  assert.equal(assertTransition('sending', 'issued', 'provider'), true);
  assert.equal(assertTransition('sending', 'unknown', 'provider'), true);
  assert.equal(assertTransition('sending', 'failed', 'provider'), true);
  assert.equal(assertTransition('sending', 'issued', 'recovery'), true);
  assert.equal(assertTransition('sending', 'unknown', 'recovery'), true);
  assert.equal(assertTransition('unknown', 'issued', 'reconcile'), true);
  assert.equal(assertTransition('unknown', 'failed', 'reconcile'), true);
  assert.equal(assertTransition('issued', 'cancelled', 'credit_note'), true);
});

test('ilegales: no hay vuelta desde sending a pending ni salida de terminales', () => {
  assert.equal(canTransition('sending', 'pending'), false);
  assert.equal(canTransition('issued', 'failed'), false);
  assert.equal(canTransition('failed', 'sending'), false);
  assert.equal(canTransition('cancelled', 'issued'), false);
});

test('sending -> failed nunca por recuperación: la recuperación no asume rechazo', () => {
  assert.throws(() => assertTransition('sending', 'failed', 'recovery'), { code: 'ILLEGAL_TRANSITION' });
});

test('unknown -> sending nunca es posible (no reintento automático)', () => {
  assert.equal(canTransition('unknown', 'sending'), false);
  assert.throws(() => assertTransition('unknown', 'sending', 'claim'), { code: 'ILLEGAL_TRANSITION' });
});

test('unknown -> issued solo por reconciliación, nunca por proveedor ni recuperación', () => {
  assert.throws(() => assertTransition('unknown', 'issued', 'provider'), { code: 'ILLEGAL_TRANSITION' });
  assert.throws(() => assertTransition('unknown', 'issued', 'recovery'), { code: 'ILLEGAL_TRANSITION' });
});

test('issued -> cancelled solo por nota de crédito', () => {
  assert.throws(() => assertTransition('issued', 'cancelled', 'provider'), { code: 'ILLEGAL_TRANSITION' });
});

test('solo pending se reintenta automáticamente', () => {
  assert.equal(isAutoRetryable('pending'), true);
  for (const s of ['sending', 'unknown', 'issued', 'failed', 'cancelled']) assert.equal(isAutoRetryable(s), false, s);
});
