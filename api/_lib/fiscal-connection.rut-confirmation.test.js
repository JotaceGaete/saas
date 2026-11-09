// Confirmación expresa del RUT por el propietario (migración H). DTE Core (servicio individual) no
// ofrece un endpoint para saber a qué RUT pertenece una API key: el propietario confirma el RUT
// mostrado antes de la primera boleta, y la confirmación queda atada a la credencial vigente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createFiscalConnectionService } from './fiscal-connection.js';
import { parseAllowedIssuers } from '../../supabase/functions/fiscal-emit/lib/allowlist.mjs';

const BIZ = 'cda904a1-e331-4bd4-9f33-a6715687d3dd';
const ACTOR = '11111111-2222-4333-8444-555555555555';
const RUT = '12345678-5';
const ALLOW = parseAllowedIssuers(`${BIZ}=${RUT}`);

function fakeAdmin(confirmResult = { data: { confirmed: true, block_reason: null }, error: null }) {
  const calls = [];
  return {
    calls,
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (fn === 'crm_fiscal_confirm_issuer_rut') return confirmResult;
      if (fn === 'crm_fiscal_connection_status') {
        return { data: { connected: true, issuerRut: RUT, rutConfirmed: true, rutConfirmationReason: null }, error: null };
      }
      throw new Error(`unexpected rpc ${fn}`);
    },
  };
}
const svcWith = (admin) => createFiscalConnectionService({ admin, sealingKey: randomBytes(32), allowedIssuers: ALLOW });

test('confirmar RUT: normaliza el RUT mostrado y lo envía a la base con el actor', async () => {
  const admin = fakeAdmin();
  const r = await svcWith(admin).confirmRut({ businessId: BIZ, actorId: ACTOR, body: { action: 'confirm-rut', issuerRut: '12.345.678-5' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.connection.rutConfirmed, true);
  assert.deepEqual(admin.calls[0], { fn: 'crm_fiscal_confirm_issuer_rut', args: { p_business_id: BIZ, p_actor_user_id: ACTOR, p_confirmed_rut: RUT } });
});

test('confirmar RUT: RUT inválido, campos extra o negocio/RUT fuera de la lista se rechazan sin tocar la base', async () => {
  const admin = fakeAdmin();
  const svc = svcWith(admin);
  assert.deepEqual(await svc.confirmRut({ businessId: BIZ, actorId: ACTOR, body: { action: 'confirm-rut', issuerRut: '12345678-0' } }), { status: 400, body: { error: 'INVALID_RUT' } });
  assert.deepEqual(await svc.confirmRut({ businessId: BIZ, actorId: ACTOR, body: { action: 'confirm-rut', issuerRut: RUT, apiKey: 'x' } }), { status: 400, body: { error: 'UNKNOWN_FIELD' } });
  assert.equal((await svc.confirmRut({ businessId: BIZ, actorId: ACTOR, body: { action: 'confirm-rut', issuerRut: '76123456-0' } })).status, 403);
  assert.equal(admin.calls.length, 0);
});

test('confirmar RUT: pantalla desactualizada (otro cambió RUT o key) -> 409 RUT_CONFIRMATION_STALE', async () => {
  const admin = fakeAdmin({ data: null, error: { message: 'FISCAL_RUT_CONFIRMATION_STALE' } });
  assert.deepEqual(await svcWith(admin).confirmRut({ businessId: BIZ, actorId: ACTOR, body: { action: 'confirm-rut', issuerRut: RUT } }),
    { status: 409, body: { error: 'RUT_CONFIRMATION_STALE' } });
});

test('confirmar RUT: sin rol fiscal_owner -> 403; sin credenciales -> API_KEY_REQUIRED', async () => {
  let r = await svcWith(fakeAdmin({ data: null, error: { message: 'FISCAL_ROLE_REQUIRED' } }))
    .confirmRut({ businessId: BIZ, actorId: ACTOR, body: { action: 'confirm-rut', issuerRut: RUT } });
  assert.deepEqual(r, { status: 403, body: { error: 'BUSINESS_NOT_AUTHORIZED' } });
  r = await svcWith(fakeAdmin({ data: null, error: { message: 'FISCAL_CREDENTIALS_MISSING' } }))
    .confirmRut({ businessId: BIZ, actorId: ACTOR, body: { action: 'confirm-rut', issuerRut: RUT } });
  assert.deepEqual(r, { status: 409, body: { error: 'API_KEY_REQUIRED' } });
});
