import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBoletaPayload, santiagoDate, expectedTotals, CONSUMIDOR_FINAL } from '../../lib/payload.mjs';

const OP = 'WLK-b1-s1';
const RUT = '76123456-7';
const line = (over = {}) => ({ name: 'Café', unitPrice: 1190, quantity: 2, discountPct: 0, category: 'IVA_AFECTO_19', ...over });
const build = (over = {}) => buildBoletaPayload({ operationId: OP, rutOperador: RUT, lines: [line()], montoPago: 2380, medioPago: 'EF', ...over });

test('campos iguales a los de la emisión aceptada (51106): sin folio, sin fecha, sin total, sin sucursal', () => {
  const p = build();
  assert.deepEqual(Object.keys(p).sort(), [
    'cliente', 'descuentoGlobal', 'detalles', 'enviarCorreo', 'formatoPdf', 'idBoletaOperacion', 'medioPago',
    'modoPdfSalida', 'montoPago', 'referencias', 'retornarPdf', 'retornarXml', 'rutOperador', 'vuelto',
  ]);
  assert.equal(p.rutOperador, RUT);
  assert.equal(p.idBoletaOperacion, OP);
  assert.equal(p.descuentoGlobal, 0);
  assert.equal(p.montoPago, '2380');
  assert.equal(p.vuelto, '0');
  assert.equal(p.medioPago, 'EF');
  assert.equal(p.formatoPdf, '80mm');
  assert.equal(p.retornarPdf, true);
  assert.equal(p.retornarXml, true);
  assert.equal(p.modoPdfSalida, 'base64');
  assert.equal(p.enviarCorreo, false);
  assert.deepEqual(p.referencias, []);
  assert.deepEqual(p.cliente, { rut: '66666666', digito: '6', razonSocial: 'CLIENTE VARIOS' });
  assert.equal(CONSUMIDOR_FINAL.razonSocial, 'CLIENTE VARIOS');
});

test('precio de detalle es BRUTO (IVA incluido), igual que PrcItem en los XML aceptados', () => {
  const p = build({ lines: [line({ unitPrice: 1190, quantity: 2 })], montoPago: 2380 });
  assert.equal(p.detalles[0].precio, 1190);
  assert.equal(p.detalles[0].precioSubtotal, 2380);
  assert.equal(p.detalles[0].cantidad, 2);
  assert.equal(p.detalles[0].esExento, false);
  assert.equal(p.detalles[0].precioDescuento, 0);
});

test('venta de $100: precio 100, subtotal 100; totales esperados 84 + 16 = 100 (como la 51106)', () => {
  const p = build({ lines: [line({ name: 'prueba', unitPrice: 100, quantity: 1 })], montoPago: 100 });
  assert.equal(p.detalles[0].precio, 100);
  assert.equal(p.detalles[0].precioSubtotal, 100);
  assert.deepEqual(expectedTotals(p), { neto: 84, iva: 16, exento: 0, total: 100 });
});

test('venta de $1.190: totales esperados 1000 + 190 (como la 51105)', () => {
  const p = build({ lines: [line({ unitPrice: 1190, quantity: 1 })], montoPago: 1190 });
  assert.deepEqual(expectedTotals(p), { neto: 1000, iva: 190, exento: 0, total: 1190 });
});

test('$999: el total nunca cambia por redondeo; el neto/IVA los calcula el proveedor', () => {
  const p = build({ lines: [line({ unitPrice: 999, quantity: 1 })], montoPago: 999 });
  assert.equal(p.detalles[0].precio, 999);
  const t = expectedTotals(p);
  assert.equal(t.total, 999);
  assert.equal(t.neto + t.iva, 999);
});

test('línea EXENTA: esExento true, precio bruto, cuenta como exento en los totales', () => {
  const p = build({ lines: [line({ category: 'EXENTO', unitPrice: 500, quantity: 1 })], montoPago: 500, medioPago: 'PE' });
  assert.equal(p.detalles[0].esExento, true);
  assert.equal(p.detalles[0].precio, 500);
  assert.equal(p.medioPago, 'PE');
  assert.deepEqual(expectedTotals(p), { neto: 0, iva: 0, exento: 500, total: 500 });
});

test('línea sin categoría tributaria verificada se rechaza', () => {
  assert.throws(() => build({ lines: [line({ category: null })] }), { code: 'FISCAL_TAX_LINES_NOT_VERIFIED' });
});

test('sucursal: opcional (la 51106 se aceptó sin ella); si existe se envía completa', () => {
  assert.equal('sucursalEmision' in build(), false);
  const p = build({ sucursal: { nombre: 'CASA MATRIZ', codigo: '1' } });
  assert.equal(p.sucursalEmision, 'CASA MATRIZ');
  assert.equal(p.sucursalCodigo, '1');
  assert.throws(() => build({ sucursal: { nombre: '', codigo: '0' } }), { code: 'PAYLOAD_INVALID' });
});

test('descripción de más de 80 caracteres se rechaza (no se trunca en silencio)', () => {
  assert.throws(() => build({ lines: [line({ name: 'x'.repeat(81) })] }), { code: 'DESCRIPTION_TOO_LONG' });
});

test('descripción de exactamente 80 caracteres se acepta', () => {
  const p = build({ lines: [line({ name: 'x'.repeat(80), quantity: 1, unitPrice: 2380 })], montoPago: 2380 });
  assert.equal(p.detalles[0].descripcion.length, 80);
});

test('precios no enteros o no positivos se rechazan', () => {
  for (const unitPrice of [1190.5, 0, -1, '1190', NaN]) {
    assert.throws(() => build({ lines: [line({ unitPrice })] }), { code: 'PAYLOAD_INVALID' }, String(unitPrice));
  }
});

test('suma de líneas brutas distinta del monto cobrado se rechaza', () => {
  assert.throws(() => build({ montoPago: 2379 }), { code: 'PRICE_MISMATCH' });
});

test('descuento en línea se rechaza', () => {
  assert.throws(() => build({ lines: [line({ discountPct: 10 })] }), { code: 'DISCOUNT_NOT_SUPPORTED' });
});

test('medio de pago fuera de EF/PE se rechaza', () => {
  assert.throws(() => build({ medioPago: 'TC' }), { code: 'PAYLOAD_INVALID' });
});

test('sin operationId o con RUT mal formado se rechaza', () => {
  assert.throws(() => build({ operationId: '' }), { code: 'PAYLOAD_INVALID' });
  assert.throws(() => build({ rutOperador: '' }), { code: 'PAYLOAD_INVALID' });
  assert.throws(() => build({ rutOperador: '77.804.207-K' }), { code: 'PAYLOAD_INVALID' });
  assert.doesNotThrow(() => build({ rutOperador: '77804207-K' }));
});

test('santiagoDate usa la fecha local de Santiago, no UTC', () => {
  // 2026-11-01 02:30 UTC = 2026-10-31 23:30 en Santiago (UTC-03 en octubre).
  assert.equal(santiagoDate(new Date('2026-11-01T02:30:00Z')), '2026-10-31');
});
