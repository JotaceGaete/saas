// Lista de empresas autorizadas en el emisor + consultas de solo lectura (lookup, sii-status).
// Seguridad (tenant, rol, lista), concurrencia y prevención de duplicados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createFiscalEmitter, operationIdFor } from '../../lib/emit.mjs';
import { parseAllowedIssuers, EMPTY_ALLOWLIST } from '../../lib/allowlist.mjs';
import { createSimulatedProvider } from '../../lib/providers/simulated.mjs';
import { createMemoryStore } from '../helpers/memory-store.mjs';
import { syntheticDocument } from '../helpers/dte-fixtures.mjs';

const MASTER = randomBytes(32);
const B1 = 'b72b5a55-8ce6-4d1b-99b1-0a3a618f0930';
const B2 = '1cb7e06b-a326-4f1a-a6bb-785d03c85133';
const R1 = '76123456-0';
const R2 = '77654321-7';
const U1 = 'user-owner-1';
const U2 = 'user-owner-2';
const S1 = 'sale-1';
const S2 = 'sale-2';

function fakeProvider({ emitScenario = 'ok', lookup = { result: 'not_found' }, docs, sii, ready = true, name = 'dtecore' } = {}) {
  const sim = createSimulatedProvider({ scenario: emitScenario });
  const calls = { emit: 0, lookup: 0, docs: 0, sii: 0, lookupArgs: [] };
  return {
    name,
    ready,
    calls,
    async emit(args) { calls.emit += 1; return sim.emit(args); },
    async lookupOperation(args) {
      calls.lookup += 1;
      calls.lookupArgs.push(args);
      return typeof lookup === 'function' ? lookup(args) : lookup;
    },
    async retrieveDocuments(args) {
      calls.docs += 1;
      return docs === undefined ? syntheticDocument({ folio: args.folio, total: args.expect.total, rutEmisor: args.expect.rutEmisor }) : docs;
    },
    async getSiiStatus() {
      calls.sii += 1;
      return sii ?? { result: 'ok', siiStatus: 'accepted', rawState: 'ACEPTADO', trackId: '1234567' };
    },
  };
}

function setup({ allow = `${B1}=${R1}`, provider = fakeProvider(), seed2 = {} } = {}) {
  const store = createMemoryStore({ masterKey: MASTER });
  store.seed({ businessId: B1, userId: U1, saleId: S1, issuerRut: R1 });
  store.seed({ businessId: B2, userId: U2, saleId: S2, issuerRut: R2, ...seed2 });
  const allowedIssuers = typeof allow === 'string' ? parseAllowedIssuers(allow) : allow;
  const emitter = createFiscalEmitter({ store, provider, masterKey: MASTER, allowedIssuers, timeoutMs: 200 });
  return { store, provider, emitter };
}

const code = (fn) => fn().then(() => null, (e) => e.code);

// --- Lista de empresas autorizadas -----------------------------------------------------------

test('sin lista de empresas el emisor no se construye (falla cerrado)', () => {
  const store = createMemoryStore({ masterKey: MASTER });
  assert.throws(() => createFiscalEmitter({ store, provider: fakeProvider(), masterKey: MASTER }), /allowedIssuers/);
  assert.throws(() => createFiscalEmitter({ store, provider: fakeProvider(), masterKey: MASTER, allowedIssuers: { permits: () => true } }), /allowedIssuers/);
});

test('empresa autorizada con su RUT: emite una boleta', async () => {
  const { emitter, provider } = setup();
  const r = await emitter.emitSale({ actorUserId: U1, saleId: S1 });
  assert.equal(r.status, 'issued');
  assert.equal(provider.calls.emit, 1);
});

test('negocio fuera de la lista: no reclama, no crea fila, no llama al proveedor', async () => {
  const { emitter, provider, store } = setup();
  assert.equal(await code(() => emitter.emitSale({ actorUserId: U2, saleId: S2 })), 'FISCAL_BUSINESS_NOT_ALLOWED');
  assert.equal(provider.calls.emit, 0);
  assert.equal(store.calls.claimWithCredentials ?? 0, 0);
  assert.equal(store.issuances.size, 0);
});

test('negocio de la lista con un RUT de emisor distinto (p. ej. cambiado en la base): no emite', async () => {
  const { emitter, provider, store } = setup();
  store.issuers.get(B1).issuerRut = R2;
  assert.equal(await code(() => emitter.emitSale({ actorUserId: U1, saleId: S1 })), 'FISCAL_BUSINESS_NOT_ALLOWED');
  assert.equal(provider.calls.emit, 0);
});

test('otro negocio con el RUT de una empresa autorizada: no emite', async () => {
  const { emitter, provider } = setup({ seed2: { issuerRut: R1 } });
  assert.equal(await code(() => emitter.emitSale({ actorUserId: U2, saleId: S2 })), 'FISCAL_BUSINESS_NOT_ALLOWED');
  assert.equal(provider.calls.emit, 0);
});

test('lista vacía o inválida: nadie emite', async () => {
  for (const allow of [EMPTY_ALLOWLIST, parseAllowedIssuers(''), parseAllowedIssuers(`${B1}=76123456-7`)]) {
    const { emitter, provider } = setup({ allow });
    assert.equal(await code(() => emitter.emitSale({ actorUserId: U1, saleId: S1 })), 'FISCAL_BUSINESS_NOT_ALLOWED');
    assert.equal(provider.calls.emit, 0);
  }
});

test('las tres empresas, cada una con su credencial: cada emisión usa la clave de SU negocio', async () => {
  const B3 = '03fdfe77-713e-4dbb-977a-e38cfb4ebee2';
  const R3 = '78111222-4';
  const used = [];
  const provider = fakeProvider();
  const emit = provider.emit;
  provider.emit = async (args) => { used.push(args.credentials.apiKey); return emit(args); };
  const { emitter, store } = setup({ allow: `${B1}=${R1},${B2}=${R2},${B3}=${R3}`, provider });
  store.seed({ businessId: B3, userId: 'user-owner-3', saleId: 'sale-3', issuerRut: R3 });
  for (const [u, s] of [[U1, S1], [U2, S2], ['user-owner-3', 'sale-3']]) {
    assert.equal((await emitter.emitSale({ actorUserId: u, saleId: s })).status, 'issued');
  }
  assert.deepEqual(used, [`TEST-KEY-${B1}`, `TEST-KEY-${B2}`, `TEST-KEY-${B3}`]);
  // El dueño de una empresa no emite la venta de otra (aunque ambas estén en la lista).
  store.seed({ businessId: B2, userId: U2, saleId: 'sale-2b', issuerRut: R2 });
  assert.equal(await code(() => emitter.emitSale({ actorUserId: U1, saleId: 'sale-2b' })), 'SALE_NOT_FOUND');
});

test('status: fuera de la lista -> bloqueado y sin autorización de modo real', async () => {
  const { emitter } = setup();
  const s = await emitter.status({ actorUserId: U2, saleId: S2 });
  assert.equal(s.canEmit, false);
  assert.equal(s.blockedReason, 'FISCAL_BUSINESS_NOT_ALLOWED');
  assert.equal(s.liveAuthorized, false);
});

test('status: liveAuthorized solo con proveedor real activo, empresa en la lista y emisor verificado', async () => {
  const ok = await setup().emitter.status({ actorUserId: U1, saleId: S1 });
  assert.equal(ok.liveAuthorized, true);
  assert.equal(ok.canEmit, true);

  const sim = await setup({ provider: fakeProvider({ name: 'simulated' }) }).emitter.status({ actorUserId: U1, saleId: S1 });
  assert.equal(sim.liveAuthorized, false);

  const off = await setup({ provider: fakeProvider({ ready: false }) }).emitter.status({ actorUserId: U1, saleId: S1 });
  assert.equal(off.liveAuthorized, false);

  const { emitter, store } = setup();
  store.issuers.get(B1).verified = false;
  assert.equal((await emitter.status({ actorUserId: U1, saleId: S1 })).liveAuthorized, false);
});

// --- Duplicados y concurrencia ---------------------------------------------------------------

test('concurrencia: 25 emisiones simultáneas de la misma venta -> una sola llamada al proveedor', async () => {
  const { emitter, provider } = setup();
  const rs = await Promise.allSettled(Array.from({ length: 25 }, () => emitter.emitSale({ actorUserId: U1, saleId: S1 })));
  assert.equal(provider.calls.emit, 1);
  assert.equal(rs.filter((r) => r.status === 'fulfilled' && r.value.status === 'issued' && !r.value.alreadyIssued).length, 1);
});

test('duplicado: una venta emitida no vuelve a llamar al proveedor; status y emit lo informan', async () => {
  const { emitter, provider } = setup();
  const first = await emitter.emitSale({ actorUserId: U1, saleId: S1 });
  const again = await emitter.emitSale({ actorUserId: U1, saleId: S1 });
  assert.equal(again.alreadyIssued, true);
  assert.equal(again.folio, first.folio);
  assert.equal(provider.calls.emit, 1);
  assert.equal((await emitter.status({ actorUserId: U1, saleId: S1 })).blockedReason, 'ALREADY_ISSUED');
});

// --- Recuperación: solo consulta -------------------------------------------------------------

async function unknownSale(opts = {}) {
  const ctx = setup({ provider: fakeProvider({ emitScenario: 'network', ...opts }) });
  const r = await ctx.emitter.emitSale({ actorUserId: U1, saleId: S1 });
  assert.equal(r.status, 'unknown');
  ctx.provider.calls.emit = 0;
  return ctx;
}

test('lookup encontrado: devuelve folio y valida documentos, pero la venta sigue unknown y no se emite', async () => {
  const { emitter, provider, store } = await unknownSale({ lookup: { result: 'found', folio: 4321 } });
  const r = await emitter.lookupOperation({ actorUserId: U1, saleId: S1 });
  assert.equal(r.result, 'found');
  assert.equal(r.folio, 4321);
  assert.equal(r.documents, 'valid');
  assert.equal(r.state, 'unknown');
  assert.equal(provider.calls.emit, 0);
  assert.equal(store.issuances.get(`${B1}|${S1}`).status, 'unknown');
  // Consulta con NUESTRO id de operación y la credencial del negocio.
  assert.equal(provider.calls.lookupArgs[0].operationId, operationIdFor(B1, S1));
  assert.equal(provider.calls.lookupArgs[0].credentials.apiKey, `TEST-KEY-${B1}`);
  // Auditoría de la consulta.
  const audit = store.auditLog.find((a) => a.action === 'reconcile_attempt');
  assert.equal(audit.outcome, 'lookup_found');
  assert.equal(audit.detail.folio, 4321);
  // Ni la consulta ni un reintento del cajero vuelven a emitir.
  assert.equal(await code(() => emitter.emitSale({ actorUserId: U1, saleId: S1 })), 'UNKNOWN_REQUIRES_RECONCILIATION');
  assert.equal(provider.calls.emit, 0);
});

test('lookup no encontrado o indeterminado: tampoco emite ni cambia la venta', async () => {
  for (const lookup of [{ result: 'not_found' }, { result: 'indeterminate', code: 'PROVIDER_HTTP_500' }, { weird: true }, null]) {
    const { emitter, provider, store } = await unknownSale({ lookup });
    const r = await emitter.lookupOperation({ actorUserId: U1, saleId: S1 });
    assert.ok(['not_found', 'indeterminate'].includes(r.result));
    assert.equal(r.folio, null);
    assert.equal(r.documents, null);
    assert.equal(provider.calls.emit, 0);
    assert.equal(provider.calls.docs, 0);
    assert.equal(store.issuances.get(`${B1}|${S1}`).status, 'unknown');
  }
});

test('lookup con documentos que no cuadran: informa not_retrieved y no concilia', async () => {
  const { emitter, store } = await unknownSale({ lookup: { result: 'found', folio: 77 }, docs: null });
  const r = await emitter.lookupOperation({ actorUserId: U1, saleId: S1 });
  assert.equal(r.documents, 'not_retrieved');
  assert.equal(store.issuances.get(`${B1}|${S1}`).status, 'unknown');
});

test('lookup: folio distinto a la pista guardada se marca FOLIO_HINT_MISMATCH', async () => {
  const { emitter, store } = await unknownSale({ lookup: { result: 'found', folio: 10 } });
  store.issuances.get(`${B1}|${S1}`).folio = 9;
  const r = await emitter.lookupOperation({ actorUserId: U1, saleId: S1 });
  assert.equal(r.code, 'FOLIO_HINT_MISMATCH');
  assert.equal(r.folioHint, 9);
});

test('lookup solo para ventas unknown: sin fila, emitida o en curso -> NOT_UNKNOWN sin consultar', async () => {
  const fresh = setup();
  assert.equal(await code(() => fresh.emitter.lookupOperation({ actorUserId: U1, saleId: S1 })), 'NOT_UNKNOWN');
  await fresh.emitter.emitSale({ actorUserId: U1, saleId: S1 });
  assert.equal(await code(() => fresh.emitter.lookupOperation({ actorUserId: U1, saleId: S1 })), 'NOT_UNKNOWN');
  assert.equal(fresh.provider.calls.lookup, 0);
});

test('lookup: aislamiento por negocio y roles', async () => {
  const { emitter, provider, store } = await unknownSale({ lookup: { result: 'found', folio: 5 } });
  // Usuario de otro negocio: como si la venta no existiera.
  assert.equal(await code(() => emitter.lookupOperation({ actorUserId: U2, saleId: S1 })), 'SALE_NOT_FOUND');
  assert.equal(await code(() => emitter.lookupOperation({ actorUserId: 'nadie', saleId: S1 })), 'SALE_NOT_FOUND');
  // Operador y lector no consultan; conciliador sí.
  store.grantRole(B1, 'op', 'fiscal_operator');
  store.grantRole(B1, 'viewer', 'fiscal_viewer');
  store.grantRole(B1, 'rec', 'fiscal_reconciler');
  assert.equal(await code(() => emitter.lookupOperation({ actorUserId: 'op', saleId: S1 })), 'FISCAL_ROLE_REQUIRED');
  assert.equal(await code(() => emitter.lookupOperation({ actorUserId: 'viewer', saleId: S1 })), 'FISCAL_ROLE_REQUIRED');
  assert.equal((await emitter.lookupOperation({ actorUserId: 'rec', saleId: S1 })).result, 'found');
  assert.equal(provider.calls.lookup, 1);
  assert.equal(provider.calls.emit, 0);
});

test('lookup: empresa fuera de la lista no consulta al proveedor', async () => {
  const { emitter, provider, store } = await unknownSale({ lookup: { result: 'found', folio: 5 } });
  store.issuers.get(B1).issuerRut = R2;
  assert.equal(await code(() => emitter.lookupOperation({ actorUserId: U1, saleId: S1 })), 'FISCAL_BUSINESS_NOT_ALLOWED');
  assert.equal(provider.calls.lookup, 0);
});

test('lookup: proveedor bloqueado o sin consulta -> PROVIDER_NOT_READY; sin credencial -> CREDENTIALS_MISSING', async () => {
  const a = await unknownSale();
  a.provider.ready = false;
  assert.equal(await code(() => a.emitter.lookupOperation({ actorUserId: U1, saleId: S1 })), 'PROVIDER_NOT_READY');
  const b = await unknownSale();
  delete b.provider.lookupOperation;
  assert.equal(await code(() => b.emitter.lookupOperation({ actorUserId: U1, saleId: S1 })), 'PROVIDER_NOT_READY');
  const c = await unknownSale();
  c.store.creds.delete(B1);
  assert.equal(await code(() => c.emitter.lookupOperation({ actorUserId: U1, saleId: S1 })), 'CREDENTIALS_MISSING');
  assert.equal(c.provider.calls.lookup, 0);
});

test('lookup concurrente: 10 consultas simultáneas no cambian la venta ni emiten', async () => {
  const { emitter, provider, store } = await unknownSale({ lookup: { result: 'found', folio: 8 } });
  const rs = await Promise.all(Array.from({ length: 10 }, () => emitter.lookupOperation({ actorUserId: U1, saleId: S1 })));
  assert.ok(rs.every((r) => r.result === 'found' && r.state === 'unknown'));
  assert.equal(provider.calls.emit, 0);
  assert.equal(store.issuances.get(`${B1}|${S1}`).status, 'unknown');
});

test('una auditoría caída no cambia el resultado de la consulta', async () => {
  const { emitter, store } = await unknownSale({ lookup: { result: 'not_found' } });
  store.setAuditFailure(true);
  assert.equal((await emitter.lookupOperation({ actorUserId: U1, saleId: S1 })).result, 'not_found');
});

// --- Estado SII --------------------------------------------------------------------------------

async function issuedSale(opts = {}) {
  const ctx = setup({ provider: fakeProvider(opts) });
  const r = await ctx.emitter.emitSale({ actorUserId: U1, saleId: S1 });
  assert.equal(r.status, 'issued');
  ctx.provider.calls.emit = 0;
  return { ...ctx, folio: r.folio };
}

test('sii-status: registra aceptada (fuente provider_api) sin tocar folio, XML ni estado de emisión', async () => {
  const { emitter, store, provider, folio } = await issuedSale();
  const before = { ...store.issuances.get(`${B1}|${S1}`) };
  const r = await emitter.refreshSiiStatus({ actorUserId: U1, saleId: S1 });
  assert.deepEqual(r, { folio, siiStatus: 'accepted', updated: true, rawState: 'ACEPTADO' });
  const row = store.issuances.get(`${B1}|${S1}`);
  assert.equal(row.siiStatus, 'accepted');
  assert.equal(row.siiTrackId, '1234567');
  assert.equal(row.siiSource, 'provider_api');
  assert.equal(row.status, before.status);
  assert.equal(row.folio, before.folio);
  assert.equal(row.xmlBase64, before.xmlBase64);
  assert.equal(provider.calls.emit, 0);
  assert.equal(store.siiEvents.length, 1);
});

test('sii-status: respuesta no reconocida o error -> no escribe y sigue sin verificar', async () => {
  for (const sii of [
    { result: 'ok', siiStatus: null, rawState: 'EPR', trackId: null },
    { result: 'indeterminate', code: 'PROVIDER_HTTP_502' },
  ]) {
    const { emitter, store } = await issuedSale({ sii });
    const r = await emitter.refreshSiiStatus({ actorUserId: U1, saleId: S1 });
    assert.equal(r.updated, false);
    assert.equal(r.siiStatus, 'unverified');
    assert.ok(r.code);
    assert.equal(store.siiEvents.length, 0);
  }
});

test('sii-status: un estado final no se reemplaza por otro', async () => {
  const { emitter, store, provider } = await issuedSale();
  await emitter.refreshSiiStatus({ actorUserId: U1, saleId: S1 });
  provider.getSiiStatus = async () => ({ result: 'ok', siiStatus: 'rejected', rawState: 'RECHAZADO', trackId: '1234567' });
  const r = await emitter.refreshSiiStatus({ actorUserId: U1, saleId: S1 });
  assert.equal(r.updated, false);
  assert.equal(r.code, 'FISCAL_SII_STATUS_FINAL');
  assert.equal(store.issuances.get(`${B1}|${S1}`).siiStatus, 'accepted');
});

test('sii-status: solo boletas emitidas; aislamiento por negocio, roles y lista', async () => {
  const fresh = setup();
  assert.equal(await code(() => fresh.emitter.refreshSiiStatus({ actorUserId: U1, saleId: S1 })), 'NOT_ISSUED');
  assert.equal(fresh.provider.calls.sii, 0);

  const { emitter, store, provider } = await issuedSale();
  assert.equal(await code(() => emitter.refreshSiiStatus({ actorUserId: U2, saleId: S1 })), 'SALE_NOT_FOUND');
  store.grantRole(B1, 'viewer', 'fiscal_viewer');
  store.grantRole(B1, 'op', 'fiscal_operator');
  assert.equal(await code(() => emitter.refreshSiiStatus({ actorUserId: 'viewer', saleId: S1 })), 'FISCAL_ROLE_REQUIRED');
  assert.equal((await emitter.refreshSiiStatus({ actorUserId: 'op', saleId: S1 })).siiStatus, 'accepted');
  store.issuers.get(B1).issuerRut = R2;
  assert.equal(await code(() => emitter.refreshSiiStatus({ actorUserId: U1, saleId: S1 })), 'FISCAL_BUSINESS_NOT_ALLOWED');
  assert.equal(provider.calls.emit, 0);
});
