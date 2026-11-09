// Emisión con dos claves maestras (almacén en memoria). Las credenciales existentes (v1) siguen
// emitiendo igual; las nuevas (v2) solo si la V2 está configurada y verificada. Sin clave para la
// versión: CREDENTIAL_KEY_UNAVAILABLE ANTES de reclamar la venta, cero llamadas al proveedor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createFiscalEmitter } from '../../lib/emit.mjs';
import { createSimulatedProvider } from '../../lib/providers/simulated.mjs';
import { buildKeyring, keyCheckValue, seal } from '../../lib/secrets.mjs';
import { createMemoryStore, IDS } from '../helpers/memory-store.mjs';
import { TEST_ALLOW_ALL } from '../helpers/allowlist.mjs';

const K1 = randomBytes(32);
const K2 = randomBytes(32);
const ROW_A = `${IDS.bizA}|${IDS.saleA}`;
const ring = (withV2) => buildKeyring({
  v1: K1.toString('base64'),
  ...(withV2 ? { v2: K2.toString('base64'), v2Kcv: keyCheckValue(K2) } : {}),
});

function setup({ credVersion = 1, withV2 = true } = {}) {
  const store = createMemoryStore({ masterKey: K1 });
  store.seed({ businessId: IDS.bizA, userId: IDS.userA, saleId: IDS.saleA });
  if (credVersion === 2) {
    store.creds.set(IDS.bizA, seal({ apiKey: 'NUEVA-V2' }, { key: K2, businessId: IDS.bizA, keyVersion: 2 }));
    store.markRutConfirmed(IDS.bizA);
  }
  const provider = createSimulatedProvider({ scenario: 'ok', delayMs: 1 });
  let seenKey = null;
  const spy = { ...provider, emit: async (args) => { seenKey = args.credentials.apiKey; return provider.emit(args); } };
  const emitter = createFiscalEmitter({ allowedIssuers: TEST_ALLOW_ALL, store, provider: spy, keyring: ring(withV2), timeoutMs: 200 });
  return { store, provider, emitter, seen: () => seenKey };
}

test('credencial existente (v1): emite igual con o sin V2 configurada', async () => {
  for (const withV2 of [false, true]) {
    const { emitter, provider, seen } = setup({ credVersion: 1, withV2 });
    const r = await emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA });
    assert.equal(r.status, 'issued', `withV2=${withV2}`);
    assert.equal(provider.calls, 1);
    assert.equal(seen(), `TEST-KEY-${IDS.bizA}`);
  }
});

test('credencial nueva (v2) con la V2 verificada: emite con la API key correcta', async () => {
  const { emitter, provider, seen } = setup({ credVersion: 2, withV2: true });
  const r = await emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA });
  assert.equal(r.status, 'issued');
  assert.equal(provider.calls, 1);
  assert.equal(seen(), 'NUEVA-V2');
});

test('credencial v2 sin V2 configurada: CREDENTIAL_KEY_UNAVAILABLE antes de reclamar; sin fila ni proveedor', async () => {
  const { store, emitter, provider } = setup({ credVersion: 2, withV2: false });
  await assert.rejects(emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA }), { code: 'CREDENTIAL_KEY_UNAVAILABLE' });
  assert.equal(provider.calls, 0);
  const row = store.issuances.get(ROW_A);
  assert.ok(!row || row.status === 'pending', 'la venta no queda reclamada');
});

test('versión desconocida (3): CREDENTIAL_KEY_UNAVAILABLE, nunca se prueba otra clave', async () => {
  const { store, emitter, provider } = setup({ credVersion: 1, withV2: true });
  const rec = store.creds.get(IDS.bizA);
  store.creds.set(IDS.bizA, { ...rec, keyVersion: 3 });
  // Cambiar la versión cambia la huella de la credencial: se simula que el dueño reconfirmó el RUT
  // para llegar al caso que interesa (sin clave para la versión 3).
  store.markRutConfirmed(IDS.bizA);
  await assert.rejects(emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA }), { code: 'CREDENTIAL_KEY_UNAVAILABLE' });
  assert.equal(provider.calls, 0);
});

test('la credencial cambia a v2 entre la verificación y el reclamo: se libera el reclamo con CREDENTIAL_KEY_UNAVAILABLE', async () => {
  const { store, emitter, provider } = setup({ credVersion: 1, withV2: false });
  const original = store.loadCredentialRecord;
  let first = true;
  // La verificación previa ve la v1; el reclamo ya ve una v2 (otra pestaña guardó una API key nueva).
  store.loadCredentialRecord = async (b) => {
    const r = await original(b);
    if (first) { first = false; store.creds.set(IDS.bizA, seal({ apiKey: 'NUEVA-V2' }, { key: K2, businessId: IDS.bizA, keyVersion: 2 })); store.markRutConfirmed(IDS.bizA); }
    return r;
  };
  await assert.rejects(emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA }), { code: 'CREDENTIAL_KEY_UNAVAILABLE' });
  assert.equal(provider.calls, 0);
  assert.equal(store.issuances.get(ROW_A).status, 'pending', 'reclamo liberado');
});

test('estado: con credencial v2 y sin V2, canEmit=false, motivo CREDENTIAL_KEY_UNAVAILABLE y sin modo real', async () => {
  const { emitter } = setup({ credVersion: 2, withV2: false });
  const st = await emitter.status({ actorUserId: IDS.userA, saleId: IDS.saleA });
  assert.equal(st.canEmit, false);
  assert.equal(st.blockedReason, 'CREDENTIAL_KEY_UNAVAILABLE');
  assert.equal(st.liveAuthorized, false);
  const ok = await setup({ credVersion: 2, withV2: true }).emitter.status({ actorUserId: IDS.userA, saleId: IDS.saleA });
  assert.equal(ok.blockedReason === 'CREDENTIAL_KEY_UNAVAILABLE', false);
});

test('compatibilidad: sin llavero explícito, masterKey sola se comporta como antes (solo v1)', async () => {
  const store = createMemoryStore({ masterKey: K1 });
  store.seed({ businessId: IDS.bizA, userId: IDS.userA, saleId: IDS.saleA });
  const provider = createSimulatedProvider({ scenario: 'ok', delayMs: 1 });
  const emitter = createFiscalEmitter({ allowedIssuers: TEST_ALLOW_ALL, store, provider, masterKey: K1, timeoutMs: 200 });
  assert.equal((await emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA })).status, 'issued');
  assert.throws(() => createFiscalEmitter({ allowedIssuers: TEST_ALLOW_ALL, store, provider }), { code: 'MASTER_KEY_MISSING' });
});
