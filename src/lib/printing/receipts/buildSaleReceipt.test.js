import { describe, expect, it } from 'vitest';
import { buildSaleReceipt } from './buildSaleReceipt';
import { renderEscPosReceipt } from './renderEscPosReceipt';

const business = { name: 'Mi Negocio', currency: 'CLP', address: 'Av. Siempre Viva 123', whatsapp: '+56912345678' };

const baseSale = {
  business,
  sale: { invoice_number: 42 },
  items: [
    { name: 'Producto A', unit_price: 1000, quantity: 2 },
    { name: 'Producto B', unit_price: 500, quantity: 1, note: 'Sin envolver' },
  ],
  customer: { name: 'Juan Pérez' },
  paymentMethod: 'cash',
  payments: [{ method: 'cash', amount: 2500 }],
  discountAmount: 0,
  subtotal: 2500,
  total: 2500,
  amountReceived: 3000,
  change: 500,
  pendingBalance: 0,
  createdAt: '2026-09-12T15:30:00.000Z',
};

function allText(receipt) {
  return receipt.lines.map((l) => l.text).join('\n');
}

describe('buildSaleReceipt', () => {
  it('devuelve un Receipt con lines/feedLines/cut, independiente de React/DOM', () => {
    const receipt = buildSaleReceipt(baseSale);
    expect(Array.isArray(receipt.lines)).toBe(true);
    expect(receipt.cut).toBe(true);
    expect(receipt.feedLines).toBeGreaterThan(0);
  });

  it('incluye nombre del negocio, dirección y "Terminal de Ventas"', () => {
    const text = allText(buildSaleReceipt(baseSale));
    expect(text).toContain('MI NEGOCIO');
    expect(text).toContain('Av. Siempre Viva 123');
    expect(text).toContain('Terminal de Ventas');
  });

  it('incluye el RUT solo si el negocio lo tiene', () => {
    const withRut = allText(buildSaleReceipt({ ...baseSale, business: { ...business, rut: '76.123.456-7' } }));
    expect(withRut).toContain('RUT: 76.123.456-7');

    const withoutRut = allText(buildSaleReceipt(baseSale));
    expect(withoutRut).not.toContain('RUT:');
  });

  it('usa el número de factura para el ticket, o un fallback si no hay venta aún', () => {
    expect(allText(buildSaleReceipt(baseSale))).toContain('Ticket: NV-0042');
    const withoutSale = allText(buildSaleReceipt({ ...baseSale, sale: null }));
    expect(withoutSale).toMatch(/Ticket: T-\d+/);
  });

  it('incluye cada ítem con cantidad, nombre y total de línea', () => {
    const text = allText(buildSaleReceipt(baseSale));
    expect(text).toContain('2x Producto A');
    expect(text).toContain('1x Producto B');
    expect(text).toContain('Sin envolver');
  });

  it('incluye subtotal, descuento (si hay) y total', () => {
    const withDiscount = allText(buildSaleReceipt({ ...baseSale, discountAmount: 200, subtotal: 2700, total: 2500 }));
    expect(withDiscount).toContain('Subtotal: $2.700');
    expect(withDiscount).toContain('Descuento: -$200');
    expect(withDiscount).toContain('TOTAL: $2.500');

    const withoutDiscount = allText(buildSaleReceipt(baseSale));
    expect(withoutDiscount).not.toContain('Descuento');
  });

  it('marca la venta como Pagada/Parcial/Pendiente según el saldo', () => {
    expect(allText(buildSaleReceipt({ ...baseSale, pendingBalance: 0 }))).toContain('Estado: Pagada');
    expect(allText(buildSaleReceipt({ ...baseSale, pendingBalance: 500, payments: [{ method: 'cash', amount: 2000 }] }))).toContain('Estado: Parcial');
    expect(allText(buildSaleReceipt({
      ...baseSale, paymentMethod: 'credit', payments: [], initialPaymentAmount: 0, pendingBalance: 2500,
    }))).toContain('Estado: Pendiente');
  });

  it('incluye el vuelto solo cuando corresponde', () => {
    expect(allText(buildSaleReceipt(baseSale))).toContain('Vuelto: $500');
    expect(allText(buildSaleReceipt({ ...baseSale, change: 0 }))).not.toContain('Vuelto');
  });

  it('venta a crédito muestra el abono en vez de vuelto', () => {
    const text = allText(buildSaleReceipt({
      ...baseSale,
      paymentMethod: 'credit',
      payments: [],
      pendingBalance: 1500,
      initialPaymentAmount: 1000,
      initialPaymentMethod: 'cash',
      amountReceived: null,
      change: null,
    }));
    expect(text).toContain('Abono: $1.000');
    expect(text).toContain('Metodo abono: Efectivo');
    expect(text).not.toContain('Vuelto');
  });

  it('incluye notas solo si existen', () => {
    expect(allText(buildSaleReceipt({ ...baseSale, notes: 'Entregar en 30 min' }))).toContain('Entregar en 30 min');
    expect(allText(buildSaleReceipt(baseSale))).not.toContain('Notas:');
  });

  it('agrega la leyenda de negocio (printLegend) al pie si existe', () => {
    const text = allText(buildSaleReceipt({ ...baseSale, business: { ...business, printLegend: 'Gracias por tu compra 🙌' } }));
    expect(text).toContain('Gracias por tu compra');
  });

  it('separadores más largos a 80mm que a 58mm', () => {
    const divider = (receipt) => receipt.lines.find((l) => /^-+$/.test(l.text))?.text.length || 0;
    expect(divider(buildSaleReceipt({ ...baseSale, paperWidthMm: 80 }))).toBeGreaterThan(divider(buildSaleReceipt({ ...baseSale, paperWidthMm: 58 })));
  });

  it('el Receipt resultante se puede renderizar a ESC/POS sin lanzar', () => {
    expect(() => renderEscPosReceipt(buildSaleReceipt(baseSale))).not.toThrow();
  });

  it('no depende de ningún nombre de marca/modelo de impresora', () => {
    const text = allText(buildSaleReceipt(baseSale)).toLowerCase();
    expect(text).not.toContain('star');
    expect(text).not.toContain('tsp100');
    expect(text).not.toContain('epson');
  });
});
