import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveAuthorizedBoleta39 } from './fiscal-authorization.mjs';

function fixture() {
  const calls = [];
  const deps = {
    async getBusiness(id) { return { id, issuerRut: '12345678-5', fiscalEnabled: true, issuerVerified: true }; },
    async canIssue() { return true; },
    async getSale({ businessId, saleId }) {
      return { id: saleId, businessId, issuerRut: '12345678-5', fiscalEligible: true };
    },
    async reserve(args) { calls.push(args); return { operationId: 1, folio: 700 }; }
  };
  return { deps, calls, input: { actorId: 'actor-1', businessId: 'business-1', saleId: 'sale-1', deps } };
}
test('authorized actor reserves using verified issuer from DB', async () => {
  const f = fixture();
  assert.equal((await reserveAuthorizedBoleta39(f.input)).folio, 700);
  assert.deepEqual(f.calls, [{ businessId: 'business-1', saleId: 'sale-1', issuerRut: '12345678-5' }]);
});
for (const [name, mutate] of [
  ['unknown business', d => { d.getBusiness = async () => null; }],
  ['unverified issuer', d => { d.getBusiness = async id => ({ id, issuerRut: '12345678-5', fiscalEnabled: true, issuerVerified: false }); }],
  ['disabled fiscal feature', d => { d.getBusiness = async id => ({ id, issuerRut: '12345678-5', fiscalEnabled: false, issuerVerified: true }); }],
  ['unauthorized actor', d => { d.canIssue = async () => false; }],
  ['wrong tenant sale', d => { d.getSale = async ({ saleId }) => ({ id: saleId, businessId: 'other-business', issuerRut: '12345678-5', fiscalEligible: true }); }],
  ['wrong sale issuer', d => { d.getSale = async ({ saleId, businessId }) => ({ id: saleId, businessId, issuerRut: '87654321-K', fiscalEligible: true }); }],
  ['ineligible sale', d => { d.getSale = async ({ saleId, businessId }) => ({ id: saleId, businessId, issuerRut: '12345678-5', fiscalEligible: false }); }]
]) {
  test('rejects ' + name + ' before folio reservation', async () => {
    const f = fixture(); mutate(f.deps);
    await assert.rejects(reserveAuthorizedBoleta39(f.input));
    assert.equal(f.calls.length, 0);
  });
}
test('rejects invalid identity and missing adapters', async () => {
  const f = fixture();
  await assert.rejects(reserveAuthorizedBoleta39({ ...f.input, actorId: '' }));
  await assert.rejects(reserveAuthorizedBoleta39({ ...f.input, deps: {} }));
  assert.equal(f.calls.length, 0);
});
