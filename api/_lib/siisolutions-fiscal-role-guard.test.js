import test from 'node:test';
import assert from 'node:assert/strict';
import { createFiscalRoleGuard, FISCAL_READ_ROLES } from './siisolutions-fiscal-role-guard.js';
import { createFiscalDocumentHandler } from '../fiscal/document.js';
import { createFiscalDownloadHandler } from '../fiscal/download.js';

const BIZ = 'cda904a1-e331-4bd4-9f33-a6715687d3dd';
const SALE = 'b4f3144c-34b0-4f87-ada9-96bac0d90295';
const ACTOR = '11111111-2222-4333-8444-555555555555';
const BEARER = 'Bearer token-abc';

// Cliente admin con RPC crm_fiscal_actor_role fijo. Registra las llamadas.
function rpcAdmin(result, { throws = false } = {}) {
  const calls = [];
  return {
    calls,
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (throws) throw new Error('network down');
      return result;
    },
    from() { throw new Error('must not query tables from the role guard'); },
  };
}

const authOk = async () => ACTOR;

test('roles de lectura: owner, operator y viewer; el reconciliador no lee por API', () => {
  assert.deepEqual([...FISCAL_READ_ROLES], ['fiscal_owner', 'fiscal_operator', 'fiscal_viewer']);
  assert.equal(FISCAL_READ_ROLES.includes('fiscal_reconciler'), false);
});

for (const role of ['fiscal_owner', 'fiscal_operator', 'fiscal_viewer']) {
  test(`rol activo ${role} -> acceso, consultando la RPC con negocio y usuario del token`, async () => {
    const admin = rpcAdmin({ data: role, error: null });
    const guard = createFiscalRoleGuard({ authenticate: authOk, admin });
    const r = await guard({ bearer: BEARER, businessId: BIZ });
    assert.deepEqual(r, { ok: true, actorId: ACTOR, role });
    assert.deepEqual(admin.calls, [{ fn: 'crm_fiscal_actor_role', args: { p_business_id: BIZ, p_user_id: ACTOR } }]);
  });
}

test('sin fila activa (no miembro, dueño anterior o negocio inactivo) -> 403 BUSINESS_NOT_AUTHORIZED', async () => {
  const guard = createFiscalRoleGuard({ authenticate: authOk, admin: rpcAdmin({ data: null, error: null }) });
  assert.deepEqual(await guard({ bearer: BEARER, businessId: BIZ }), { ok: false, status: 403, error: 'BUSINESS_NOT_AUTHORIZED' });
});

test('rol reconciliador o valor desconocido -> 403 (no es rol de lectura)', async () => {
  for (const data of ['fiscal_reconciler', 'admin', '', 42]) {
    const guard = createFiscalRoleGuard({ authenticate: authOk, admin: rpcAdmin({ data, error: null }) });
    assert.equal((await guard({ bearer: BEARER, businessId: BIZ })).status, 403, String(data));
  }
});

test('error de la RPC o excepción -> 503 SERVER_ERROR, sin detalles', async () => {
  const g1 = createFiscalRoleGuard({ authenticate: authOk, admin: rpcAdmin({ data: null, error: { message: 'secret internals', code: 'XX000' } }) });
  assert.deepEqual(await g1({ bearer: BEARER, businessId: BIZ }), { ok: false, status: 503, error: 'SERVER_ERROR' });
  const g2 = createFiscalRoleGuard({ authenticate: authOk, admin: rpcAdmin(null, { throws: true }) });
  assert.deepEqual(await g2({ bearer: BEARER, businessId: BIZ }), { ok: false, status: 503, error: 'SERVER_ERROR' });
});

test('token mal formado -> 401 sin consultar nada', async () => {
  const admin = rpcAdmin({ data: 'fiscal_owner', error: null });
  const guard = createFiscalRoleGuard({ authenticate: authOk, admin });
  for (const bearer of [undefined, '', 'Basic x', 'Bearer ', 'Bearer a b']) {
    assert.deepEqual(await guard({ bearer, businessId: BIZ }), { ok: false, status: 401, error: 'UNAUTHORIZED' }, String(bearer));
  }
  assert.equal(admin.calls.length, 0);
});

test('negocio con formato inválido -> 400 antes de autenticar', async () => {
  let authCalled = false;
  const guard = createFiscalRoleGuard({
    authenticate: async () => { authCalled = true; return ACTOR; },
    admin: rpcAdmin({ data: 'fiscal_owner', error: null }),
  });
  assert.equal((await guard({ bearer: BEARER, businessId: 'no-uuid' })).status, 400);
  assert.equal(authCalled, false);
});

test('token rechazado por el proveedor de identidad -> 401', async () => {
  const admin = rpcAdmin({ data: 'fiscal_owner', error: null });
  const guard = createFiscalRoleGuard({ authenticate: async () => { throw new Error('bad token'); }, admin });
  assert.deepEqual(await guard({ bearer: BEARER, businessId: BIZ }), { ok: false, status: 401, error: 'UNAUTHORIZED' });
  assert.equal(admin.calls.length, 0);
});

test('identidad sin UUID válido -> 401', async () => {
  const guard = createFiscalRoleGuard({ authenticate: async () => 'not-a-uuid', admin: rpcAdmin({ data: 'fiscal_owner', error: null }) });
  assert.equal((await guard({ bearer: BEARER, businessId: BIZ })).status, 401);
});

test('constructor exige autenticación y cliente con rpc', () => {
  assert.throws(() => createFiscalRoleGuard({ authenticate: authOk, admin: {} }), /required/);
  assert.throws(() => createFiscalRoleGuard({ admin: rpcAdmin({}) }), /required/);
});

// --- Integración con los endpoints: historial legítimo y dueño anterior -------------------

// Base mínima: devuelve la fila de cada tabla por su nombre.
function fakeDb(rows) {
  return {
    from(table) {
      const q = {
        select() { return q; },
        eq() { return q; },
        maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
      };
      return q;
    },
  };
}

function res() {
  return {
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(n) { this.statusCode = n; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
  };
}

const historicalIssuance = {
  sale_id: SALE, status: 'issued', folio: 51106, error_code: null,
  created_at: '2026-07-01T10:00:00Z', updated_at: '2026-07-01T10:00:05Z',
};

for (const role of ['fiscal_operator', 'fiscal_viewer']) {
  test(`${role} lee el documento histórico emitido antes del cambio de permisos`, async () => {
    const guard = createFiscalRoleGuard({ authenticate: authOk, admin: rpcAdmin({ data: role, error: null }) });
    const db = fakeDb({ crm_invoices: { id: SALE, total: 2380 }, crm_fiscal_issuances: historicalIssuance });
    const handle = createFiscalDocumentHandler({ admin: db, assertAccess: guard });
    const r = res();
    await handle({ method: 'GET', query: { businessId: BIZ, invoiceId: SALE }, headers: { authorization: BEARER } }, r);
    assert.equal(r.statusCode, 200);
    assert.equal(r.body.document.folio, 51106);
    assert.equal(r.body.document.status, 'issued');
  });
}

test('dueño anterior: 403 en documento, descarga y PDF, sin tocar tablas fiscales', async () => {
  const guard = createFiscalRoleGuard({ authenticate: authOk, admin: rpcAdmin({ data: null, error: null }) });
  const trap = { from() { throw new Error('must not query after denial'); } };
  const doc = res();
  await createFiscalDocumentHandler({ admin: trap, assertAccess: guard })(
    { method: 'GET', query: { businessId: BIZ, invoiceId: SALE }, headers: { authorization: BEARER } }, doc);
  assert.equal(doc.statusCode, 403);
  assert.equal(doc.body.error, 'BUSINESS_NOT_AUTHORIZED');

  const dl = res();
  await createFiscalDownloadHandler({ admin: trap, assertAccess: guard })(
    { method: 'GET', query: { businessId: BIZ, invoiceId: SALE, format: 'pdf' }, headers: { authorization: BEARER } }, dl);
  assert.equal(dl.statusCode, 403);
});
