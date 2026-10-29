import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBusinessFiscalIssuerResolver } from '../../api/_lib/siisolutions-issuer-resolver.js';

const valid = {
  business_id: 'biz-1', provider: 'siisolutions', dte_type: 39,
  enabled: true, verified: true, operator_rut: '12345678-5',
  api_key: 'private-secret',
};

test('resolves only verified business-scoped fiscal authorization', async () => {
  const resolve = createBusinessFiscalIssuerResolver({
    loadAuthorization: async ({ businessId }) => {
      assert.equal(businessId, 'biz-1');
      return valid;
    },
  });
  assert.deepEqual(await resolve({ businessId: 'biz-1' }), {
    businessId: 'biz-1', authorized: true,
    operatorRut: '12345678-5', apiKey: 'private-secret',
  });
});

test('rejects mismatched, disabled and unverified authorizations', async () => {
  for (const override of [
    { business_id: 'other' }, { enabled: false }, { verified: false },
    { provider: 'other' }, { dte_type: 41 }, { operator_rut: '' },
    { api_key: '' },
  ]) {
    const resolve = createBusinessFiscalIssuerResolver({
      loadAuthorization: async () => ({ ...valid, ...override }),
    });
    assert.equal(await resolve({ businessId: 'biz-1' }), null);
  }
});

test('requires a trusted authorization loader', () => {
  assert.throws(() => createBusinessFiscalIssuerResolver({}));
});
