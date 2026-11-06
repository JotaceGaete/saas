import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEligibility } from '../../lib/eligibility.mjs';

const OP = 'WLK-b1-s1';
const base = () => ({
  sale: { id: 's1', businessId: 'b1', status: 'pagada', paidAt: new Date(), total: 2380, discountAmount: 0 },
  business: { id: 'b1', userId: 'u1', countryCode: 'CL' },
  issuer: { issuerRut: '76123456-7', enabled: true, verified: true, rutConfirmed: true, sucursal: { nombre: 'SUCURSAL DE PRUEBA', codigo: '1' } },
  emissionEnabled: true,
  taxLinesVerified: true,
  lines: [{ name: 'Café', unitPrice: 1190, quantity: 2, discountPct: 0, category: 'IVA_AFECTO_19' }],
  payments: [{ method: 'cash', amount: 2380, status: 'received', voided: false }],
  pointOps: [],
  operationId: OP,
});
const MP = [{ method: 'mercado_pago', amount: 2380, status: 'received', voided: false }];
const point = (over = {}) => ({
  mpStatus: 'processed', mpOrderId: 'o1', mpPaymentId: 'p1', finalizedAt: new Date(), currency: 'CLP', amount: 2380, ...over,
});
const run = (over) => evaluateEligibility({ ...base(), ...over });

test('venta en efectivo elegible -> EF con payload válido', () => {
  const r = run({});
  assert.equal(r.medioPago, 'EF');
  assert.equal(r.montoPago, 2380);
  assert.equal(r.payload.idBoletaOperacion, OP);
});

test('venta Point confirmada con monto exacto -> PE', () => {
  const r = run({ payments: MP, pointOps: [point()] });
  assert.equal(r.medioPago, 'PE');
});

test('Point confirmada pero pagada con tarjeta (no mercado_pago) -> UNSUPPORTED_PAYMENT_METHOD', () => {
  assert.throws(() => run({ payments: [{ method: 'card', amount: 2380, status: 'received', voided: false }], pointOps: [point()] }), { code: 'UNSUPPORTED_PAYMENT_METHOD' });
});

test('Point confirmada sin pago mercado_pago registrado -> PAYMENT_AMOUNT_MISMATCH', () => {
  assert.throws(() => run({ payments: [], pointOps: [point()] }), { code: 'PAYMENT_AMOUNT_MISMATCH' });
});

test('tarjeta sin operación Point confirmada no es elegible', () => {
  assert.throws(() => run({ payments: [{ method: 'card', amount: 2380, status: 'received', voided: false }], pointOps: [] }), { code: 'NO_CONFIRMED_PAYMENT' });
});

test('venta no pagada o total cero no es elegible', () => {
  const b = base();
  assert.throws(() => run({ sale: { ...b.sale, status: 'abierta' } }), { code: 'SALE_NOT_ELIGIBLE' });
  assert.throws(() => run({ sale: { ...b.sale, paidAt: null } }), { code: 'SALE_NOT_ELIGIBLE' });
  assert.throws(() => run({ sale: { ...b.sale, total: 0 } }), { code: 'SALE_NOT_ELIGIBLE' });
});

test('país distinto de CL no es elegible', () => {
  assert.throws(() => run({ business: { ...base().business, countryCode: 'AR' } }), { code: 'COUNTRY_NOT_SUPPORTED' });
});

test('emisor no habilitado o no verificado no es elegible', () => {
  assert.throws(() => run({ issuer: { ...base().issuer, enabled: false } }), { code: 'FISCAL_ISSUER_NOT_ENABLED' });
  assert.throws(() => run({ issuer: { ...base().issuer, verified: false } }), { code: 'FISCAL_ISSUER_NOT_ENABLED' });
  assert.throws(() => run({ issuer: null }), { code: 'FISCAL_ISSUER_NOT_ENABLED' });
  // Migración H: sin la confirmación del RUT por el propietario no hay payload.
  assert.throws(() => run({ issuer: { ...base().issuer, rutConfirmed: false } }), { code: 'FISCAL_RUT_NOT_CONFIRMED' });
  assert.throws(() => run({ issuer: { ...base().issuer, rutConfirmed: undefined } }), { code: 'FISCAL_RUT_NOT_CONFIRMED' });
});

test('emisión global deshabilitada bloquea', () => {
  assert.throws(() => run({ emissionEnabled: false }), { code: 'FISCAL_EMISSION_DISABLED' });
});

test('líneas sin categoría tributaria verificada bloquean', () => {
  assert.throws(() => run({ taxLinesVerified: false }), { code: 'FISCAL_TAX_LINES_NOT_VERIFIED' });
});

test('descuento de venta bloquea', () => {
  assert.throws(() => run({ sale: { ...base().sale, discountAmount: 100 } }), { code: 'DISCOUNT_NOT_SUPPORTED' });
});

test('pago mixto (efectivo + Point) se rechaza', () => {
  assert.throws(() => run({ pointOps: [point()] }), { code: 'MIXED_PAYMENTS' });
});

test('efectivo que no suma el total se rechaza', () => {
  assert.throws(() => run({ payments: [{ method: 'cash', amount: 2000, status: 'received', voided: false }] }), { code: 'PAYMENT_AMOUNT_MISMATCH' });
});

test('pagos anulados no cuentan: si no queda ningún pago confirmado, no es elegible', () => {
  assert.throws(() => run({ payments: [{ method: 'cash', amount: 2380, status: 'received', voided: true }] }), { code: 'NO_CONFIRMED_PAYMENT' });
});

test('Point no finalizada, sin procesar o con monto distinto no es elegible', () => {
  assert.throws(() => run({ payments: MP, pointOps: [point({ mpStatus: 'pending' })] }), { code: 'POINT_NOT_CONFIRMED' });
  assert.throws(() => run({ payments: MP, pointOps: [point({ finalizedAt: null })] }), { code: 'POINT_NOT_CONFIRMED' });
  assert.throws(() => run({ payments: MP, pointOps: [point({ amount: 2000 })] }), { code: 'POINT_NOT_CONFIRMED' });
  assert.throws(() => run({ payments: MP, pointOps: [point({ currency: 'USD' })] }), { code: 'POINT_NOT_CONFIRMED' });
});

test('dos operaciones Point para la misma venta no son elegibles', () => {
  assert.throws(() => run({ payments: MP, pointOps: [point(), point({ mpPaymentId: 'p2' })] }), { code: 'POINT_NOT_CONFIRMED' });
});

test('sin ningún pago confirmado no es elegible', () => {
  assert.throws(() => run({ payments: [] }), { code: 'NO_CONFIRMED_PAYMENT' });
});

test('sin sucursal del comercio: se emite igual (la 51106 se aceptó sin sucursal) y no se envía', () => {
  const r = run({ issuer: { issuerRut: '76123456-7', enabled: true, verified: true, rutConfirmed: true, sucursal: null } });
  assert.equal('sucursalEmision' in r.payload, false);
});

test('venta de otro día (hora de Santiago) se rechaza: sin boletas retroactivas', () => {
  const paidAt = new Date('2026-10-31T12:00:00Z');
  assert.throws(() => run({ sale: { ...base().sale, paidAt }, now: new Date('2026-11-01T12:00:00Z') }), { code: 'SALE_NOT_SAME_DAY' });
  // 23:30 del 31-10 en Santiago (02:30 UTC del 1-11) sigue siendo el mismo día local.
  assert.doesNotThrow(() => run({ sale: { ...base().sale, paidAt }, now: new Date('2026-11-01T02:30:00Z') }));
});

// --- Tratamiento tributario (migración G) ---------------------------------------------------
const lineOf = (category, unitPrice = 1190, quantity = 1, name = 'Café') => ({ name, unitPrice, quantity, discountPct: 0, category });

test('todas las líneas afectas (distintos productos) -> elegible', () => {
  const r = run({
    sale: { ...base().sale, total: 2380 },
    lines: [lineOf('IVA_AFECTO_19', 1190, 1, 'Café'), lineOf('IVA_AFECTO_19', 1190, 1, 'Té')],
  });
  assert.equal(r.payload.detalles.length, 2);
  assert.ok(r.payload.detalles.every((d) => d.esExento === false));
});

test('venta mixta afecta + exenta -> FISCAL_NON_TAXABLE_NOT_SUPPORTED, sin payload', () => {
  assert.throws(() => run({
    lines: [lineOf('IVA_AFECTO_19', 1190, 1), lineOf('EXENTO', 1190, 1, 'Libro')],
  }), { code: 'FISCAL_NON_TAXABLE_NOT_SUPPORTED' });
});

test('venta con un producto no afecto -> FISCAL_NON_TAXABLE_NOT_SUPPORTED', () => {
  assert.throws(() => run({ lines: [lineOf('NO_AFECTO', 1190, 2, 'Servicio')] }), { code: 'FISCAL_NON_TAXABLE_NOT_SUPPORTED' });
});

test('venta totalmente exenta -> FISCAL_NON_TAXABLE_NOT_SUPPORTED (correspondería a DTE 41)', () => {
  assert.throws(() => run({ lines: [lineOf('EXENTO', 1190, 2)] }), { code: 'FISCAL_NON_TAXABLE_NOT_SUPPORTED' });
});

test('línea sin tratamiento tributario -> FISCAL_TAX_LINES_NOT_VERIFIED, aunque la base diga lo contrario', () => {
  assert.throws(() => run({ taxLinesVerified: true, lines: [lineOf(null, 1190, 2)] }), { code: 'FISCAL_TAX_LINES_NOT_VERIFIED' });
  assert.throws(() => run({ taxLinesVerified: true, lines: [lineOf('OTRA', 1190, 2)] }), { code: 'FISCAL_TAX_LINES_NOT_VERIFIED' });
});

test('la base dice que faltan categorías -> FISCAL_TAX_LINES_NOT_VERIFIED aunque las líneas lleguen afectas', () => {
  assert.throws(() => run({ taxLinesVerified: false }), { code: 'FISCAL_TAX_LINES_NOT_VERIFIED' });
});
