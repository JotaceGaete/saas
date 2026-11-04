import test from 'node:test';
import assert from 'node:assert/strict';
import { createFiscalApplicationsHandler, createAdminGuard } from './applications.js';
import { createFiscalApplicationsService } from '../_lib/fiscal-applications.js';

const BIZ = 'cda904a1-e331-4bd4-9f33-a6715687d3dd';
const ADMIN = '99999999-2222-4333-8444-555555555555';

function fakeRes() {
  const res = { headers: {}, statusCode: 200, payload: undefined };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.payload = b; return res; };
  return res;
}

function fakeAdmin({ reviewError = null, list = [] } = {}) {
  const calls = [];
  return {
    calls,
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (fn === 'crm_fiscal_list_applications') return { data: list, error: null };
      if (fn === 'crm_fiscal_review_application') return { data: reviewError ? null : true, error: reviewError };
      throw new Error(`unexpected rpc ${fn}`);
    },
  };
}

const users = {
  'tok-admin': { id: ADMIN, app_metadata: { role: 'admin' } },
  'tok-owner': { id: 'owner-1', app_metadata: {}, user_metadata: { role: 'admin' } },
};
const assertAdmin = createAdminGuard({ getUser: async (t) => { if (!users[t]) throw new Error('bad'); return users[t]; } });

async function call({ method = 'GET', authorization = 'Bearer tok-admin', query = {}, body, admin = fakeAdmin() } = {}) {
  const handler = createFiscalApplicationsHandler({ service: createFiscalApplicationsService({ admin }), assertAdmin });
  const res = fakeRes();
  await handler({ method, headers: authorization ? { authorization } : {}, query, body }, res);
  return { res, admin };
}

test('solo admins de Walinka: sin sesión 401, rol en user_metadata no cuenta (403)', async () => {
  assert.equal((await call({ authorization: null })).res.statusCode, 401);
  assert.equal((await call({ authorization: 'Bearer tok-x' })).res.statusCode, 401);
  const { res, admin } = await call({ authorization: 'Bearer tok-owner' });
  assert.deepEqual([res.statusCode, res.payload.error], [403, 'ADMIN_REQUIRED']);
  assert.equal(admin.calls.length, 0);
});

test('GET lista la cola (con filtro válido) y responde no-store', async () => {
  const list = [{ businessId: BIZ, businessName: 'Bonita', reviewStatus: 'pending_review' }];
  const { res, admin } = await call({ query: { status: 'pending_review' }, admin: fakeAdmin({ list }) });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.deepEqual(res.payload.applications, list);
  assert.deepEqual(admin.calls[0], { fn: 'crm_fiscal_list_applications', args: { p_status: 'pending_review' } });
  assert.equal((await call({ query: { status: 'cualquiera' } })).res.statusCode, 400);
});

test('aprobar: pasa el id del admin de la sesión, no uno del cuerpo', async () => {
  const { res, admin } = await call({ method: 'POST', body: { action: 'review', businessId: BIZ, decision: 'approve' } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(admin.calls[0], {
    fn: 'crm_fiscal_review_application',
    args: { p_business_id: BIZ, p_admin_user_id: ADMIN, p_decision: 'approve', p_note: null },
  });
  const forged = await call({ method: 'POST', body: { action: 'review', businessId: BIZ, decision: 'approve', adminId: 'otro' } });
  assert.deepEqual([forged.res.statusCode, forged.res.payload.error], [400, 'UNKNOWN_FIELD']);
});

test('rechazar o suspender exige motivo', async () => {
  for (const decision of ['reject', 'suspend']) {
    const { res, admin } = await call({ method: 'POST', body: { action: 'review', businessId: BIZ, decision } });
    assert.deepEqual([res.statusCode, res.payload.error], [400, 'NOTE_REQUIRED']);
    assert.equal(admin.calls.length, 0);
  }
  const ok = await call({ method: 'POST', body: { action: 'review', businessId: BIZ, decision: 'reject', note: 'RUT no coincide' } });
  assert.equal(ok.res.statusCode, 200);
  assert.equal(ok.admin.calls[0].args.p_note, 'RUT no coincide');
});

test('errores de la base: estado cambiado, incompleta y no admin', async () => {
  for (const [message, status, code] of [
    ['FISCAL_REVIEW_STATE', 409, 'REVIEW_STATE_CHANGED'],
    ['FISCAL_APPLICATION_INCOMPLETE', 409, 'APPLICATION_INCOMPLETE'],
    ['FISCAL_REVIEWER_NOT_ADMIN', 403, 'ADMIN_REQUIRED'],
    ['otra cosa', 503, 'SERVER_ERROR'],
  ]) {
    const { res } = await call({ method: 'POST', body: { action: 'review', businessId: BIZ, decision: 'approve' }, admin: fakeAdmin({ reviewError: { message } }) });
    assert.deepEqual([res.statusCode, res.payload.error], [status, code], message);
  }
});

test('acciones y métodos desconocidos', async () => {
  assert.equal((await call({ method: 'DELETE' })).res.statusCode, 405);
  assert.equal((await call({ method: 'POST', body: { action: 'approve-all' } })).res.statusCode, 400);
  assert.equal((await call({ method: 'POST', body: { action: 'review', businessId: 'no-uuid', decision: 'approve' } })).res.statusCode, 400);
});
