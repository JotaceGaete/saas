import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueCheckoutBoleta } from '../../api/_lib/siisolutions-checkout-issuer.js';
import { getFiscalPrintDecision } from '../../api/_lib/siisolutions-print-readiness.js';

const businessId = '11111111-1111-4111-8111-111111111111';
const saleId = '22222222-2222-4222-8222-222222222222';
const sale = {
  id: saleId, business_id: businessId, status: 'pagada', total: 5950,
  items: [{ description: 'Producto de prueba', unitPrice: 5950, quantity: 1, subtotal: 5950 }],
};
const base = {
  sale, businessId, issuerBusinessId: businessId, operatorRut: '76509283-3',
  apiKey: 'FAKE_OFFLINE_KEY', sandboxBaseUrl: 'https://sandbox.example.invalid',
};
const cash = {
  business_id: businessId, sale_id: saleId, method: 'cash',
  amount: 5950, currency: 'CLP', status: 'received', received_by_cashier: true,
};
const point = {
  ...cash, method: 'mercado_pago', provider: 'mercado_pago', channel: 'point',
  status: 'approved', verified_by_server: true, provider_payment_id: 'FAKE-POINT-1',
};

async function inSimulation(callback) {
  const before = process.env.SIISOLUTIONS_EMISSION_ENABLED;
  process.env.SIISOLUTIONS_EMISSION_ENABLED = 'simulation';
  try { return await callback(); }
  finally {
    if (before === undefined) delete process.env.SIISOLUTIONS_EMISSION_ENABLED;
    else process.env.SIISOLUTIONS_EMISSION_ENABLED = before;
  }
}

for (const [label, payment, expectedMethod] of [
  ['efectivo', cash, 'EF'],
  ['Point', point, 'PE'],
]) {
  test(`offline: ${label} -> mock fiscal issuance -> printable PDF`, async () => inSimulation(async () => {
    const operations = [];
    let providerCalls = 0;
    const repository = {
      claimPending: async (args) => { operations.push(['claim', args]); return true; },
      finalize: async (args) => { operations.push(['finalize', args]); },
    };
    const result = await issueCheckoutBoleta({
      ...base, payment, repository,
      fetchImpl: async (url, request) => {
        providerCalls++;
        assert.equal(new URL(url).hostname, 'sandbox.example.invalid');
        assert.equal(request.method, 'POST');
        const payload = JSON.parse(request.body);
        assert.equal(payload.medioPago, expectedMethod);
        assert.equal(payload.formatoPdf, '80mm');
        assert.equal(payload.retornarXml, true);
        assert.equal(payload.folio, undefined);
        return { status: 200, json: async () => ({
          folio: 1042, xmlBase64: 'eG1s', pdfBase64: 'cGRm',
        }) };
      },
    });
    assert.equal(providerCalls, 1);
    assert.equal(result.state, 'issued');
    assert.equal(operations[0][0], 'claim');
    assert.equal(operations[1][0], 'finalize');
    const saved = operations[1][1];
    assert.equal(saved.state, 'issued');
    const decision = getFiscalPrintDecision({
      status: saved.state, folio: saved.folio,
      xml_base64: saved.xmlBase64, pdf_base64: saved.pdfBase64,
    });
    assert.equal(decision.printable, true);
    assert.equal(decision.pdfBase64, 'cGRm');
  }));
}

test('offline: provider timeout remains unknown and is never printable', async () => inSimulation(async () => {
  let saved;
  let calls = 0;
  const result = await issueCheckoutBoleta({
    ...base, payment: cash,
    repository: {
      claimPending: async () => true,
      finalize: async (outcome) => { saved = outcome; },
    },
    fetchImpl: async () => { calls++; throw new Error('simulated timeout'); },
  });
  assert.equal(calls, 1);
  assert.equal(result.state, 'unknown');
  assert.equal(saved.requiresManualReconciliation, true);
  assert.equal(getFiscalPrintDecision({ status: saved.state }).printable, false);
});

test('offline: unverified Point is blocked before contacting any provider', async () => inSimulation(async () => {
  let called = false;
  const result = await issueCheckoutBoleta({
    ...base, payment: { ...point, verified_by_server: false },
    fetchImpl: async () => { called = true; throw Error('unexpected'); },
  });
  assert.equal(result.state, 'blocked');
  assert.equal(called, false);
}));
