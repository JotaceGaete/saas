import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueVerifiedPointBoleta } from '../../api/_lib/siisolutions-point-orchestrator.js';

const businessId = '11111111-1111-4111-8111-111111111111';
const saleId = '22222222-2222-4222-8222-222222222222';
const sale = { id: saleId, business_id: businessId, total: 59500, status: 'pagada', items: [{ description: 'Servicio', unitPrice: 59500, quantity: 1, subtotal: 59500 }] };
const payment = { business_id: businessId, sale_id: saleId, provider: 'mercado_pago', channel: 'point', verified_by_server: true, status: 'approved', provider_payment_id: '123', currency: 'CLP', amount: 59500 };
const params = { sale, payment, businessId, issuerBusinessId: businessId, operatorRut: '76509283-3', apiKey: 'fake', simulationVerified: true };

test('blocks without verified simulation; does not send', async () => {
  const result = await issueVerifiedPointBoleta({ ...params, simulationVerified: false });
  assert.equal(result.reason, 'SIMULATION_NOT_VERIFIED');
});
test('blocks unverified payments', async () => {
  const result = await issueVerifiedPointBoleta({ ...params, payment: { ...payment, verified_by_server: false } });
  assert.equal(result.reason, 'PAYMENT_UNVERIFIED');
});
test('duplicate claims never send', async () => {
  const prev = process.env.SIISOLUTIONS_EMISSION_ENABLED;
  process.env.SIISOLUTIONS_EMISSION_ENABLED = 'simulation';
  try {
    let sends = 0;
    const result = await issueVerifiedPointBoleta({ ...params, repository: { claimPending: async () => false, finalize: async () => {} }, fetchImpl: async () => { sends++; throw new Error('unexpected'); } });
    assert.equal(result.state, 'already_claimed');
    assert.equal(sends, 0);
  } finally {
    if (prev === undefined) delete process.env.SIISOLUTIONS_EMISSION_ENABLED;
    else process.env.SIISOLUTIONS_EMISSION_ENABLED = prev;
  }
});
test('ambiguous timeout is marked unknown, not retried', async () => {
  const prev = process.env.SIISOLUTIONS_EMISSION_ENABLED;
  process.env.SIISOLUTIONS_EMISSION_ENABLED = 'simulation';
  try {
    let finalized;
    let sends = 0;
    const result = await issueVerifiedPointBoleta({ ...params, repository: { claimPending: async () => true, finalize: async (data) => { finalized = data; } }, fetchImpl: async () => { sends++; throw new Error('timeout'); } });
    assert.equal(result.state, 'unknown');
    assert.equal(finalized.state, 'unknown');
    assert.equal(sends, 1);
  } finally {
    if (prev === undefined) delete process.env.SIISOLUTIONS_EMISSION_ENABLED;
    else process.env.SIISOLUTIONS_EMISSION_ENABLED = prev;
  }
});
