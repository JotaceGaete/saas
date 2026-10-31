// node:test: `node --test src/lib/cash/cashMovementActions.test.js`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canReprintMovement, buildReprintKey, reprintBlockedMessage } from './cashMovementActions.js';

const posPayment = {
  _row_kind: 'payment', id: 10, invoice_id: 956, voided_at: null, invoice: { source: 'pos' },
};
const KEY_PATTERN = /^[A-Za-z0-9:_\-]{8,128}$/;

test('cobro de venta TPV válida: se puede reimprimir', () => {
  assert.equal(canReprintMovement(posPayment), true);
});

test('la visibilidad no depende del estado de la caja (la función no recibe ese dato)', () => {
  // Caja abierta y cerrada usan el mismo entry: el resultado es idéntico.
  assert.equal(canReprintMovement({ ...posPayment }), canReprintMovement({ ...posPayment }));
  assert.equal(canReprintMovement.length, 1, 'un solo parámetro: el movimiento');
});

test('venta anulada no se reimprime', () => {
  assert.equal(canReprintMovement({ ...posPayment, voided_at: '2026-10-31T10:00:00Z' }), false);
});

test('movimiento manual nunca tiene ticket: no se reimprime', () => {
  assert.equal(canReprintMovement({ _row_kind: 'movement', id: 5, invoice_id: null }), false);
});

test('cobro sin invoice_id no se reimprime', () => {
  assert.equal(canReprintMovement({ ...posPayment, invoice_id: null }), false);
});

test('abono a cuenta corriente o pedido de catálogo (source crm) no se reimprime', () => {
  assert.equal(canReprintMovement({ ...posPayment, invoice: { source: 'crm' } }), false);
});

test('cobro sin datos de factura cargados no se reimprime (no se adivina)', () => {
  assert.equal(canReprintMovement({ _row_kind: 'payment', id: 1, invoice_id: 9 }), false);
  assert.equal(canReprintMovement(null), false);
});

test('clave de reimpresión: cada clic genera una clave distinta y válida', () => {
  const a = buildReprintKey(956, { now: 1000, nonce: 'aaaa1111' });
  const b = buildReprintKey(956, { now: 1000, nonce: 'bbbb2222' });
  const c = buildReprintKey(956, { now: 1001, nonce: 'aaaa1111' });
  assert.notEqual(a, b);
  assert.notEqual(a, c);
  for (const key of [a, b, c, buildReprintKey(956)]) assert.match(key, KEY_PATTERN);
});

test('clave de reimpresión: sin id de venta se rechaza', () => {
  assert.throws(() => buildReprintKey(null), /falta el id/);
  assert.throws(() => buildReprintKey(''), /falta el id/);
});

test('mensaje sin impresora: con conector activo no sugiere QZ', () => {
  const msg = reprintBlockedMessage({ route: 'local-connector' });
  assert.match(msg, /Walinka Print Connector/);
  assert.doesNotMatch(msg, /QZ/);
});

test('mensaje sin impresora: ruta QZ indica configurar impresora', () => {
  assert.match(reprintBlockedMessage({ route: 'qz' }), /impresora configurada/);
});
