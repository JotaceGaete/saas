/**
 * create-merchant-mp-checkout — batería de tests unitarios de lib.ts.
 * Ejecutar: npx vitest run supabase/functions/create-merchant-mp-checkout/lib.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  resolveCheckoutCurrency,
  toCents,
  fromCents,
  parseCartItems,
  parseCustomer,
  parseServiceType,
  sanitizeOptionalText,
  validateAndPriceLine,
  validateCart,
  computeOrderTotals,
  buildExternalReference,
  isTokenExpired,
  buildBackUrls,
  buildPreferencePayload,
  buildOrderItemsPayload,
  MAX_CART_ITEMS,
  MAX_ITEM_QUANTITY,
  type ProductRow,
} from './lib';

const PRODUCT_A: ProductRow = {
  id: '33333333-3333-3333-3333-333333333333',
  businessId: 'biz-1',
  name: 'Producto A',
  price: 1990,
  isActive: true,
  isSoldOut: false,
  stockActual: 10,
};

const PRODUCT_UNLIMITED: ProductRow = {
  id: '44444444-4444-4444-4444-444444444444',
  businessId: 'biz-1',
  name: 'Producto sin control de stock',
  price: 5000,
  isActive: true,
  isSoldOut: false,
  stockActual: null,
};

const PRODUCT_OTHER_BUSINESS: ProductRow = {
  id: '55555555-5555-5555-5555-555555555555',
  businessId: 'biz-OTRO',
  name: 'Producto de otro negocio',
  price: 100,
  isActive: true,
  isSoldOut: false,
  stockActual: null,
};

const PRODUCT_INACTIVE: ProductRow = {
  id: '66666666-6666-6666-6666-666666666666',
  businessId: 'biz-1',
  name: 'Producto inactivo',
  price: 100,
  isActive: false,
  isSoldOut: false,
  stockActual: null,
};

const PRODUCT_SOLD_OUT: ProductRow = {
  id: '77777777-7777-7777-7777-777777777777',
  businessId: 'biz-1',
  name: 'Producto agotado',
  price: 100,
  isActive: true,
  isSoldOut: true,
  stockActual: null,
};

describe('resolveCheckoutCurrency — CL/AR estricto, sin fuzzy matching', () => {
  it('CL -> CLP', () => {
    expect(resolveCheckoutCurrency('CL')).toEqual({ ok: true, countryCode: 'CL', currency: 'CLP' });
  });
  it('AR -> ARS', () => {
    expect(resolveCheckoutCurrency('AR')).toEqual({ ok: true, countryCode: 'AR', currency: 'ARS' });
  });
  it('otro país soportado en el resto de la plataforma (MX/PE/etc) -> rechazado', () => {
    expect(resolveCheckoutCurrency('MX')).toEqual({ ok: false });
    expect(resolveCheckoutCurrency('PE')).toEqual({ ok: false });
  });
  it('null/undefined/vacío -> rechazado', () => {
    expect(resolveCheckoutCurrency(null)).toEqual({ ok: false });
    expect(resolveCheckoutCurrency(undefined)).toEqual({ ok: false });
    expect(resolveCheckoutCurrency('')).toEqual({ ok: false });
  });
  it('texto libre tipo wa_businesses.country ("Chile") -> rechazado, sin fuzzy matching', () => {
    expect(resolveCheckoutCurrency('Chile')).toEqual({ ok: false });
  });
});

describe('toCents/fromCents — sin drift de punto flotante', () => {
  it('convierte montos de 2 decimales exactos', () => {
    expect(toCents(1990)).toBe(199000);
    expect(toCents(19.9)).toBe(1990);
    expect(fromCents(199000)).toBe(1990);
  });
  it('suma repetida de líneas con decimales no acumula error (caso clásico 0.1+0.2)', () => {
    const cents = toCents(0.1) + toCents(0.2);
    expect(fromCents(cents)).toBe(0.3);
  });
});

describe('parseCartItems', () => {
  it('array vacío -> EMPTY_CART', () => {
    expect(parseCartItems([])).toEqual({ ok: false, reason: 'EMPTY_CART' });
  });
  it('no es array -> EMPTY_CART', () => {
    expect(parseCartItems(null)).toEqual({ ok: false, reason: 'EMPTY_CART' });
    expect(parseCartItems(undefined)).toEqual({ ok: false, reason: 'EMPTY_CART' });
    expect(parseCartItems('not-an-array')).toEqual({ ok: false, reason: 'EMPTY_CART' });
  });
  it('más de MAX_CART_ITEMS -> INVALID_REQUEST', () => {
    const items = Array.from({ length: MAX_CART_ITEMS + 1 }, () => ({ productId: PRODUCT_A.id, quantity: 1 }));
    expect(parseCartItems(items)).toEqual({ ok: false, reason: 'INVALID_REQUEST' });
  });
  it('acepta items válidos', () => {
    const result = parseCartItems([{ productId: PRODUCT_A.id, quantity: 2 }]);
    expect(result).toEqual({ ok: true, items: [{ productId: PRODUCT_A.id, quantity: 2 }] });
  });
  it('quantity 0 -> INVALID_REQUEST', () => {
    expect(parseCartItems([{ productId: PRODUCT_A.id, quantity: 0 }])).toEqual({ ok: false, reason: 'INVALID_REQUEST' });
  });
  it('quantity negativa -> INVALID_REQUEST', () => {
    expect(parseCartItems([{ productId: PRODUCT_A.id, quantity: -1 }])).toEqual({ ok: false, reason: 'INVALID_REQUEST' });
  });
  it('quantity decimal -> INVALID_REQUEST', () => {
    expect(parseCartItems([{ productId: PRODUCT_A.id, quantity: 1.5 }])).toEqual({ ok: false, reason: 'INVALID_REQUEST' });
  });
  it('quantity mayor a MAX_ITEM_QUANTITY -> INVALID_REQUEST', () => {
    expect(parseCartItems([{ productId: PRODUCT_A.id, quantity: MAX_ITEM_QUANTITY + 1 }])).toEqual({ ok: false, reason: 'INVALID_REQUEST' });
  });
  it('productId no es un UUID -> INVALID_REQUEST', () => {
    expect(parseCartItems([{ productId: 'no-es-un-uuid', quantity: 1 }])).toEqual({ ok: false, reason: 'INVALID_REQUEST' });
  });
  it('productId ausente -> INVALID_REQUEST', () => {
    expect(parseCartItems([{ quantity: 1 }])).toEqual({ ok: false, reason: 'INVALID_REQUEST' });
  });
});

describe('parseCustomer', () => {
  it('nombre válido, sin email ni phone', () => {
    expect(parseCustomer({ name: 'Juan Perez' })).toEqual({ ok: true, customer: { name: 'Juan Perez', email: null, phone: null } });
  });
  it('nombre vacío -> INVALID_REQUEST', () => {
    expect(parseCustomer({ name: '' })).toEqual({ ok: false, reason: 'INVALID_REQUEST' });
    expect(parseCustomer({ name: '   ' })).toEqual({ ok: false, reason: 'INVALID_REQUEST' });
  });
  it('nombre ausente -> INVALID_REQUEST', () => {
    expect(parseCustomer({})).toEqual({ ok: false, reason: 'INVALID_REQUEST' });
  });
  it('email válido se normaliza a minúsculas', () => {
    const result = parseCustomer({ name: 'Ana', email: 'ANA@Example.COM' });
    expect(result).toEqual({ ok: true, customer: { name: 'Ana', email: 'ana@example.com', phone: null } });
  });
  it('email inválido -> INVALID_REQUEST', () => {
    expect(parseCustomer({ name: 'Ana', email: 'no-es-email' })).toEqual({ ok: false, reason: 'INVALID_REQUEST' });
  });
  it('phone válido se conserva tal cual (trimmed)', () => {
    const result = parseCustomer({ name: 'Ana', phone: ' +56911112222 ' });
    expect(result).toEqual({ ok: true, customer: { name: 'Ana', email: null, phone: '+56911112222' } });
  });
  it('nombre excede el largo máximo -> INVALID_REQUEST', () => {
    expect(parseCustomer({ name: 'x'.repeat(300) })).toEqual({ ok: false, reason: 'INVALID_REQUEST' });
  });
});

describe('parseServiceType', () => {
  it('ausente -> null (válido)', () => {
    expect(parseServiceType(undefined)).toBeNull();
    expect(parseServiceType(null)).toBeNull();
    expect(parseServiceType('')).toBeNull();
  });
  it('valores del enum real de wa_orders.service_type -> aceptados', () => {
    expect(parseServiceType('mesa')).toBe('mesa');
    expect(parseServiceType('pickup')).toBe('pickup');
    expect(parseServiceType('delivery')).toBe('delivery');
  });
  it('valor fuera del enum -> invalid', () => {
    expect(parseServiceType('envio')).toBe('invalid');
    expect(parseServiceType(123)).toBe('invalid');
  });
});

describe('sanitizeOptionalText', () => {
  it('ausente/vacío -> null', () => {
    expect(sanitizeOptionalText(undefined, 100)).toBeNull();
    expect(sanitizeOptionalText('   ', 100)).toBeNull();
  });
  it('texto válido -> trimmed', () => {
    expect(sanitizeOptionalText('  Av. Siempre Viva 742  ', 100)).toBe('Av. Siempre Viva 742');
  });
  it('excede el largo máximo -> invalid', () => {
    expect(sanitizeOptionalText('x'.repeat(501), 500)).toBe('invalid');
  });
  it('tipo no-string -> invalid', () => {
    expect(sanitizeOptionalText(123, 100)).toBe('invalid');
  });
});

describe('validateAndPriceLine — CRÍTICO: precio siempre de la DB', () => {
  it('línea válida: precio/nombre vienen del producto, nunca del item recibido', () => {
    const result = validateAndPriceLine({ productId: PRODUCT_A.id, quantity: 3 }, PRODUCT_A, 'biz-1');
    expect(result).toEqual({
      ok: true,
      line: { productId: PRODUCT_A.id, productName: 'Producto A', unitPriceCents: 199000, quantity: 3, subtotalCents: 597000 },
    });
  });
  it('producto inexistente -> PRODUCT_NOT_FOUND', () => {
    const result = validateAndPriceLine({ productId: 'x', quantity: 1 }, undefined, 'biz-1');
    expect(result).toEqual({ ok: false, reason: 'PRODUCT_NOT_FOUND' });
  });
  it('producto de OTRO negocio -> PRODUCT_NOT_FOUND (nunca se cobra a nombre de otro negocio)', () => {
    const result = validateAndPriceLine({ productId: PRODUCT_OTHER_BUSINESS.id, quantity: 1 }, PRODUCT_OTHER_BUSINESS, 'biz-1');
    expect(result).toEqual({ ok: false, reason: 'PRODUCT_NOT_FOUND' });
  });
  it('producto inactivo -> PRODUCT_NOT_AVAILABLE', () => {
    const result = validateAndPriceLine({ productId: PRODUCT_INACTIVE.id, quantity: 1 }, PRODUCT_INACTIVE, 'biz-1');
    expect(result).toEqual({ ok: false, reason: 'PRODUCT_NOT_AVAILABLE' });
  });
  it('producto agotado (is_sold_out) -> PRODUCT_NOT_AVAILABLE', () => {
    const result = validateAndPriceLine({ productId: PRODUCT_SOLD_OUT.id, quantity: 1 }, PRODUCT_SOLD_OUT, 'biz-1');
    expect(result).toEqual({ ok: false, reason: 'PRODUCT_NOT_AVAILABLE' });
  });
  it('quantity > stock_actual -> INSUFFICIENT_STOCK', () => {
    const result = validateAndPriceLine({ productId: PRODUCT_A.id, quantity: 11 }, PRODUCT_A, 'biz-1');
    expect(result).toEqual({ ok: false, reason: 'INSUFFICIENT_STOCK' });
  });
  it('quantity === stock_actual -> OK (límite exacto permitido)', () => {
    const result = validateAndPriceLine({ productId: PRODUCT_A.id, quantity: 10 }, PRODUCT_A, 'biz-1');
    expect(result.ok).toBe(true);
  });
  it('stock_actual NULL (sin control de stock) -> cualquier quantity razonable pasa', () => {
    const result = validateAndPriceLine({ productId: PRODUCT_UNLIMITED.id, quantity: 99 }, PRODUCT_UNLIMITED, 'biz-1');
    expect(result.ok).toBe(true);
  });
  it('precio/nombre manipulados en el item recibido son IGNORADOS -- solo se usa lo que viene en `product`', () => {
    const manipulatedItem = { productId: PRODUCT_A.id, quantity: 1 } as { productId: string; quantity: number; unitPrice?: number; productName?: string };
    (manipulatedItem as Record<string, unknown>).unitPrice = 1;
    (manipulatedItem as Record<string, unknown>).productName = 'GRATIS';
    const result = validateAndPriceLine(manipulatedItem, PRODUCT_A, 'biz-1');
    expect(result).toEqual({
      ok: true,
      line: { productId: PRODUCT_A.id, productName: 'Producto A', unitPriceCents: 199000, quantity: 1, subtotalCents: 199000 },
    });
  });
});

describe('validateCart — todo o nada, sin pedidos parciales', () => {
  const productsById = new Map([
    [PRODUCT_A.id, PRODUCT_A],
    [PRODUCT_INACTIVE.id, PRODUCT_INACTIVE],
  ]);

  it('todas las líneas válidas -> ok', () => {
    const result = validateCart([{ productId: PRODUCT_A.id, quantity: 1 }], productsById, 'biz-1');
    expect(result.ok).toBe(true);
  });

  it('UNA línea inválida rechaza el carrito COMPLETO, no solo esa línea', () => {
    const result = validateCart(
      [
        { productId: PRODUCT_A.id, quantity: 1 },
        { productId: PRODUCT_INACTIVE.id, quantity: 1 },
      ],
      productsById,
      'biz-1',
    );
    expect(result).toEqual({ ok: false, reason: 'PRODUCT_NOT_AVAILABLE' });
  });
});

describe('computeOrderTotals', () => {
  it('subtotal === total (sin descuentos/despacho en esta fase)', () => {
    const lines = [
      { productId: 'a', productName: 'A', unitPriceCents: 199000, quantity: 2, subtotalCents: 398000 },
      { productId: 'b', productName: 'B', unitPriceCents: 500000, quantity: 1, subtotalCents: 500000 },
    ];
    expect(computeOrderTotals(lines)).toEqual({ subtotalCents: 898000, totalCents: 898000 });
  });
});

describe('buildExternalReference', () => {
  it('formato walinka:merchant:<business_id>:<order_id>', () => {
    expect(buildExternalReference('biz-1', 'order-1')).toBe('walinka:merchant:biz-1:order-1');
  });
  it('nunca coincide con el formato de billing (waP:...)', () => {
    expect(buildExternalReference('biz-1', 'order-1')).not.toMatch(/^waP:/);
  });
});

describe('isTokenExpired', () => {
  const now = new Date('2026-01-01T12:00:00Z');
  it('null (sin expiración conocida) -> nunca expirado', () => {
    expect(isTokenExpired(null, now)).toBe(false);
  });
  it('fecha futura -> no expirado', () => {
    expect(isTokenExpired('2026-01-01T13:00:00Z', now)).toBe(false);
  });
  it('fecha pasada -> expirado', () => {
    expect(isTokenExpired('2026-01-01T11:00:00Z', now)).toBe(true);
  });
  it('fecha exactamente igual a ahora -> tratado como expirado (borde seguro)', () => {
    expect(isTokenExpired('2026-01-01T12:00:00Z', now)).toBe(true);
  });
});

describe('buildBackUrls', () => {
  it('construye las 3 rutas desde el dominio canónico + slug, nunca desde el frontend', () => {
    expect(buildBackUrls('https://go.ventalink.app', 'mi-tienda')).toEqual({
      success: 'https://go.ventalink.app/catalogo/mi-tienda/pago/exito',
      pending: 'https://go.ventalink.app/catalogo/mi-tienda/pago/pendiente',
      failure: 'https://go.ventalink.app/catalogo/mi-tienda/pago/error',
    });
  });
  it('normaliza un trailing slash en el dominio base', () => {
    expect(buildBackUrls('https://go.ventalink.app/', 'x').success).toBe('https://go.ventalink.app/catalogo/x/pago/exito');
  });
});

describe('buildPreferencePayload', () => {
  const lines = [{ productId: PRODUCT_A.id, productName: 'Producto A', unitPriceCents: 199000, quantity: 2, subtotalCents: 398000 }];
  const backUrls = { success: 's', pending: 'p', failure: 'f' };

  it('incluye solo los campos documentados, con datos server-side', () => {
    const payload = buildPreferencePayload({
      lines, currency: 'CLP', externalReference: 'walinka:merchant:biz-1:order-1', backUrls,
      notificationUrl: 'https://x/merchant-mp-webhook', payerName: 'Juan', payerEmail: 'juan@example.com',
    });
    expect(payload).toEqual({
      items: [{ title: 'Producto A', quantity: 2, unit_price: 1990, currency_id: 'CLP' }],
      back_urls: { success: 's', failure: 'f', pending: 'p' },
      auto_return: 'approved',
      external_reference: 'walinka:merchant:biz-1:order-1',
      payer: { name: 'Juan', email: 'juan@example.com' },
      notification_url: 'https://x/merchant-mp-webhook',
    });
  });

  it('sin email -> payer solo con name (nunca se inventa un email)', () => {
    const payload = buildPreferencePayload({
      lines, currency: 'CLP', externalReference: 'ref', backUrls, payerName: 'Juan', payerEmail: null,
    });
    expect((payload as { payer: unknown }).payer).toEqual({ name: 'Juan' });
  });

  it('sin notificationUrl -> la key notification_url ni siquiera aparece', () => {
    const payload = buildPreferencePayload({
      lines, currency: 'CLP', externalReference: 'ref', backUrls, payerName: 'Juan', payerEmail: null,
    });
    expect(Object.prototype.hasOwnProperty.call(payload, 'notification_url')).toBe(false);
  });

  it('nunca incluye phone/address/notes -- payer solo tiene name/email', () => {
    const payload = buildPreferencePayload({
      lines, currency: 'CLP', externalReference: 'ref', backUrls, payerName: 'Juan', payerEmail: null,
    });
    const payer = (payload as { payer: Record<string, unknown> }).payer;
    expect(Object.keys(payer).sort()).toEqual(['name']);
  });
});

describe('buildOrderItemsPayload — shape exacto para wa_create_merchant_checkout_order', () => {
  it('mapea unitPriceCents/subtotalCents a números decimales para la RPC', () => {
    const lines = [{ productId: 'p1', productName: 'A', unitPriceCents: 199000, quantity: 2, subtotalCents: 398000 }];
    expect(buildOrderItemsPayload(lines)).toEqual([
      { product_id: 'p1', product_name: 'A', unit_price: 1990, quantity: 2, subtotal: 3980 },
    ]);
  });
});
