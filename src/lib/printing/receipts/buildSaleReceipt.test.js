import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./fetchLogoRaster', () => ({
  fetchLogoRaster: vi.fn(),
}));

const { fetchLogoRaster } = await import('./fetchLogoRaster');
const { buildSaleReceipt } = await import('./buildSaleReceipt');
const { renderEscPosReceipt } = await import('./renderEscPosReceipt');

const ESC = 0x1B;
const GS = 0x1D;

function bytesToText(bytes) {
  return Array.from(bytes).map((b) => (b < 256 ? String.fromCharCode(b) : '?')).join('');
}

function includesSubsequence(bytes, seq) {
  const arr = Array.from(bytes);
  for (let i = 0; i <= arr.length - seq.length; i++) {
    if (seq.every((v, j) => arr[i + j] === v)) return true;
  }
  return false;
}

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

async function renderText(saleParams) {
  return bytesToText(await renderEscPosReceipt(buildSaleReceipt(saleParams)));
}

afterEach(() => {
  vi.mocked(fetchLogoRaster).mockReset();
});

describe('buildSaleReceipt', () => {
  it('devuelve un Receipt con lines/feedLines/cut/paperWidthMm, independiente de React/DOM', () => {
    const receipt = buildSaleReceipt(baseSale);
    expect(Array.isArray(receipt.lines)).toBe(true);
    expect(receipt.cut).toBe(true);
    expect(receipt.feedLines).toBeGreaterThan(0);
    expect(receipt.paperWidthMm).toBe(80);
  });

  it('es síncrono y nunca depende de la carga del logo (esa carga ocurre en el renderer, no acá)', () => {
    // No hay ningún await -- si esto compilara a una promesa, `receipt.lines` no existiría todavía.
    const receipt = buildSaleReceipt({ ...baseSale, business: { ...business, logoUrl: 'https://cdn.example.com/logo.png' } });
    expect(Array.isArray(receipt.lines)).toBe(true);
  });

  it('incluye nombre del negocio, dirección y datos del ticket', async () => {
    const text = await renderText(baseSale);
    expect(text).toContain('MI NEGOCIO');
    expect(text).toContain('Av. Siempre Viva 123');
    expect(text).toContain('+56912345678');
  });

  it('incluye el RUT solo si el negocio lo tiene', async () => {
    const withRut = await renderText({ ...baseSale, business: { ...business, rut: '76.123.456-7' } });
    expect(withRut).toContain('RUT: 76.123.456-7');

    const withoutRut = await renderText(baseSale);
    expect(withoutRut).not.toContain('RUT:');
  });

  it('usa el número de factura para el ticket, o un fallback si no hay venta aún', async () => {
    expect(await renderText(baseSale)).toContain('Ticket: NV-0042');
    expect(await renderText({ ...baseSale, sale: null })).toMatch(/Ticket: T-\d+/);
  });

  describe('PRINT-4 — logo del negocio', () => {
    it('sin business.logoUrl no se intenta cargar ningún logo', async () => {
      await renderText(baseSale);
      expect(fetchLogoRaster).not.toHaveBeenCalled();
    });

    it('con business.logoUrl se incluye una línea de logo que el renderer resuelve', async () => {
      const fakeRaster = new Uint8Array([GS, 0x76, 0x30, 0x00, 1, 0, 1, 0, 0xFF]);
      vi.mocked(fetchLogoRaster).mockResolvedValue({ command: fakeRaster, width: 8, height: 1 });

      const bytes = await renderEscPosReceipt(buildSaleReceipt({
        ...baseSale, business: { ...business, logoUrl: 'https://cdn.example.com/logo.png' },
      }));

      expect(fetchLogoRaster).toHaveBeenCalledWith('https://cdn.example.com/logo.png', expect.any(Object));
      expect(includesSubsequence(bytes, Array.from(fakeRaster))).toBe(true);
    });

    it('si la carga/rasterización del logo falla, el ticket igual imprime completo, sin logo y sin lanzar', async () => {
      vi.mocked(fetchLogoRaster).mockResolvedValue(null);
      const receiptWithLogo = { ...baseSale, business: { ...business, logoUrl: 'https://cdn.example.com/roto.png' } };

      await expect(renderEscPosReceipt(buildSaleReceipt(receiptWithLogo))).resolves.not.toThrow();
      const text = bytesToText(await renderEscPosReceipt(buildSaleReceipt(receiptWithLogo)));
      expect(text).toContain('MI NEGOCIO');
      expect(text).toContain('Ticket: NV-0042');
    });
  });

  it('incluye cada ítem con cantidad, nombre y total de línea', async () => {
    const text = await renderText(baseSale);
    expect(text).toContain('2x Producto A');
    expect(text).toContain('1x Producto B');
    expect(text).toContain('Sin envolver');
    expect(text).toContain('$2.000'); // 2 x $1.000
  });

  it('producto con nombre muy largo se envuelve en el ticket, nunca se trunca', async () => {
    const longName = 'Combo familiar especial con ensalada bebida y postre incluido para cuatro personas';
    const text = await renderText({
      ...baseSale,
      items: [{ name: longName, unit_price: 9990, quantity: 1 }],
    });
    for (const word of longName.split(' ')) expect(text).toContain(word);
  });

  it('múltiples unidades de un mismo producto calculan bien el total de línea', async () => {
    const text = await renderText({ ...baseSale, items: [{ name: 'Agua', unit_price: 700, quantity: 5 }] });
    expect(text).toContain('5x Agua');
    expect(text).toContain('$3.500');
  });

  it('incluye subtotal, descuento (si hay) y TOTAL', async () => {
    const withDiscount = await renderText({ ...baseSale, discountAmount: 200, subtotal: 2700, total: 2500 });
    expect(withDiscount).toContain('Subtotal');
    expect(withDiscount).toContain('$2.700');
    expect(withDiscount).toContain('Descuento');
    expect(withDiscount).toContain('$-200');
    expect(withDiscount).toContain('TOTAL');
    expect(withDiscount).toContain('$2.500');

    const withoutDiscount = await renderText(baseSale);
    expect(withoutDiscount).not.toContain('Descuento');
  });

  it('el TOTAL se emite con énfasis (negrita + doble tamaño) a diferencia de las demás filas', async () => {
    const bytes = await renderEscPosReceipt(buildSaleReceipt(baseSale));
    expect(includesSubsequence(bytes, [GS, 0x21, 0x11])).toBe(true); // doble tamaño en algún punto (el TOTAL)
  });

  it('marca la venta como Pagada/Parcial/Pendiente según el saldo', async () => {
    expect(await renderText({ ...baseSale, pendingBalance: 0 })).toContain('Estado: Pagada');
    expect(await renderText({ ...baseSale, pendingBalance: 500, payments: [{ method: 'cash', amount: 2000 }] })).toContain('Estado: Parcial');
    expect(await renderText({
      ...baseSale, paymentMethod: 'credit', payments: [], initialPaymentAmount: 0, pendingBalance: 2500,
    })).toContain('Estado: Pendiente');
  });

  it('efectivo con vuelto: muestra el pago recibido y el vuelto', async () => {
    const text = await renderText(baseSale);
    expect(text).toContain('Vuelto');
    expect(text).toContain('$500');
  });

  it('el vuelto solo aparece cuando corresponde (no si es 0)', async () => {
    expect(await renderText({ ...baseSale, change: 0 })).not.toContain('Vuelto');
  });

  it('múltiples formas de pago se listan todas con su monto', async () => {
    const text = await renderText({
      ...baseSale,
      payments: [{ method: 'cash', amount: 1500 }, { method: 'card', amount: 1000 }],
    });
    expect(text).toContain('Efectivo');
    expect(text).toContain('$1.500');
    expect(text).toContain('Tarjeta');
    expect(text).toContain('$1.000');
  });

  it('venta a crédito muestra el abono en vez de vuelto', async () => {
    const text = await renderText({
      ...baseSale,
      paymentMethod: 'credit',
      payments: [],
      pendingBalance: 1500,
      initialPaymentAmount: 1000,
      initialPaymentMethod: 'cash',
      amountReceived: null,
      change: null,
    });
    expect(text).toContain('Abono');
    expect(text).toContain('$1.000');
    expect(text).toContain('Metodo abono: Efectivo');
    expect(text).not.toContain('Vuelto');
  });

  it('incluye notas solo si existen', async () => {
    expect(await renderText({ ...baseSale, notes: 'Entregar en 30 min' })).toContain('Entregar en 30 min');
    expect(await renderText(baseSale)).not.toContain('Notas:');
  });

  it('agrega la leyenda de negocio (printLegend) al pie si existe', async () => {
    const text = await renderText({ ...baseSale, business: { ...business, printLegend: 'Gracias por tu compra' } });
    expect(text).toContain('Gracias por tu compra');
  });

  it('sin datos opcionales (RUT, dirección, teléfono, notas, cliente) no imprime líneas vacías absurdas', async () => {
    const minimal = {
      business: { name: 'Kiosco' },
      sale: null,
      items: [{ name: 'Bebida', unit_price: 1000, quantity: 1 }],
      paymentMethod: 'cash',
      payments: [],
      subtotal: 1000,
      total: 1000,
      amountReceived: 1000,
      change: 0,
      pendingBalance: 0,
    };
    const bytes = await renderEscPosReceipt(buildSaleReceipt(minimal));
    const text = bytesToText(bytes);
    expect(text).not.toContain('RUT:');
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('null');
    expect(text).toContain('Consumidor final');
  });

  it('separadores más largos a 80mm que a 58mm', async () => {
    const divider80 = bytesToText(await renderEscPosReceipt(buildSaleReceipt({ ...baseSale, paperWidthMm: 80 })));
    const divider58 = bytesToText(await renderEscPosReceipt(buildSaleReceipt({ ...baseSale, paperWidthMm: 58 })));
    expect(divider80).toContain('-'.repeat(48));
    expect(divider58).toContain('-'.repeat(32));
    expect(divider58).not.toContain('-'.repeat(48));
  });

  describe('PRINT-4 — corte automático (autoCut)', () => {
    it('autoCut true (o por defecto) agrega el comando de corte parcial al final', async () => {
      const bytes = await renderEscPosReceipt(buildSaleReceipt(baseSale));
      const tail = Array.from(bytes.slice(-4));
      expect(tail).toEqual([GS, 0x56, 0x42, 0x00]);
    });

    it('autoCut false NO agrega ningún comando de corte', async () => {
      const bytes = await renderEscPosReceipt(buildSaleReceipt({ ...baseSale, autoCut: false }));
      expect(includesSubsequence(bytes, [GS, 0x56])).toBe(false);
    });

    it('siempre deja avance de papel final (feedLines > 0) independientemente del corte', () => {
      expect(buildSaleReceipt(baseSale).feedLines).toBeGreaterThan(0);
      expect(buildSaleReceipt({ ...baseSale, autoCut: false }).feedLines).toBeGreaterThan(0);
    });
  });

  it('el Receipt resultante se puede renderizar a ESC/POS sin lanzar y empieza con ESC @', async () => {
    const bytes = await renderEscPosReceipt(buildSaleReceipt(baseSale));
    expect(Array.from(bytes.slice(0, 2))).toEqual([ESC, 0x40]);
  });

  it('el renderer no muta los datos originales del Receipt/items al imprimir', async () => {
    const receipt = buildSaleReceipt(baseSale);
    const snapshot = JSON.parse(JSON.stringify(receipt));
    await renderEscPosReceipt(receipt);
    expect(receipt).toEqual(snapshot);
  });

  it('no depende de ningún nombre de marca/modelo de impresora', async () => {
    const text = (await renderText(baseSale)).toLowerCase();
    expect(text).not.toContain('star');
    expect(text).not.toContain('tsp100');
    expect(text).not.toContain('epson');
  });
});
