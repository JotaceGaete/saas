import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFiscalIssuanceRepository } from '../../api/_lib/siisolutions-repository.js';

test('claim uses atomic RPC and duplicate returns false', async () => {
  const calls = [];
  const repo = createFiscalIssuanceRepository({ rpc: async (name, args) => {
    calls.push({ name, args });
    return { data: false, error: null };
  } });
  assert.equal(await repo.claimPending({ businessId: 'a', saleId: 'b', operationId: 'c', dteType: 39 }), false);
  assert.equal(calls[0].name, 'crm_claim_fiscal_issuance');
});
test('finalize rejects ambiguous database result', async () => {
  const repo = createFiscalIssuanceRepository({ rpc: async () => ({ data: false, error: null }) });
  await assert.rejects(() => repo.finalize({ businessId: 'a', saleId: 'b', operationId: 'c', state: 'unknown' }), /reconcile manually/);
});
