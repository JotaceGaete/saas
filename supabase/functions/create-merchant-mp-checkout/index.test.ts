/**
 * create-merchant-mp-checkout/index.ts — tests estáticos (source-scan) de
 * las invariantes de seguridad que lib.test.ts no puede cubrir (index.ts
 * toca Deno.serve/Deno.env a nivel de módulo, así que no se importa/ejecuta
 * directamente en Vitest).
 */
import { describe, it, expect } from 'vitest';
import indexSource from './index.ts?raw';

describe('create-merchant-mp-checkout — notification_url lleva el order_id hint para merchant-mp-webhook', () => {
  it('agrega ?order_id=<uuid> a MERCHANT_MP_WEBHOOK_URL cuando está configurada', () => {
    expect(indexSource).toMatch(/notificationUrlBase\.includes\('\?'\) \? '&' : '\?'/);
    expect(indexSource).toMatch(/order_id=\$\{orderId\}/);
  });

  it('sin MERCHANT_MP_WEBHOOK_URL configurada, notification_url sigue vacía (no se inventa un order_id suelto)', () => {
    expect(indexSource).toMatch(/const notificationUrl = notificationUrlBase\s*\n\s*\? `\$\{notificationUrlBase\}[^`]*`\s*\n\s*: '';/);
  });
});

describe('create-merchant-mp-checkout — endpoint público pero no confiable', () => {
  it('no valida ningún JWT (comprador del catálogo sin sesión Walinka) -- consistente con verify_jwt=false', () => {
    expect(indexSource).not.toMatch(/auth\.getUser\(/);
    expect(indexSource).not.toMatch(/authorization.*header/i);
  });

  it('ignora explícitamente business_id/price/unit_price/subtotal/total/currency/productName/access_token/preference_id/external_reference del body', () => {
    expect(indexSource).toMatch(/IGNORADOS del body/);
    for (const field of ['businessId', 'price', 'unit_price', 'subtotal', 'total', 'currency', 'productName', 'access_token', 'preference_id', 'external_reference']) {
      expect(indexSource).toMatch(new RegExp(`'${field}'`));
    }
  });

  it('resuelve el negocio EXCLUSIVAMENTE por businessSlug (.eq(\'slug\', ...)), nunca por un id recibido', () => {
    expect(indexSource).toMatch(/\.eq\('slug', businessSlug\)/);
    expect(indexSource).not.toMatch(/\.eq\('id', body/);
  });
});

describe('create-merchant-mp-checkout — precio SIEMPRE recalculado server-side', () => {
  it('el precio de línea viene de wa_products.price vía validateCart/validateAndPriceLine, nunca de un valor del body', () => {
    expect(indexSource).toMatch(/\.select\('id, business_id, name, price, is_active, is_sold_out, stock_actual'\)/);
    expect(indexSource).toMatch(/validateCart\(/);
  });

  it('el total enviado a la RPC de creación de pedido viene de computeOrderTotals(), nunca de body.total/body.subtotal', () => {
    expect(indexSource).toMatch(/computeOrderTotals\(/);
    expect(indexSource).not.toMatch(/body\??\.\s*total\b/);
    expect(indexSource).not.toMatch(/body\??\.\s*subtotal\b/);
  });

  it('external_reference se construye server-side vía buildExternalReference(), nunca se lee de body', () => {
    expect(indexSource).toMatch(/buildExternalReference\(business\.id/);
  });
});

describe('create-merchant-mp-checkout — moneda estricta CL/AR', () => {
  it('usa resolveCheckoutCurrency(business.country_code), nunca currency del body', () => {
    expect(indexSource).toMatch(/resolveCheckoutCurrency\(business\.country_code\)/);
    expect(indexSource).not.toMatch(/body\??\.\s*currency\b/);
  });

  it('país no soportado responde 422 con reason MP_COUNTRY_NOT_SUPPORTED', () => {
    expect(indexSource).toMatch(/MP_COUNTRY_NOT_SUPPORTED/);
    expect(indexSource).toMatch(/422/);
  });
});

describe('create-merchant-mp-checkout — conexión MP del comercio, nunca billing', () => {
  it('usa wa_get_mp_connection_for_checkout por business_id, nunca lee MP_ACCESS_TOKEN_CL/AR (solo puede nombrarlas en el comentario de cabecera explicando el aislamiento)', () => {
    expect(indexSource).toMatch(/wa_get_mp_connection_for_checkout/);
    expect(indexSource).not.toMatch(/Deno\.env\.get\(['"]MP_ACCESS_TOKEN_(CL|AR)['"]\)/);
  });

  it('sin conexión -> MP_NOT_CONNECTED; token expirado -> MP_CONNECTION_EXPIRED', () => {
    expect(indexSource).toMatch(/MP_NOT_CONNECTED/);
    expect(indexSource).toMatch(/MP_CONNECTION_EXPIRED/);
    expect(indexSource).toMatch(/isTokenExpired\(/);
  });

  it('nunca loguea ni devuelve el access_token', () => {
    expect(indexSource).not.toMatch(/console\.(log|warn|error|info|debug)\([^)]*mpAccessToken/);
    expect(indexSource).not.toMatch(/jsonResponse\(\{[^}]*access_token/);
  });
});

describe('create-merchant-mp-checkout — pedido pendiente ANTES de llamar a Mercado Pago', () => {
  it('llama a wa_create_merchant_checkout_order ANTES del fetch a checkout/preferences', () => {
    const orderRpcIdx = indexSource.indexOf("admin.rpc('wa_create_merchant_checkout_order'");
    const mpFetchIdx = indexSource.indexOf('await fetch(MP_PREFERENCE_URL');
    expect(orderRpcIdx).toBeGreaterThan(-1);
    expect(mpFetchIdx).toBeGreaterThan(-1);
    expect(orderRpcIdx).toBeLessThan(mpFetchIdx);
  });

  it('la validación completa del carrito ocurre ANTES de crear el pedido (todo o nada)', () => {
    const cartValidationIdx = indexSource.indexOf('validateCart(');
    const orderRpcIdx = indexSource.indexOf("admin.rpc('wa_create_merchant_checkout_order'");
    expect(cartValidationIdx).toBeGreaterThan(-1);
    expect(orderRpcIdx).toBeGreaterThan(-1);
    expect(cartValidationIdx).toBeLessThan(orderRpcIdx);
  });
});

describe('create-merchant-mp-checkout — respuesta y errores nunca exponen internals', () => {
  it('la respuesta exitosa solo contiene ok/init_point/preference_id/order_id', () => {
    expect(indexSource).toMatch(/jsonResponse\(\{ ok: true, init_point: initPoint, preference_id: preference\?\.id \?\? null, order_id: orderId \}, 200\)/);
  });

  it('nunca reenvía el body completo de la respuesta de Mercado Pago al browser', () => {
    expect(indexSource).not.toMatch(/jsonResponse\(\{[^}]*mp_response/);
    expect(indexSource).not.toMatch(/jsonResponse\(preference/);
  });

  it('errores de MP solo loguean status, nunca el body completo de la respuesta', () => {
    expect(indexSource).toMatch(/nunca el body completo/);
  });
});

describe('create-merchant-mp-checkout — aislamiento de billing Walinka', () => {
  it('no tiene ningún import/llamada real a create-mp-preference, mp-webhook, wa_payments, wa_payment_events ni billing_subscriptions (solo pueden aparecer en el comentario de cabecera explicando el aislamiento)', () => {
    expect(indexSource).not.toMatch(/from ['"]\.\.\/create-mp-preference/);
    expect(indexSource).not.toMatch(/from ['"]\.\.\/mp-webhook/);
    expect(indexSource).not.toMatch(/\.from\(['"](wa_payments|wa_payment_events|billing_subscriptions)['"]\)/);
    expect(indexSource).not.toMatch(/\.rpc\(['"][^'"]*(wa_payments|wa_payment_events|billing_subscriptions)/);
  });
});

describe('create-merchant-mp-checkout — CORS/abuse (sección 19)', () => {
  it('solo permite POST y OPTIONS', () => {
    expect(indexSource).toMatch(/'Access-Control-Allow-Methods': 'POST, OPTIONS'/);
    expect(indexSource).toMatch(/req\.method !== 'POST'/);
  });

  it('rechaza bodies más grandes que MAX_BODY_BYTES antes de parsear', () => {
    expect(indexSource).toMatch(/content-length/);
    expect(indexSource).toMatch(/MAX_BODY_BYTES/);
  });
});

// ─── MP-MARKETPLACE-1 — comisión Walinka (marketplace_fee) ────────────────
describe('create-merchant-mp-checkout — marketplace_fee nunca se acepta del frontend', () => {
  it('ignora explícitamente marketplace_fee/fee/walinka_fee/commission/commission_rate/percentage del body', () => {
    for (const field of ['marketplace_fee', 'fee', 'walinka_fee', 'commission', 'commission_rate', 'percentage']) {
      expect(indexSource).toMatch(new RegExp(`'${field}'`));
    }
  });

  it('esos campos están en el mismo array IGNORED_UNTRUSTED_FIELDS que ya cubre price/total/currency', () => {
    const arrayMatch = indexSource.match(/const IGNORED_UNTRUSTED_FIELDS = \[([\s\S]*?)\] as const;/);
    expect(arrayMatch).not.toBeNull();
    for (const field of ['price', 'total', 'currency', 'marketplace_fee', 'fee', 'walinka_fee', 'commission', 'commission_rate', 'percentage']) {
      expect(arrayMatch![1]).toMatch(new RegExp(`'${field}'`));
    }
  });
});

describe('create-merchant-mp-checkout — el fee se calcula server-side sobre el total recalculado desde DB', () => {
  it('computeWalinkaMarketplaceFee se llama DESPUÉS de computeOrderTotals y ANTES de buildPreferencePayload', () => {
    const totalsIdx = indexSource.indexOf('computeOrderTotals(cartValidation.lines)');
    const feeIdx = indexSource.indexOf('computeWalinkaMarketplaceFee(totals.totalCents');
    const payloadIdx = indexSource.indexOf('buildPreferencePayload({');
    expect(totalsIdx).toBeGreaterThan(-1);
    expect(feeIdx).toBeGreaterThan(-1);
    expect(payloadIdx).toBeGreaterThan(-1);
    expect(totalsIdx).toBeLessThan(feeIdx);
    expect(feeIdx).toBeLessThan(payloadIdx);
  });

  it('el fee se calcula sobre totals.totalCents (recalculado desde wa_products.price vía validateCart), nunca sobre un valor del body', () => {
    expect(indexSource).toMatch(/computeWalinkaMarketplaceFee\(totals\.totalCents, currencyResult\.currency\)/);
  });

  it('un fallo de cálculo del fee responde 500 sin exponer detalle interno, nunca continúa sin comisión calculada', () => {
    const feeBlockMatch = indexSource.match(/const feeResult = computeWalinkaMarketplaceFee\([\s\S]*?\n  \}/);
    expect(feeBlockMatch).not.toBeNull();
    expect(feeBlockMatch![0]).toMatch(/if \(!feeResult\.ok\)/);
    expect(feeBlockMatch![0]).toMatch(/jsonResponse\(\{ error: 'Server configuration error' \}, 500\)/);
  });

  it('el resultado (feeResult.fee) se pasa a buildPreferencePayload como marketplaceFee', () => {
    expect(indexSource).toMatch(/marketplaceFee: feeResult\.fee,/);
  });
});

describe('create-merchant-mp-checkout — marketplace_fee no altera lo que paga el comprador', () => {
  it('el total enviado a wa_create_merchant_checkout_order sigue viniendo exclusivamente de computeOrderTotals, sin sumar el fee', () => {
    expect(indexSource).toMatch(/p_total_amount: fromCents\(totals\.totalCents\),/);
    expect(indexSource).not.toMatch(/p_total_amount:[^,]*feeResult/);
    expect(indexSource).not.toMatch(/p_total_amount:[^,]*marketplaceFee/);
  });
});
