import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBoletaPayload, santiagoDate, CONSUMIDOR_FINAL } from '../../lib/payload.mjs';

const OP = 'WLK-b1-s1';
const RUT = '76123456-7';
const FECHA = '2026-10-31';
const line = (over = {}) => ({ name: 'Café', unitPrice: 1190, quantity: 2, discountPct: 0, category: 'IVA_AFECTO_19', ...over });
const SUC = { nombre: 'SUCURSAL DE PRUEBA', codigo: '1' };
const build = (over = {}) => buildBoletaPayload({ operationId: OP, rutOperador: RUT, lines: [line()], montoPago: 2380, medioPago: 'EF', fechaEmision: FECHA, sucursal: SUC, ...over });

test('nombres y tipos del ejemplo oficial: montoPago y vuelto texto, total y descuentoGlobal número', () => {
  const p = build();
  assert.equal(p.rutOperador, RUT);
  assert.equal(p.idBoletaOperacion, OP);
  assert.equal(p.folio, null);
  assert.equal(p.fechaEmision, FECHA);
  assert.equal(p.total, 2380);
  assert.equal(p.descuentoGlobal, 0);
  assert.equal(p.montoPago, '2380');
  assert.equal(p.vuelto, '0');
  assert.equal(p.medioPago, 'EF');
  assert.equal(p.formatoPdf, '80mm');
  assert.equal(p.retornarPdf, true);
  assert.equal(p.retornarXml, true);
  assert.equal(p.modoPdfSalida, 'base64');
  assert.equal(p.modoEntrada, 'json');
  assert.equal(p.enviarCorreo, false);
  assert.deepEqual(p.referencias, []);
  assert.equal(p.cliente.rut, CONSUMIDOR_FINAL.rut);
  assert.equal(p.sucursalEmision, SUC.nombre);
  assert.equal(p.sucursalCodigo, SUC.codigo);
});

test('precio de detalle es NETO (ejemplo: precio 10000 -> precioSubtotal 11900 bruto); subtotal es bruto', () => {
  const p = build({ lines: [line({ unitPrice: 1190, quantity: 2 })], montoPago: 2380 });
  assert.equal(p.detalles[0].precio, 1000);
  assert.equal(p.detalles[0].precioSubtotal, 2380);
  assert.equal(p.detalles[0].cantidad, 2);
  assert.equal(p.detalles[0].esExento, false);
  assert.equal(p.detalles[0].precioDescuento, 0);
});

test('línea EXENTA: precio igual al bruto y esExento true', () => {
  const p = build({ lines: [line({ category: 'EXENTO', unitPrice: 500, quantity: 1 })], montoPago: 500, medioPago: 'PE' });
  assert.equal(p.detalles[0].esExento, true);
  assert.equal(p.detalles[0].precio, 500);
  assert.equal(p.medioPago, 'PE');
});

test('venta de $100 CLP: precio neto 84, subtotal 100', () => {
  const p = build({ lines: [line({ name: 'Prueba', unitPrice: 100, quantity: 1 })], montoPago: 100 });
  assert.equal(p.detalles[0].precio, 84);
  assert.equal(p.detalles[0].precioSubtotal, 100);
  assert.equal(p.total, 100);
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

test('fecha de emisión inválida se rechaza', () => {
  assert.throws(() => build({ fechaEmision: '31/10/2026' }), { code: 'PAYLOAD_INVALID' });
});

test('sin operationId o sin RUT se rechaza', () => {
  assert.throws(() => build({ operationId: '' }), { code: 'PAYLOAD_INVALID' });
  assert.throws(() => build({ rutOperador: '' }), { code: 'PAYLOAD_INVALID' });
});

test('santiagoDate usa la fecha local de Santiago, no UTC', () => {
  // 2026-11-01 02:30 UTC = 2026-10-31 23:30 en Santiago (UTC-03 en octubre).
  assert.equal(santiagoDate(new Date('2026-11-01T02:30:00Z')), '2026-10-31');
});

test('sin sucursal configurada se rechaza: no hay valor por defecto', () => {
  assert.throws(() => build({ sucursal: undefined }), { code: 'SUCURSAL_NOT_CONFIGURED' });
  assert.throws(() => build({ sucursal: { nombre: '', codigo: '0' } }), { code: 'SUCURSAL_NOT_CONFIGURED' });
});

test('desglose neto/IVA: $100 bruto -> neto 84 + IVA 16 = 100 exacto', () => {
  const p = build({ lines: [line({ unitPrice: 100, quantity: 1 })], montoPago: 100 });
  assert.equal(p.detalles[0].precio, 84);
  assert.equal(p.detalles[0].precioSubtotal, 100);
});

test('desglose neto/IVA: cualquier línea afecta que no cuadre exacto se rechaza', () => {
  for (const unitPrice of [1, 2, 3, 7, 101, 999, 1234]) {
    const sub = unitPrice;
    const net = Math.round(unitPrice / 1.19);
    const ok = net + Math.round(net * 0.19) === sub;
    if (ok) {
      assert.doesNotThrow(() => build({ lines: [line({ unitPrice, quantity: 1 })], montoPago: unitPrice }), String(unitPrice));
    } else {
      assert.throws(() => build({ lines: [line({ unitPrice, quantity: 1 })], montoPago: unitPrice }), { code: 'PRICE_MISMATCH' }, String(unitPrice));
    }
  }
});
