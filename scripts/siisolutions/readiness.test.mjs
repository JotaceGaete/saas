import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectDteCoreReadiness } from '../../api/_lib/siisolutions-readiness.js';
test('preflight exposes no secrets and never claims live emission readiness',()=>{
  const secret='do-not-expose';
  const result=inspectDteCoreReadiness({
    SIISOLUTIONS_PILOT_ISSUERS_JSON:JSON.stringify({business:{apiKey:secret}}),
    SIISOLUTIONS_EMISSION_ENABLED:'simulation',
    SIISOLUTIONS_RECONCILIATION_ENABLED:'verified-readonly',
  });
  assert.equal(result.issuerCredentialsConfigured,true);
  assert.equal(result.readyForLiveEmission,false);
  assert.equal(result.liveEmissionEnabled,false);
  assert.equal(JSON.stringify(result).includes(secret),false);
});
test('missing credentials are reported without attempting emission',()=>{
  const result=inspectDteCoreReadiness({});
  assert.equal(result.issuerCredentialsConfigured,false);
  assert.equal(result.simulationEnabled,false);
});
