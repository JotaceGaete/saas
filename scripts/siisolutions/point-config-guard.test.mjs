import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConfiguredPointFiscalPilot } from '../../api/_lib/siisolutions-point-pilot.js';

const admin = {
  from() { throw new Error('DB must not be queried when configuration is invalid'); },
  rpc() { throw new Error('RPC must not be called when configuration is invalid'); },
};
const businessId = 'cda904a1-e331-4bd4-9f33-a6715687d3dd';
const invoiceId = '11111111-1111-4111-8111-111111111111';

test('configured Point pilot blocks missing credentials before any database or provider calls', async () => {
  const issue = createConfiguredPointFiscalPilot({ admin, env: {} });
  assert.deepEqual(await issue({ businessId, invoiceId }), {
    state: 'blocked', reason: 'MISSING_ISSUERS_JSON',
  });
});
test('configured Point pilot blocks incorrect key naming before loading sale', async () => {
  const env = { SIISOLUTIONS_EMISSION_ENABLED: 'simulation',
    SIISOLUTIONS_PILOT_ISSUERS_JSON: JSON.stringify({
      [businessId]: { operatorRut: '76509283-3', apiKey: 'not-real', verified: true },
    }) };
  const issue = createConfiguredPointFiscalPilot({ admin, env });
  assert.deepEqual(await issue({ businessId, invoiceId }), {
    state: 'blocked', reason: 'INVALID_ISSUER_RECORD',
  });
});
test('configured Point pilot does not issue when simulation gate is off', async () => {
  const env = { SIISOLUTIONS_PILOT_ISSUERS_JSON: JSON.stringify({
    [businessId]: { operator_rut: '76509283-3', api_key: 'not-real', verified: true },
  }) };
  const issue = createConfiguredPointFiscalPilot({ admin, env });
  assert.deepEqual(await issue({ businessId, invoiceId }), {
    state: 'blocked', reason: 'SIMULATION_NOT_ENABLED',
  });
});
