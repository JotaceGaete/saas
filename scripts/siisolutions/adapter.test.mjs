import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBoletaPayload } from '../../api/_lib/siisolutions-adapter.js';

const sale = { id: 'TEST-1', operatorRut: '76509283-3', total: 5950, paymentMethod: 'cash', items: [{ description: 'Producto', unitPrice: 5950, quantity: 1, subtotal: 5950 }] };

test('maps boleta without fiscal folio', () => {
  const result = buildBoletaPayload(sale);
  assert.equal(result.total, 5950);
  assert.equal(result.idBoletaOperacion, 'TEST-1');
  assert.equal(result.folio, undefined);
});

test('refuses inconsistent total', () => {
  assert.throws(() => buildBoletaPayload({ ...sale, total: 100 }), /total/);
});

test('maps Mercado Pago Point to electronic payment and 80mm PDF', () => {
  const result = buildBoletaPayload({ ...sale, paymentMethod: 'mercado_pago' });
  assert.equal(result.medioPago, 'PE');
  assert.equal(result.formatoPdf, '80mm');
  assert.equal(result.rutOperador, '76509283-3');
});
test('requires authorized operator', () => {
  assert.throws(() => buildBoletaPayload({ ...sale, operatorRut: undefined }), /operator RUT/);
});
