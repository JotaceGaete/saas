import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRecoveryHttpHandler } from '../../lib/recovery-http.mjs';

const secret = 'test-only-recovery-secret-at-least-32-characters';
function setup(enabled = true) {
  let calls = 0;
  const recovery = { recoverStaleSending: async () => { calls++; return { examined: 0, markedUnknown: 0 }; } };
  return { handle: createRecoveryHttpHandler({ recovery, secret, enabled }), calls: () => calls };
}
const request = (method, token) => new Request('https://internal.test/recover', {
  method, headers: token ? { authorization: `Bearer ${token}` } : {},
});
test('recuperación HTTP deshabilitada por defecto: nunca toca la base', async () => {
  const s = setup(false);
  assert.equal((await s.handle(request('POST', secret))).status, 503);
  assert.equal(s.calls(), 0);
});
test('sin secreto correcto: 401 y ninguna recuperación', async () => {
  const s = setup();
  assert.equal((await s.handle(request('POST'))).status, 401);
  assert.equal((await s.handle(request('POST', 'wrong'))).status, 401);
  assert.equal(s.calls(), 0);
});
test('GET nunca ejecuta recuperación', async () => {
  const s = setup();
  assert.equal((await s.handle(request('GET', secret))).status, 405);
  assert.equal(s.calls(), 0);
});
test('POST autorizado ejecuta una sola recuperación sin proveedor', async () => {
  const s = setup();
  const r = await s.handle(request('POST', secret));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).examined, 0);
  assert.equal(s.calls(), 1);
});
test('errores internos no filtran detalles', async () => {
  const handle = createRecoveryHttpHandler({
    recovery: { recoverStaleSending: async () => { throw new Error('database secret detail'); } },
    secret, enabled: true,
  });
  const r = await handle(request('POST', secret));
  assert.equal(r.status, 503);
  assert.deepEqual(await r.json(), { error: 'RECOVERY_UNAVAILABLE' });
});
