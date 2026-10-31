import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectDteCoreReadiness } from '../../api/_lib/siisolutions-readiness.js';
const businessId = 'cda904a1-e331-4bd4-9f33-a6715687d3dd';
const secret = 'do-not-expose';
const valid = { [businessId]: { operator_rut: '76509283-3', api_key: secret, verified: true } };
test('valid business-scoped config never exposes secrets or claims live readiness', () => {
  const result = inspectDteCoreReadiness({
    SIISOLUTIONS_PILOT_ISSUERS_JSON: JSON.stringify(valid),
    SIISOLUTIONS_EMISSION_ENABLED: 'simulation',
    SIISOLUTIONS_RECONCILIATION_ENABLED: 'verified-readonly',
  });
  assert.equal(result.issuerCredentialsConfigured, true);
  assert.equal(result.configIssue, null);
  assert.equal(result.readyForLiveEmission, false);
  assert.equal(result.liveEmissionEnabled, false);
  assert.equal(JSON.stringify(result).includes(secret), false);
});
test('missing credentials are reported without attempting emission', () => {
  const result = inspectDteCoreReadiness({});
  assert.equal(result.issuerCredentialsConfigured, false);
  assert.equal(result.configIssue, 'MISSING_ISSUERS_JSON');
});
test('incorrect camelCase credentials are rejected before checkout', () => {
  const result = inspectDteCoreReadiness({ SIISOLUTIONS_PILOT_ISSUERS_JSON:
    JSON.stringify({ [businessId]: { operatorRut: '76509283-3', apiKey: secret, verified: true } }) });
  assert.equal(result.configIssue, 'INVALID_ISSUER_RECORD');
});
test('malformed JSON and placeholder business UUID are rejected', () => {
  assert.equal(inspectDteCoreReadiness({ SIISOLUTIONS_PILOT_ISSUERS_JSON: '{' }).configIssue, 'INVALID_ISSUERS_JSON');
  assert.equal(inspectDteCoreReadiness({ SIISOLUTIONS_PILOT_ISSUERS_JSON:
    JSON.stringify({ UUID_DEL_COMERCIO: valid[businessId] }) }).configIssue, 'INVALID_ISSUER_RECORD');
});
