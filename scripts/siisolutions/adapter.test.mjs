import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBoletaPayload } from '../../api/_lib/siisolutions-adapter.js';

const sale = { id: 'TEST-1', operatorRut: '76509283-3', total: 5950, paymentMethod: 'cash', items: [{ description: 'Producto', unitPrice: 5950, quantity: 1, subtotal: 5950 }] };

test('maps boleta without fiscal folio', () => {
  const result = buildBoletaPayload(sale);
  assert.equal(result.detalles[0].precioSubtotal, 5950);
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

test('DTECore production contract: provider allocates folio and Chile date', () => {
  const result = buildBoletaPayload({ ...sale, paymentMethod: 'mercado_pago' });
  assert.equal(result.folio, undefined);
  assert.equal(result.fechaEmision, undefined);
  assert.equal(result.retornaPdf, undefined);
  assert.equal(result.retornarPdf, true);
  assert.equal(result.retornarXml, true);
  assert.equal(result.modoPdfSalida, 'base64');
  assert.equal(result.enviarCorreo, false);
  assert.equal(result.montoPago, '5950');
  assert.equal(result.detalles[0].linea, 1);
  assert.equal(result.detalles[0].precio, 5950);
});
test('rejects discounted lines until the fiscal totals can be represented exactly', () => {
  assert.throws(() => buildBoletaPayload({
    ...sale, total: 5000,
    items: [{ description: 'Producto', unitPrice: 5950, quantity: 1, subtotal: 5000 }],
  }), /Line subtotal mismatch/);
});
test('maps transfer to DTECore TF payment method', () => {
  assert.equal(buildBoletaPayload({ ...sale, paymentMethod: 'bank_transfer' }).medioPago, 'TF');
});
