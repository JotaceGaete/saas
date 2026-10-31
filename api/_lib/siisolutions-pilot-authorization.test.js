import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFiscalPilotAuthorizationLoader } from './siisolutions-pilot-authorization.js';
import { createBusinessFiscalIssuerResolver } from './siisolutions-issuer-resolver.js';

const businessA = '11111111-1111-4111-8111-111111111111';
const businessB = '22222222-2222-4222-8222-222222222222';
const entries = JSON.stringify({
  [businessA]: { operator_rut: '12345678-5', api_key: 'sandbox-only-key', verified: true },
});

test('simulation issuer is authorized for exactly its own business', async () => {
  const loadAuthorization = createFiscalPilotAuthorizationLoader({
    env: { SIISOLUTIONS_EMISSION_ENABLED: 'simulation', SIISOLUTIONS_PILOT_ISSUERS_JSON: entries },
  });
  const resolve = createBusinessFiscalIssuerResolver({ loadAuthorization });
  const a = await resolve({ businessId: businessA });
  assert.equal(a.businessId, businessA);
  assert.equal(a.authorized, true);
  assert.equal(await resolve({ businessId: businessB }), null);
});

test('production mode never loads simulation credentials', async () => {
  const load = createFiscalPilotAuthorizationLoader({
    env: { SIISOLUTIONS_EMISSION_ENABLED: 'production', SIISOLUTIONS_PILOT_ISSUERS_JSON: entries },
  });
  assert.equal(await load({ businessId: businessA }), null);
});

test('missing, malformed and unverified config fails closed', async () => {
  for (const value of [undefined, '{', '[]', '{}', JSON.stringify({ [businessA]: { operator_rut: '12345678-5', api_key: 'x', verified: false } })]) {
    const load = createFiscalPilotAuthorizationLoader({
      env: { SIISOLUTIONS_EMISSION_ENABLED: 'simulation', SIISOLUTIONS_PILOT_ISSUERS_JSON: value },
    });
    assert.equal(await load({ businessId: businessA }), null);
  }
});
