// Lista de empresas autorizadas, concurrencia, consulta de operación y estado SII contra Postgres
// real (solo walinka_test). Nunca apunta a producción.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createPgStore, assertLocalTestConfig } from '../../lib/store-pg.mjs';
import { createFiscalEmitter } from '../../lib/emit.mjs';
import { createSimulatedProvider } from '../../lib/providers/simulated.mjs';
import { parseAllowedIssuers } from '../../lib/allowlist.mjs';
import { CFG, TEST_MASTER_KEY, makeFixture, setEmissionControl, uniqueRut } from './fixtures.mjs';

// RUT distintos en cada prueba: la migración H impide repetir un RUT entre comercios.
let RUT;
let OTHER;
beforeEach(() => { RUT = uniqueRut(); OTHER = uniqueRut(); });
let c;
let store;
let savedControl;

before(async () => {
  c = new pg.Client(assertLocalTestConfig(CFG));
  await c.connect();
  savedControl = (await c.query(`select enabled from fiscal.dte39_emission_control where singleton`)).rows[0]?.enabled ?? false;
  await setEmissionControl(c, true);
  store = createPgStore(CFG);
});
after(async () => { await setEmissionControl(c, savedControl); await store.end(); await c.end(); });

function provider({ scenario = 'ok', lookup = { result: 'not_found' }, sii } = {}) {
  const sim = createSimulatedProvider({ scenario, delayMs: 20 });
  const calls = { emit: 0, lookup: 0, sii: 0 };
  return {
    name: 'dtecore', ready: true, calls,
    async emit(a) { calls.emit += 1; return sim.emit(a); },
    async lookupOperation() { calls.lookup += 1; return lookup; },
    async retrieveDocuments() { return null; },
    async getSiiStatus() { calls.sii += 1; return sii ?? { result: 'ok', siiStatus: 'accepted', rawState: 'ACEPTADO', trackId: '13579' }; },
  };
}

const emitterFor = (p, allow) => createFiscalEmitter({ store, provider: p, masterKey: TEST_MASTER_KEY, allowedIssuers: parseAllowedIssuers(allow), timeoutMs: 300 });
const rows = async (saleId) => (await c.query(`select status, folio, updated_at, sii_status from public.crm_fiscal_issuances where sale_id = $1`, [saleId])).rows;

test('negocio fuera de la lista: ninguna fila en el ledger y ninguna llamada al proveedor', async () => {
  const f = await makeFixture(c, { issuerRut: RUT });
  const other = await makeFixture(c, { issuerRut: OTHER });
  const p = provider();
  const e = emitterFor(p, `${other.businessId}=${OTHER}`);
  await assert.rejects(e.emitSale({ actorUserId: f.userId, saleId: f.saleId }), { code: 'FISCAL_BUSINESS_NOT_ALLOWED' });
  assert.equal(p.calls.emit, 0);
  assert.deepEqual(await rows(f.saleId), []);
});

test('negocio de la lista pero con otro RUT en fiscal.issuers: no emite', async () => {
  const f = await makeFixture(c, { issuerRut: OTHER });
  const p = provider();
  const e = emitterFor(p, `${f.businessId}=${RUT}`);
  await assert.rejects(e.emitSale({ actorUserId: f.userId, saleId: f.saleId }), { code: 'FISCAL_BUSINESS_NOT_ALLOWED' });
  assert.deepEqual(await rows(f.saleId), []);
});

test('concurrencia real: 20 emisiones simultáneas de la misma venta -> una fila, un folio, una llamada', async () => {
  const f = await makeFixture(c, { issuerRut: RUT });
  const p = provider();
  const e = emitterFor(p, `${f.businessId}=${RUT}`);
  const rs = await Promise.allSettled(Array.from({ length: 20 }, () => e.emitSale({ actorUserId: f.userId, saleId: f.saleId })));
  assert.equal(p.calls.emit, 1);
  const r = await rows(f.saleId);
  assert.equal(r.length, 1);
  assert.equal(r[0].status, 'issued');
  const issued = rs.filter((x) => x.status === 'fulfilled' && x.value.status === 'issued');
  assert.ok(issued.every((x) => x.value.folio === r[0].folio));
  for (const x of rs.filter((y) => y.status === 'rejected')) {
    assert.ok(['ALREADY_IN_PROGRESS', 'NOT_EMITTABLE_IN_STATE'].includes(x.reason.code), x.reason.code);
  }
});

test('consulta de un resultado desconocido: no toca el ledger, queda auditada y emit sigue bloqueado', async () => {
  const f = await makeFixture(c, { issuerRut: RUT });
  const p = provider({ scenario: 'network', lookup: { result: 'found', folio: 31337 } });
  const e = emitterFor(p, `${f.businessId}=${RUT}`);
  assert.equal((await e.emitSale({ actorUserId: f.userId, saleId: f.saleId })).status, 'unknown');
  const before = await rows(f.saleId);
  const rs = await Promise.all(Array.from({ length: 5 }, () => e.lookupOperation({ actorUserId: f.userId, saleId: f.saleId })));
  assert.ok(rs.every((r) => r.result === 'found' && r.folio === 31337 && r.state === 'unknown'));
  assert.deepEqual(await rows(f.saleId), before, 'la fila no cambia (ni updated_at)');
  const audit = await c.query(
    `select outcome, detail->>'folio' as folio from fiscal.admin_audit where sale_id = $1 and action = 'reconcile_attempt'`, [f.saleId]);
  assert.equal(audit.rows.length, 5);
  assert.ok(audit.rows.every((a) => a.outcome === 'lookup_found' && a.folio === '31337'));
  await assert.rejects(e.emitSale({ actorUserId: f.userId, saleId: f.saleId }), { code: 'UNKNOWN_REQUIRES_RECONCILIATION' });
  assert.equal(p.calls.emit, 1);
});

test('consulta: usuario de otro negocio no ve la venta', async () => {
  const f = await makeFixture(c, { issuerRut: RUT });
  const intruder = await makeFixture(c, { issuerRut: OTHER });
  const p = provider({ scenario: 'network' });
  const e = emitterFor(p, `${f.businessId}=${RUT},${intruder.businessId}=${OTHER}`);
  await e.emitSale({ actorUserId: f.userId, saleId: f.saleId });
  await assert.rejects(e.lookupOperation({ actorUserId: intruder.userId, saleId: f.saleId }), { code: 'SALE_NOT_FOUND' });
  await assert.rejects(e.refreshSiiStatus({ actorUserId: intruder.userId, saleId: f.saleId }), { code: 'SALE_NOT_FOUND' });
  assert.equal(p.calls.lookup, 0);
});

test('estado SII: registra aceptada (provider_api) con evento; folio y estado de emisión no cambian', async () => {
  const f = await makeFixture(c, { issuerRut: RUT });
  const p = provider();
  const e = emitterFor(p, `${f.businessId}=${RUT}`);
  const issued = await e.emitSale({ actorUserId: f.userId, saleId: f.saleId });
  const r = await e.refreshSiiStatus({ actorUserId: f.userId, saleId: f.saleId });
  assert.equal(r.siiStatus, 'accepted');
  const row = (await rows(f.saleId))[0];
  assert.equal(row.status, 'issued');
  assert.equal(row.folio, issued.folio);
  assert.equal(row.sii_status, 'accepted');
  const ev = await c.query(`select source, to_status, track_id from fiscal.crm_fiscal_sii_status_events where business_id = $1`, [f.businessId]);
  assert.deepEqual(ev.rows, [{ source: 'provider_api', to_status: 'accepted', track_id: '13579' }]);
  // Un estado final distinto no lo reemplaza.
  p.getSiiStatus = async () => ({ result: 'ok', siiStatus: 'rejected', rawState: 'RECHAZADO', trackId: '13579' });
  const again = await e.refreshSiiStatus({ actorUserId: f.userId, saleId: f.saleId });
  assert.equal(again.code, 'FISCAL_SII_STATUS_FINAL');
  assert.equal((await rows(f.saleId))[0].sii_status, 'accepted');
});
