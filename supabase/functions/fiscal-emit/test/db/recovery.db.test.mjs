// Recuperación, recibos y roles contra Postgres real (walinka_test). Ejecuta la migración propuesta.
// Los fallos de transporte se inyectan en el almacén (no en la base); el estado que queda en la
// base es el real. Nunca apunta a producción: createPgStore lo impide.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createPgStore, assertLocalTestConfig } from '../../lib/store-pg.mjs';
import { createFiscalEmitter } from '../../lib/emit.mjs';
import { createRecovery } from '../../lib/recovery.mjs';
import { createSimulatedProvider } from '../../lib/providers/simulated.mjs';
import { CFG, TEST_MASTER_KEY, makeFixture, otherUser, setEmissionControl } from './fixtures.mjs';
import { TEST_ALLOW_ALL } from '../helpers/allowlist.mjs';

let c;
let store;
let savedControl;

before(async () => {
  c = new pg.Client(assertLocalTestConfig(CFG));
  await c.connect();
  const r = await c.query(`select enabled from fiscal.dte39_emission_control where singleton`);
  savedControl = r.rows[0]?.enabled ?? false;
  await setEmissionControl(c, true);
  store = createPgStore(CFG);
});

after(async () => {
  await setEmissionControl(c, savedControl);
  await store.end();
  await c.end();
});

const DOC = { folio: 4300, xmlBase64: 'PHhtbD4=', pdfBase64: 'JVBERi0xLjQK' };

async function row(businessId, saleId) {
  const r = await c.query(
    `select status, folio, error_code from public.crm_fiscal_issuances
      where business_id = $1 and sale_id = $2 and dte_type = 39`,
    [businessId, saleId],
  );
  return r.rows[0] ?? null;
}

// Deja la fila como vencida (updated_at hace una hora). Solo en pruebas.
async function ageRow(businessId, saleId) {
  await c.query(
    `update public.crm_fiscal_issuances set updated_at = now() - interval '1 hour'
      where business_id = $1 and sale_id = $2 and dte_type = 39`,
    [businessId, saleId],
  );
}

// Almacén real con fallos de transporte inyectados en métodos concretos.
// failures: { metodo: veces } -> el método lanza error de red antes de tocar la base.
function failingStore(failures) {
  const left = { ...failures };
  return new Proxy(store, {
    get(target, prop) {
      if (typeof prop === 'string' && (left[prop] ?? 0) > 0) {
        return async (...args) => {
          left[prop] -= 1;
          throw new Error('connection reset by peer');
        };
      }
      const v = target[prop];
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
}

// Limita la recuperación a los negocios de la prueba (las demás pruebas comparten la base).
function scopedStore(businessIds) {
  const mine = new Set(businessIds);
  return new Proxy(store, {
    get(target, prop) {
      if (prop === 'listStaleSending') {
        return async (before) => (await target.listStaleSending(before)).filter((r) => mine.has(r.businessId));
      }
      const v = target[prop];
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
}

const STALE_MS = 10 * 60_000;
const before30 = () => new Date(Date.now() - 30 * 60_000);

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

test('roles: el dueño recibe fiscal_owner al crearse el negocio (trigger); un no miembro no tiene rol', async () => {
  const f = await makeFixture(c);
  const seeded = await c.query(
    `select role from fiscal.business_fiscal_roles where business_id = $1 and user_id = $2 and revoked_at is null`,
    [f.businessId, f.userId],
  );
  assert.deepEqual(seeded.rows.map((r) => r.role), ['fiscal_owner']);
  assert.equal(await store.loadActorRole(f.businessId, f.userId), 'fiscal_owner');
  assert.equal(await store.loadActorRole(f.businessId, await otherUser(c)), null);
});

test('roles: revocar la fila quita el acceso aunque el usuario sea wa_businesses.user_id', async () => {
  const f = await makeFixture(c);
  await c.query(
    `update fiscal.business_fiscal_roles set revoked_at = now() where business_id = $1 and user_id = $2`,
    [f.businessId, f.userId],
  );
  assert.equal(await store.loadActorRole(f.businessId, f.userId), null);
});

test('roles: negocio inactivo no concede rol aunque la fila exista', async () => {
  const f = await makeFixture(c);
  await c.query(`update public.wa_businesses set is_active = false where id = $1`, [f.businessId]);
  try {
    assert.equal(await store.loadActorRole(f.businessId, f.userId), null);
  } finally {
    await c.query(`update public.wa_businesses set is_active = true where id = $1`, [f.businessId]);
  }
});

test('roles: fiscal_viewer no emite (FISCAL_ROLE_REQUIRED), pero sí reimprime', async () => {
  const f = await makeFixture(c);
  const emitter = createFiscalEmitter({ allowedIssuers: TEST_ALLOW_ALL, store, provider: createSimulatedProvider({ scenario: 'ok' }), masterKey: TEST_MASTER_KEY });
  await emitter.emitSale({ actorUserId: f.userId, saleId: f.saleId });
  await c.query(`update fiscal.business_fiscal_roles set revoked_at = now() where business_id = $1 and user_id = $2`, [f.businessId, f.userId]);
  await c.query(
    `insert into fiscal.business_fiscal_roles (business_id, user_id, role) values ($1, $2, 'fiscal_viewer')`,
    [f.businessId, f.userId],
  );
  await assert.rejects(emitter.emitSale({ actorUserId: f.userId, saleId: f.saleId }), { code: 'FISCAL_ROLE_REQUIRED' });
  const r = await emitter.reprint({ actorUserId: f.userId, saleId: f.saleId });
  assert.equal(r.folio, 1000);
});

test('permisos: anon y authenticated no pueden ejecutar las funciones de rol, recibo ni recuperación', async () => {
  const f = await makeFixture(c);
  const calls = [
    { sql: `select public.crm_fiscal_actor_role($1, $2)`, params: [f.businessId, f.saleId] },
    { sql: `select public.crm_fiscal_store_receipt($1, $2, 'op', 1, 'PHhtbD4=', 'JVBERi0xLjQK')`, params: [f.businessId, f.saleId] },
    { sql: `select public.crm_fiscal_list_stale_sending(now())`, params: [] },
    { sql: `select public.crm_fiscal_finalize_from_receipt($1, $2, 'op')`, params: [f.businessId, f.saleId] },
    { sql: `select public.crm_fiscal_mark_stale_unknown($1, $2, 'op', now())`, params: [f.businessId, f.saleId] },
  ];
  for (const role of ['anon', 'authenticated']) {
    for (const { sql, params } of calls) {
      await c.query('begin');
      try {
        await c.query(`set local role ${role}`);
        await assert.rejects(c.query(sql, params), { code: '42501' }, `${role}: ${sql}`);
      } finally {
        await c.query('rollback');
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Recibos (write-ahead)
// ---------------------------------------------------------------------------

test('recibo: exige fila en sending, es idempotente con el mismo contenido y rechaza contenido distinto', async () => {
  const f = await makeFixture(c);
  await assert.rejects(store.storeReceipt(f.businessId, f.saleId, f.operationId, DOC), { code: 'FISCAL_NOT_SENDING' });
  assert.equal(await store.claim(f.businessId, f.saleId, f.operationId), true);
  assert.equal(await store.storeReceipt(f.businessId, f.saleId, f.operationId, DOC), true);
  assert.equal(await store.storeReceipt(f.businessId, f.saleId, f.operationId, DOC), true);
  await assert.rejects(store.storeReceipt(f.businessId, f.saleId, f.operationId, { ...DOC, folio: 4301 }), { code: 'FISCAL_RECEIPT_CONFLICT' });
});

test('recibo: solo-anexar (UPDATE y DELETE fallan)', async () => {
  const f = await makeFixture(c);
  await store.claim(f.businessId, f.saleId, f.operationId);
  await store.storeReceipt(f.businessId, f.saleId, f.operationId, DOC);
  await assert.rejects(c.query(`update fiscal.crm_fiscal_provider_receipts set folio = 1 where sale_id = $1`, [f.saleId]), { message: /FISCAL_EVIDENCE_IMMUTABLE/ });
  await assert.rejects(c.query(`delete from fiscal.crm_fiscal_provider_receipts where sale_id = $1`, [f.saleId]), { message: /FISCAL_EVIDENCE_IMMUTABLE/ });
});

// ---------------------------------------------------------------------------
// Recuperación
// ---------------------------------------------------------------------------

test('finalize_from_receipt: con recibo completa a issued sin proveedor; sin recibo devuelve false', async () => {
  const withReceipt = await makeFixture(c);
  await store.claim(withReceipt.businessId, withReceipt.saleId, withReceipt.operationId);
  await store.storeReceipt(withReceipt.businessId, withReceipt.saleId, withReceipt.operationId, DOC);
  assert.equal(await store.finalizeFromReceipt(withReceipt.businessId, withReceipt.saleId, withReceipt.operationId), true);
  const r = await row(withReceipt.businessId, withReceipt.saleId);
  assert.equal(r.status, 'issued');
  assert.equal(r.folio, 4300);

  const without = await makeFixture(c);
  await store.claim(without.businessId, without.saleId, without.operationId);
  assert.equal(await store.finalizeFromReceipt(without.businessId, without.saleId, without.operationId), false);
  assert.equal((await row(without.businessId, without.saleId)).status, 'sending');
});

test('mark_stale_unknown: vencida sin recibo -> unknown; con recibo -> nunca; reciente -> nunca', async () => {
  const stale = await makeFixture(c);
  await store.claim(stale.businessId, stale.saleId, stale.operationId);
  await ageRow(stale.businessId, stale.saleId);
  assert.equal(await store.markStaleUnknown(stale.businessId, stale.saleId, stale.operationId, before30()), true);
  const u = await row(stale.businessId, stale.saleId);
  assert.equal(u.status, 'unknown');
  assert.equal(u.error_code, 'STALE_SENDING');
  assert.equal(u.folio, null);

  const withReceipt = await makeFixture(c);
  await store.claim(withReceipt.businessId, withReceipt.saleId, withReceipt.operationId);
  await store.storeReceipt(withReceipt.businessId, withReceipt.saleId, withReceipt.operationId, DOC);
  await ageRow(withReceipt.businessId, withReceipt.saleId);
  assert.equal(await store.markStaleUnknown(withReceipt.businessId, withReceipt.saleId, withReceipt.operationId, before30()), false);
  assert.equal((await row(withReceipt.businessId, withReceipt.saleId)).status, 'sending');

  const fresh = await makeFixture(c);
  await store.claim(fresh.businessId, fresh.saleId, fresh.operationId);
  assert.equal(await store.markStaleUnknown(fresh.businessId, fresh.saleId, fresh.operationId, before30()), false);
});

test('list_stale_sending: indica qué filas vencidas tienen recibo', async () => {
  const a = await makeFixture(c);
  await store.claim(a.businessId, a.saleId, a.operationId);
  await ageRow(a.businessId, a.saleId);
  const b = await makeFixture(c);
  await store.claim(b.businessId, b.saleId, b.operationId);
  await store.storeReceipt(b.businessId, b.saleId, b.operationId, DOC);
  await ageRow(b.businessId, b.saleId);

  const rows = await store.listStaleSending(before30());
  const ra = rows.find((r) => r.saleId === a.saleId);
  const rb = rows.find((r) => r.saleId === b.saleId);
  assert.equal(ra.hasReceipt, false);
  assert.equal(rb.hasReceipt, true);
});

test('extremo a extremo: fallo al finalizar -> PERSIST_PENDING_RECOVERY; recuperación desde recibo; cero llamadas al proveedor', async () => {
  const f = await makeFixture(c);
  const provider = createSimulatedProvider({ scenario: 'ok' });
  const emitter = createFiscalEmitter({ allowedIssuers: TEST_ALLOW_ALL, store: failingStore({ finalize: 99 }), provider, masterKey: TEST_MASTER_KEY, timeoutMs: 1000 });
  await assert.rejects(emitter.emitSale({ actorUserId: f.userId, saleId: f.saleId }), { code: 'PERSIST_PENDING_RECOVERY' });
  assert.equal(provider.calls, 1);
  assert.equal((await row(f.businessId, f.saleId)).status, 'sending');
  assert.equal((await c.query(`select count(*)::int n from fiscal.crm_fiscal_provider_receipts where sale_id = $1`, [f.saleId])).rows[0].n, 1);

  await ageRow(f.businessId, f.saleId);
  const rep = await createRecovery({ store: scopedStore([f.businessId]), staleAfterMs: STALE_MS }).recoverStaleSending();
  assert.equal(rep.finalizedFromReceipt, 1);
  const r = await row(f.businessId, f.saleId);
  assert.equal(r.status, 'issued');
  assert.equal(r.folio, 1000);
  assert.equal(provider.calls, 1, 'la recuperación no llamó al proveedor');
});

test('extremo a extremo: caída antes del recibo -> recuperación marca unknown; no se reemite', async () => {
  const f = await makeFixture(c);
  const provider = createSimulatedProvider({ scenario: 'ok' });
  const emitter = createFiscalEmitter({ allowedIssuers: TEST_ALLOW_ALL,
    store: failingStore({ storeReceipt: 99, finalize: 99 }), provider, masterKey: TEST_MASTER_KEY, timeoutMs: 1000,
  });
  await assert.rejects(emitter.emitSale({ actorUserId: f.userId, saleId: f.saleId }), { code: 'PERSIST_PENDING_RECOVERY' });
  assert.equal((await row(f.businessId, f.saleId)).status, 'sending');

  await ageRow(f.businessId, f.saleId);
  const rep = await createRecovery({ store: scopedStore([f.businessId]), staleAfterMs: STALE_MS }).recoverStaleSending();
  assert.equal(rep.markedUnknown, 1);
  assert.equal((await row(f.businessId, f.saleId)).status, 'unknown');

  const healthy = createFiscalEmitter({ allowedIssuers: TEST_ALLOW_ALL, store, provider, masterKey: TEST_MASTER_KEY, timeoutMs: 1000 });
  await assert.rejects(healthy.emitSale({ actorUserId: f.userId, saleId: f.saleId }), { code: 'UNKNOWN_REQUIRES_RECONCILIATION' });
  assert.equal(provider.calls, 1, 'nunca se reemite tras una caída');
});
