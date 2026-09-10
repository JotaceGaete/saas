import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import merchantCheckoutServiceSource from './merchantCheckoutService.js?raw';

const rpcMock = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
  },
}));

import {
  getMerchantMpAvailability,
  createMerchantMpCheckout,
  getMerchantMpCheckoutErrorMessage,
} from './merchantCheckoutService';

beforeEach(() => {
  rpcMock.mockReset();
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getMerchantMpAvailability', () => {
  it('llama a wa_get_public_merchant_mp_availability con el slug', async () => {
    rpcMock.mockResolvedValue({ data: [{ available: true }], error: null });
    await getMerchantMpAvailability('mi-tienda');
    expect(rpcMock).toHaveBeenCalledWith('wa_get_public_merchant_mp_availability', { p_business_slug: 'mi-tienda' });
  });

  it('available=true -> true', async () => {
    rpcMock.mockResolvedValue({ data: [{ available: true }], error: null });
    expect(await getMerchantMpAvailability('mi-tienda')).toBe(true);
  });

  it('available=false -> false', async () => {
    rpcMock.mockResolvedValue({ data: [{ available: false }], error: null });
    expect(await getMerchantMpAvailability('mi-tienda')).toBe(false);
  });

  it('acepta tanto un array (SETOF) como un objeto plano en data', async () => {
    rpcMock.mockResolvedValue({ data: { available: true }, error: null });
    expect(await getMerchantMpAvailability('mi-tienda')).toBe(true);
  });

  it('error de la RPC -> false (nunca lanza, WhatsApp sigue funcionando igual)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await getMerchantMpAvailability('mi-tienda')).toBe(false);
  });

  it('slug vacío/ausente -> false sin llamar a la RPC', async () => {
    expect(await getMerchantMpAvailability('')).toBe(false);
    expect(await getMerchantMpAvailability(null)).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('excepción inesperada -> false, nunca propaga', async () => {
    rpcMock.mockImplementation(() => { throw new Error('network down'); });
    expect(await getMerchantMpAvailability('mi-tienda')).toBe(false);
  });
});

describe('createMerchantMpCheckout', () => {
  const baseInput = {
    businessSlug: 'mi-tienda',
    items: [{ productId: 'p1', quantity: 2 }],
    customer: { name: 'Juan Perez', phone: '+56911112222' },
  };

  it('hace POST a create-merchant-mp-checkout con apikey, sin Authorization (comprador sin sesión)', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, init_point: 'https://mp/x', order_id: 'o1', preference_id: 'pref1' }) });

    await createMerchantMpCheckout(baseInput);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/functions/v1/create-merchant-mp-checkout');
    expect(options.method).toBe('POST');
    expect(Object.prototype.hasOwnProperty.call(options.headers, 'apikey')).toBe(true);
    expect(options.headers.Authorization).toBeUndefined();
  });

  it('el body enviado contiene SOLO businessSlug/items/customer -- nunca price/subtotal/total/currency/business_id/external_reference', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, init_point: 'https://mp/x' }) });

    await createMerchantMpCheckout(baseInput);

    const [, options] = global.fetch.mock.calls[0];
    const sentBody = JSON.parse(options.body);
    expect(sentBody).toEqual({ businessSlug: 'mi-tienda', items: [{ productId: 'p1', quantity: 2 }], customer: { name: 'Juan Perez', phone: '+56911112222' } });
    for (const forbidden of ['price', 'unit_price', 'subtotal', 'total', 'currency', 'business_id', 'external_reference']) {
      expect(sentBody).not.toHaveProperty(forbidden);
    }
  });

  it('items enviados usan exclusivamente productId + quantity (nunca price/name del carrito)', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, init_point: 'https://mp/x' }) });
    await createMerchantMpCheckout({ ...baseInput, items: [{ productId: 'p1', quantity: 1, price: 99999, name: 'manipulado' }] });
    const [, options] = global.fetch.mock.calls[0];
    const sentBody = JSON.parse(options.body);
    expect(sentBody.items).toEqual([{ productId: 'p1', quantity: 1, price: 99999, name: 'manipulado' }]);
    // Nota: el servicio reenvía tal cual el array de items que le pasa el
    // componente -- la responsabilidad de construir items SOLO con
    // productId/quantity es del componente que arma `items` desde el
    // carrito (ver public-catalog/index.jsx), no de este servicio.
  });

  it('serviceType/deliveryAddress/notes se incluyen solo si están presentes', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, init_point: 'https://mp/x' }) });
    await createMerchantMpCheckout({ ...baseInput, serviceType: 'delivery', deliveryAddress: 'Av. Siempre Viva 742', notes: 'sin cebolla' });
    const [, options] = global.fetch.mock.calls[0];
    const sentBody = JSON.parse(options.body);
    expect(sentBody.serviceType).toBe('delivery');
    expect(sentBody.deliveryAddress).toBe('Av. Siempre Viva 742');
    expect(sentBody.notes).toBe('sin cebolla');
  });

  it('sin serviceType/deliveryAddress/notes -- esas keys ni siquiera aparecen en el body', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, init_point: 'https://mp/x' }) });
    await createMerchantMpCheckout(baseInput);
    const [, options] = global.fetch.mock.calls[0];
    const sentBody = JSON.parse(options.body);
    expect(sentBody).not.toHaveProperty('serviceType');
    expect(sentBody).not.toHaveProperty('deliveryAddress');
    expect(sentBody).not.toHaveProperty('notes');
  });

  it('respuesta exitosa -> data con initPoint/orderId/preferenceId, error null', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, init_point: 'https://mp/checkout/x', order_id: 'order-1', preference_id: 'pref-1' }) });
    const result = await createMerchantMpCheckout(baseInput);
    expect(result).toEqual({ data: { initPoint: 'https://mp/checkout/x', orderId: 'order-1', preferenceId: 'pref-1' }, error: null });
  });

  it('respuesta sin init_point -> error, aunque res.ok sea true', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    const result = await createMerchantMpCheckout(baseInput);
    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it('error HTTP con reason -> error.reason propagado', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: 'no conectado', reason: 'MP_NOT_CONNECTED' }) });
    const result = await createMerchantMpCheckout(baseInput);
    expect(result.data).toBeNull();
    expect(result.error.reason).toBe('MP_NOT_CONNECTED');
  });

  it('fallo de red -> error, nunca lanza', async () => {
    global.fetch.mockImplementation(() => { throw new Error('network down'); });
    const result = await createMerchantMpCheckout(baseInput);
    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it('nunca devuelve ni referencia access_token en el resultado', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, init_point: 'https://mp/x', access_token: 'FAKE-LEAKED-TOKEN' }) });
    const result = await createMerchantMpCheckout(baseInput);
    expect(JSON.stringify(result)).not.toMatch(/FAKE-LEAKED-TOKEN/);
  });
});

describe('getMerchantMpCheckoutErrorMessage', () => {
  it('mapea los reasons conocidos a mensajes amigables', () => {
    for (const reason of [
      'MP_NOT_CONNECTED', 'MP_CONNECTION_EXPIRED', 'MP_COUNTRY_NOT_SUPPORTED',
      'PRODUCT_NOT_FOUND', 'PRODUCT_NOT_AVAILABLE', 'INSUFFICIENT_STOCK',
      'INVALID_QUANTITY', 'BUSINESS_NOT_FOUND', 'BUSINESS_INACTIVE',
    ]) {
      const msg = getMerchantMpCheckoutErrorMessage(reason);
      expect(typeof msg).toBe('string');
      expect(msg.length).toBeGreaterThan(0);
    }
  });

  it('reason desconocido/ausente (incluye MP_API_ERROR/INTERNAL_ERROR, no son reasons reales del backend hoy) -> mensaje genérico, nunca texto crudo', () => {
    const fallback = getMerchantMpCheckoutErrorMessage(undefined);
    expect(getMerchantMpCheckoutErrorMessage('MP_API_ERROR')).toBe(fallback);
    expect(getMerchantMpCheckoutErrorMessage('INTERNAL_ERROR')).toBe(fallback);
    expect(getMerchantMpCheckoutErrorMessage('algo-inventado')).toBe(fallback);
  });

  it('nunca devuelve un mensaje que contenga la palabra "error" en mayúsculas cruda tipo código (heurística anti-leak simple)', () => {
    const msg = getMerchantMpCheckoutErrorMessage('MP_PREFERENCE_FAILED');
    expect(msg).not.toMatch(/^[A-Z_]+$/);
  });
});

describe('merchantCheckoutService — alineado con la arquitectura de publishable key, sin acceso directo a mp_connections', () => {
  it('no lee VITE_SUPABASE_ANON_KEY directamente', () => {
    expect(merchantCheckoutServiceSource).not.toMatch(/import\.meta\.env\?\.VITE_SUPABASE_ANON_KEY/);
    expect(merchantCheckoutServiceSource).toMatch(/import \{ getSupabasePublishableKey \} from ['"]\.\.\/lib\/supabasePublishableKey['"]/);
  });

  it('la client key solo se usa como header apikey, nunca como Authorization', () => {
    expect(merchantCheckoutServiceSource).toMatch(/apikey: ANON_KEY/);
    expect(merchantCheckoutServiceSource).not.toMatch(/Authorization:/);
  });

  it('nunca hace supabase.from(\'mp_connections\')', () => {
    expect(merchantCheckoutServiceSource).not.toMatch(/\.from\(\s*['"]mp_connections['"]/);
  });
});
