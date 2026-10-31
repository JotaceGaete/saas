import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBoletaPayload } from '../../lib/payload.mjs';

const OP = 'WLK-b1-s1';
const RUT = '76123456-7';
const line = (over = {}) => ({ name: 'Café', unitPrice: 1190, quantity: 2, discountPct: 0, category: 'IVA_AFECTO_19', ...over });

test('construye el cuerpo DTECore con los campos del informe de integración', () => {
  const p = buildBoletaPayload({ operationId: OP, rutOperador: RUT, lines: [line()], montoPago: 2380, medioPago: 'EF' });
  assert.equal(p.idBoletaOperacion, OP);
  assert.equal(p.rutOperador, RUT);
  assert.equal(p.medioPago, 'EF');
  assert.equal(p.montoPago, 2380);
  assert.deepEqual(p.detalles, [{ linea: 1, descripcion: 'Café', precio: 1190, cantidad: 2, esExento: false }]);
  assert.equal(p.retornarPdf, true);
  assert.equal(p.formatoPdf, '80mm');
  assert.equal(p.modoPdfSalida, 'base64');
  assert.equal(p.enviarCorreo, false);
});

test('nunca envía folio ni fecha: los asigna el proveedor', () => {
  const p = buildBoletaPayload({ operationId: OP, rutOperador: RUT, lines: [line()], montoPago: 2380, medioPago: 'EF' });
  for (const k of ['folio', 'fechaEmision', 'folioRef']) assert.equal(k in p, false, k);
});

test('categoría EXENTO marca esExento', () => {
  const p = buildBoletaPayload({
    operationId: OP, rutOperador: RUT,
    lines: [line({ category: 'EXENTO', unitPrice: 500, quantity: 1 })], montoPago: 500, medioPago: 'PE',
  });
  assert.equal(p.detalles[0].esExento, true);
  assert.equal(p.medioPago, 'PE');
});

test('descripción de más de 80 caracteres se rechaza (no se trunca en silencio)', () => {
  assert.throws(
    () => buildBoletaPayload({ operationId: OP, rutOperador: RUT, lines: [line({ name: 'x'.repeat(81) })], montoPago: 2380, medioPago: 'EF' }),
    { code: 'DESCRIPTION_TOO_LONG' },
  );
});

test('descripción de exactamente 80 caracteres se acepta', () => {
  const p = buildBoletaPayload({ operationId: OP, rutOperador: RUT, lines: [line({ name: 'x'.repeat(80), quantity: 1, unitPrice: 2380 })], montoPago: 2380, medioPago: 'EF' });
  assert.equal(p.detalles[0].descripcion.length, 80);
});

test('precios no enteros o no positivos se rechazan', () => {
  for (const unitPrice of [1190.5, 0, -1, '1190', NaN]) {
    assert.throws(
      () => buildBoletaPayload({ operationId: OP, rutOperador: RUT, lines: [line({ unitPrice })], montoPago: 2380, medioPago: 'EF' }),
      { code: 'PAYLOAD_INVALID' },
      String(unitPrice),
    );
  }
});

test('suma de líneas distinta del monto cobrado se rechaza', () => {
  assert.throws(
    () => buildBoletaPayload({ operationId: OP, rutOperador: RUT, lines: [line()], montoPago: 2379, medioPago: 'EF' }),
    { code: 'PRICE_MISMATCH' },
  );
});

test('descuento en línea se rechaza', () => {
  assert.throws(
    () => buildBoletaPayload({ operationId: OP, rutOperador: RUT, lines: [line({ discountPct: 10 })], montoPago: 2380, medioPago: 'EF' }),
    { code: 'DISCOUNT_NOT_SUPPORTED' },
  );
});

test('medio de pago fuera de EF/PE se rechaza', () => {
  assert.throws(
    () => buildBoletaPayload({ operationId: OP, rutOperador: RUT, lines: [line()], montoPago: 2380, medioPago: 'TC' }),
    { code: 'PAYLOAD_INVALID' },
  );
});

test('sin operationId o sin RUT se rechaza', () => {
  assert.throws(() => buildBoletaPayload({ operationId: '', rutOperador: RUT, lines: [line()], montoPago: 2380, medioPago: 'EF' }), { code: 'PAYLOAD_INVALID' });
  assert.throws(() => buildBoletaPayload({ operationId: OP, rutOperador: '', lines: [line()], montoPago: 2380, medioPago: 'EF' }), { code: 'PAYLOAD_INVALID' });
});
