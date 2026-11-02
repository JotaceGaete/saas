import test from 'node:test';
import assert from 'node:assert/strict';
import { createFiscalConnectionHandler } from './connection.js';

const BIZ = 'cda904a1-e331-4bd4-9f33-a6715687d3dd';
const OTHER_BIZ = '85e80cd0-7242-492f-951d-b17893e84283';
const API_KEY = 'dtc_live_EXAMPLE_KEY_0123456789abcdef';

function fakeRes() {
  const res = { headers: {}, statusCode: 200, payload: undefined };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.payload = b; return res; };
  return res;
}

function fakeReq({ method = 'GET', businessId = BIZ, authorization = 'Bearer token-owner', body } = {}) {
  const headers = authorization === undefined ? {} : { authorization };
  return { method, query: { businessId }, headers, body };
}

// Servicio espía: registra cada llamada y responde una conexión sin clave.
function spyService(response = { status: 200, body: { connection: { connected: true, issuerRut: '12345678-5', enabled: false, verified: false, keyVersion: 1, updatedAt: null } } }) {
  const calls = [];
  const record = (name) => async (args) => { calls.push({ name, args }); return response; };
  return { calls, status: record('status'), connect: record('connect'), disconnect: record('disconnect') };
}

// Guarda que permite solo al propietario del negocio pedido.
function ownerGuard({ allowedBusiness = BIZ, actorId = 'owner-1' } = {}) {
  const calls = [];
  const assertAccess = async ({ bearer, businessId }) => {
    calls.push({ bearer, businessId });
    if (!bearer.startsWith('Bearer ')) return { ok: false, status: 401, error: 'AUTH_HEADER_MISSING' };
    if (businessId !== allowedBusiness) return { ok: false, status: 403, error: 'BUSINESS_NOT_AUTHORIZED' };
    return { ok: true, actorId };
  };
  return { assertAccess, calls };
}

async function run(handler, reqOpts) {
  const res = fakeRes();
  await handler(fakeReq(reqOpts), res);
  return res;
}

test('propietario: GET devuelve estado sin clave y con no-store', async () => {
  const svc = spyService();
  const handler = createFiscalConnectionHandler({ service: svc, assertAccess: ownerGuard().assertAccess });
  const res = await run(handler, { method: 'GET' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(svc.calls[0].name, 'status');
  assert.equal(JSON.stringify(res.payload).includes(API_KEY), false);
});

test('no propietario o negocio ajeno: 403 y el servicio no se llama', async () => {
  const svc = spyService();
  const guard = ownerGuard({ allowedBusiness: OTHER_BIZ });
  const handler = createFiscalConnectionHandler({ service: svc, assertAccess: guard.assertAccess });
  const res = await run(handler, { method: 'POST', body: { action: 'connect', apiKey: API_KEY, issuerRut: '12345678-5' } });
  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.error, 'BUSINESS_NOT_AUTHORIZED');
  assert.equal(svc.calls.length, 0, 'ninguna operación con credenciales sin permiso');
  assert.equal(guard.calls[0].businessId, BIZ, 'la guarda comprueba el negocio pedido');
});

test('sin cabecera Authorization: 401 sin tocar nada', async () => {
  const svc = spyService();
  const handler = createFiscalConnectionHandler({ service: svc, assertAccess: ownerGuard().assertAccess });
  const res = await run(handler, { method: 'GET', authorization: '   ' });
  assert.equal(res.statusCode, 401);
  assert.equal(res.payload.error, 'AUTH_HEADER_MISSING');
  assert.equal(svc.calls.length, 0);
});

test('businessId ausente o no UUID: 400 INVALID_REQUEST antes de la guarda', async () => {
  const svc = spyService();
  const guard = ownerGuard();
  const handler = createFiscalConnectionHandler({ service: svc, assertAccess: guard.assertAccess });
  const res = await run(handler, { method: 'GET', businessId: 'no-es-uuid' });
  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.error, 'INVALID_REQUEST');
  assert.equal(guard.calls.length, 0);
  assert.equal(svc.calls.length, 0);
});

test('método no permitido: 405 con cabecera Allow', async () => {
  const svc = spyService();
  const handler = createFiscalConnectionHandler({ service: svc, assertAccess: ownerGuard().assertAccess });
  const res = await run(handler, { method: 'DELETE' });
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'GET, POST');
  assert.equal(svc.calls.length, 0);
});

test('POST sin objeto JSON: 400 BAD_REQUEST', async () => {
  const svc = spyService();
  const handler = createFiscalConnectionHandler({ service: svc, assertAccess: ownerGuard().assertAccess });
  assert.equal((await run(handler, { method: 'POST', body: undefined })).payload.error, 'BAD_REQUEST');
  assert.equal((await run(handler, { method: 'POST', body: ['connect'] })).payload.error, 'BAD_REQUEST');
  assert.equal(svc.calls.length, 0);
});

test('POST con acción desconocida: 400 UNKNOWN_ACTION', async () => {
  const svc = spyService();
  const handler = createFiscalConnectionHandler({ service: svc, assertAccess: ownerGuard().assertAccess });
  const res = await run(handler, { method: 'POST', body: { action: 'rotate' } });
  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.error, 'UNKNOWN_ACTION');
  assert.equal(svc.calls.length, 0);
});

test('POST connect: pasa el actor de la guarda (no el del cliente) al servicio', async () => {
  const svc = spyService();
  const handler = createFiscalConnectionHandler({ service: svc, assertAccess: ownerGuard({ actorId: 'owner-real' }).assertAccess });
  const res = await run(handler, { method: 'POST', body: { action: 'connect', apiKey: API_KEY, issuerRut: '12345678-5', actorId: 'impostor' } });
  assert.equal(res.statusCode, 200);
  assert.equal(svc.calls[0].name, 'connect');
  assert.equal(svc.calls[0].args.actorId, 'owner-real');
  assert.equal(svc.calls[0].args.businessId, BIZ);
});

test('POST disconnect: delega en el servicio y responde sin clave', async () => {
  const svc = spyService({ status: 200, body: { connection: { connected: false, issuerRut: null, enabled: false, verified: false, keyVersion: null, updatedAt: null } } });
  const handler = createFiscalConnectionHandler({ service: svc, assertAccess: ownerGuard().assertAccess });
  const res = await run(handler, { method: 'POST', body: { action: 'disconnect' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.connection.connected, false);
  assert.equal(svc.calls[0].name, 'disconnect');
});
