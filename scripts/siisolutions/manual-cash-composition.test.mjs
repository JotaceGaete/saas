import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConfiguredManualCashFiscalPilot } from '../../api/_lib/siisolutions-manual-cash-pilot.js';

test('configured manual pilot rejects missing issuer config before any database read', async () => {
  let reads = 0;
  const admin = {
    from() { reads++; throw new Error('Unexpected database read'); },
    rpc() { throw new Error('Unexpected fiscal claim'); },
  };
  const pilot = createConfiguredManualCashFiscalPilot({
    admin,
    env: { SIISOLUTIONS_EMISSION_ENABLED: 'simulation' },
    sandboxBaseUrl: 'https://sandbox.example.test',
  });
  const result = await pilot({
    businessId: '11111111-1111-4111-8111-111111111111',
    invoiceId: '22222222-2222-4222-8222-222222222222',
    actorId: '33333333-3333-4333-8333-333333333333',
  });
  assert.equal(result.state, 'blocked');
  assert.equal(result.reason, 'MISSING_ISSUERS_JSON');
  assert.equal(reads, 0);
});

test('configured manual pilot rejects live emission mode', async () => {
  const admin = {
    from() { throw new Error('Unexpected database read'); },
    rpc() { throw new Error('Unexpected fiscal claim'); },
  };
  const businessId = '11111111-1111-4111-8111-111111111111';
  const pilot = createConfiguredManualCashFiscalPilot({
    admin,
    env: {
      SIISOLUTIONS_EMISSION_ENABLED: 'production',
      SIISOLUTIONS_PILOT_ISSUERS_JSON: JSON.stringify({
        [businessId]: { operator_rut: '12345678-5', api_key: 'fake-test-key', verified: true },
      }),
    },
  });
  const result = await pilot({
    businessId,
    invoiceId: '22222222-2222-4222-8222-222222222222',
    actorId: '33333333-3333-4333-8333-333333333333',
  });
  assert.deepEqual(result, { state: 'blocked', reason: 'SIMULATION_NOT_ENABLED' });
});
