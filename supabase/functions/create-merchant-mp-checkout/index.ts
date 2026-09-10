// create-merchant-mp-checkout — MP-CHECKOUT-1.
// Núcleo server-side del checkout de Mercado Pago DEL COMERCIO: el
// cliente final de un negocio paga directamente a LA CUENTA MP de ese
// negocio (conectada vía MP-OAUTH), no a Walinka. Completamente
// aislado del billing de plataforma: no importa ni toca
// create-mp-preference, mp-webhook, wa_payments, wa_payment_events,
// billing_subscriptions, ni lee MP_ACCESS_TOKEN_CL/MP_ACCESS_TOKEN_AR.
//
// Público a propósito (verify_jwt=false en config.toml): el comprador
// del catálogo NO tiene sesión Walinka. "Público" no significa
// "confiable" -- absolutamente nada del body se usa como autoridad de
// precio/negocio/moneda; todo se resuelve y recalcula server-side.
//
// Alcance de esta fase (MP-CHECKOUT-1): SOLO crear el pedido pendiente
// y la preferencia de Checkout Pro. NO implementa todavía:
// merchant-mp-webhook, decremento de stock, refunds, refresh de
// token, ni ningún cambio visual del catálogo.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSupabaseAdminKeyOrEmpty } from '../_shared/supabaseAdminKey.ts';
import {
  MAX_BODY_BYTES,
  MAX_ADDRESS_LENGTH,
  MAX_NOTES_LENGTH,
  parseCartItems,
  parseCustomer,
  parseServiceType,
  sanitizeOptionalText,
  resolveCheckoutCurrency,
  validateCart,
  computeOrderTotals,
  buildExternalReference,
  buildBackUrls,
  buildPreferencePayload,
  buildOrderItemsPayload,
  isTokenExpired,
  fromCents,
  type ProductRow,
} from './lib.ts';

const MP_PREFERENCE_URL = 'https://api.mercadopago.com/checkout/preferences';
const DEFAULT_APP_BASE_URL = 'https://go.ventalink.app';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(error: string, reason: string, status: number) {
  return jsonResponse({ error, reason }, status);
}

// Campos que el frontend puede enviar pero que NUNCA son autoridad --
// se ignoran explícitamente, nunca se leen para ninguna decisión.
const IGNORED_UNTRUSTED_FIELDS = [
  'businessId', 'price', 'unit_price', 'subtotal', 'total', 'currency',
  'productName', 'access_token', 'preference_id', 'external_reference',
] as const;

const CART_VALIDATION_STATUS: Record<string, number> = {
  EMPTY_CART: 400,
  INVALID_REQUEST: 400,
  PRODUCT_NOT_FOUND: 404,
  PRODUCT_NOT_AVAILABLE: 409,
  INSUFFICIENT_STOCK: 409,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 'INVALID_REQUEST', 405);
  }

  // ── 0. Guard de tamaño de body -- antes de leerlo (sección 19: CORS/abuse) ──
  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return errorResponse('Request too large', 'INVALID_REQUEST', 400);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    body = {};
  }

  // ── 1. Ignorar explícitamente cualquier campo de "autoridad" recibido ───
  const presentUntrustedFields = IGNORED_UNTRUSTED_FIELDS.filter((k) => body?.[k] !== undefined);
  if (presentUntrustedFields.length > 0) {
    console.warn('[create-merchant-mp-checkout] campos IGNORADOS del body (no son autoridad):', presentUntrustedFields);
  }

  // ── 2. Parsear/validar intención mínima del frontend ─────────────────────
  const businessSlug = typeof body?.businessSlug === 'string' ? body.businessSlug.trim() : '';
  if (!businessSlug || businessSlug.length > 200) {
    return errorResponse('businessSlug requerido', 'INVALID_REQUEST', 400);
  }

  const cartResult = parseCartItems(body?.items);
  if (!cartResult.ok) {
    return errorResponse('Carrito inválido', cartResult.reason, CART_VALIDATION_STATUS[cartResult.reason]);
  }

  const customerResult = parseCustomer(body?.customer);
  if (!customerResult.ok) {
    return errorResponse('Datos de cliente inválidos', 'INVALID_REQUEST', 400);
  }

  const serviceType = parseServiceType(body?.serviceType);
  if (serviceType === 'invalid') {
    return errorResponse('serviceType inválido', 'INVALID_REQUEST', 400);
  }

  const deliveryAddress = sanitizeOptionalText(body?.deliveryAddress, MAX_ADDRESS_LENGTH);
  if (deliveryAddress === 'invalid') {
    return errorResponse('deliveryAddress inválido', 'INVALID_REQUEST', 400);
  }

  const notes = sanitizeOptionalText(body?.notes, MAX_NOTES_LENGTH);
  if (notes === 'invalid') {
    return errorResponse('notes inválido', 'INVALID_REQUEST', 400);
  }

  // ── 3. Cliente admin (service_role) -- único cliente usado en esta función,
  //      no hay JWT de usuario que validar (comprador sin sesión Walinka) ───
  const supabaseUrl    = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = getSupabaseAdminKeyOrEmpty();
  if (!serviceRoleKey) {
    console.error('[create-merchant-mp-checkout] server configuration missing (admin key)');
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // ── 4. Resolver negocio EXCLUSIVAMENTE por businessSlug -- business_id
  //      del body ya fue ignorado en el paso 1 ────────────────────────────
  const { data: business, error: bizError } = await admin
    .from('wa_businesses')
    .select('id, is_active, country_code')
    .eq('slug', businessSlug)
    .maybeSingle();

  if (bizError) {
    console.error('[create-merchant-mp-checkout] error consultando wa_businesses:', bizError.message);
    return errorResponse('Negocio no encontrado', 'BUSINESS_NOT_FOUND', 404);
  }
  if (!business) {
    return errorResponse('Negocio no encontrado', 'BUSINESS_NOT_FOUND', 404);
  }
  if (!business.is_active) {
    return errorResponse('Negocio no disponible', 'BUSINESS_INACTIVE', 404);
  }

  // ── 5. País/moneda -- estricto, server-side, sin fuzzy matching, sin
  //      fallback a `country`, sin confiar en `currency` del body ─────────
  const currencyResult = resolveCheckoutCurrency(business.country_code);
  if (!currencyResult.ok) {
    return errorResponse('Mercado Pago no disponible para este negocio', 'MP_COUNTRY_NOT_SUPPORTED', 422);
  }

  // ── 6. Validar productos + recalcular precio EXCLUSIVAMENTE desde DB ────
  const productIds = [...new Set(cartResult.items.map((item) => item.productId))];
  const { data: productRows, error: productsError } = await admin
    .from('wa_products')
    .select('id, business_id, name, price, is_active, is_sold_out, stock_actual')
    .in('id', productIds);

  if (productsError) {
    console.error('[create-merchant-mp-checkout] error consultando wa_products:', productsError.message);
    return errorResponse('Producto no encontrado', 'PRODUCT_NOT_FOUND', 404);
  }

  const productsById = new Map<string, ProductRow>(
    (productRows ?? []).map((p) => [
      p.id as string,
      {
        id: p.id as string,
        businessId: p.business_id as string,
        name: p.name as string,
        price: Number(p.price),
        isActive: !!p.is_active,
        isSoldOut: !!p.is_sold_out,
        stockActual: p.stock_actual === null ? null : Number(p.stock_actual),
      },
    ]),
  );

  const cartValidation = validateCart(cartResult.items, productsById, business.id as string);
  if (!cartValidation.ok) {
    return errorResponse('Carrito inválido', cartValidation.reason, CART_VALIDATION_STATUS[cartValidation.reason]);
  }

  const totals = computeOrderTotals(cartValidation.lines);

  // ── 7. Conexión Mercado Pago DEL COMERCIO -- nunca MP_ACCESS_TOKEN_CL/AR ─
  const { data: connectionRows, error: connError } = await admin.rpc('wa_get_mp_connection_for_checkout', {
    p_business_id: business.id,
  });

  if (connError) {
    console.error('[create-merchant-mp-checkout] error consultando mp_connection:', connError.message);
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  const connection = Array.isArray(connectionRows) ? connectionRows[0] : null;
  if (!connection) {
    return errorResponse('Este negocio no tiene Mercado Pago conectado', 'MP_NOT_CONNECTED', 409);
  }
  if (isTokenExpired(connection.token_expires_at as string | null)) {
    console.warn('[create-merchant-mp-checkout] token MP expirado', { businessId: business.id });
    return errorResponse('La conexión de Mercado Pago expiró', 'MP_CONNECTION_EXPIRED', 409);
  }
  const mpAccessToken = connection.access_token as string;

  // ── 8. Crear pedido ATÓMICO (wa_orders + wa_order_items) -- pendiente,
  //      ANTES de llamar a Mercado Pago ────────────────────────────────────
  const { data: orderId, error: orderError } = await admin.rpc('wa_create_merchant_checkout_order', {
    p_business_id: business.id,
    p_customer_name: customerResult.customer.name,
    p_customer_email: customerResult.customer.email,
    p_customer_phone: customerResult.customer.phone,
    p_service_type: serviceType,
    p_delivery_address: deliveryAddress,
    p_notes: notes,
    p_currency: currencyResult.currency,
    p_subtotal: fromCents(totals.subtotalCents),
    p_total_amount: fromCents(totals.totalCents),
    p_items: buildOrderItemsPayload(cartValidation.lines),
  });

  if (orderError || !orderId) {
    console.error('[create-merchant-mp-checkout] error creando pedido:', orderError?.message, { businessId: business.id });
    return errorResponse('No se pudo crear el pedido', 'ORDER_CREATION_FAILED', 500);
  }

  console.log('[create-merchant-mp-checkout] order_created_pending', { businessId: business.id, orderId });

  // ── 9. external_reference -- SIEMPRE construida server-side ──────────────
  const externalReference = buildExternalReference(business.id as string, orderId as string);

  // ── 10. back_urls -- dominio canónico Walinka (ver auditoría MP-CHECKOUT-0
  //       sección 15: no se resuelve dominio propio del comercio en esta
  //       fase, se reporta como limitación conocida en el reporte final) ────
  const appBaseUrl = (Deno.env.get('APP_BASE_URL') ?? DEFAULT_APP_BASE_URL).replace(/\/$/, '');
  const backUrls = buildBackUrls(appBaseUrl, businessSlug);

  // notification_url -- URL final prevista para merchant-mp-webhook
  // (MP-CHECKOUT-2). Opcional: si no está configurada todavía, se omite
  // del payload (mismo patrón que create-mp-preference).
  const notificationUrl = Deno.env.get('MERCHANT_MP_WEBHOOK_URL') ?? '';

  const preferencePayload = buildPreferencePayload({
    lines: cartValidation.lines,
    currency: currencyResult.currency,
    externalReference,
    backUrls,
    notificationUrl: notificationUrl || undefined,
    payerName: customerResult.customer.name,
    payerEmail: customerResult.customer.email,
  });

  // ── 11. Crear preferencia en Mercado Pago -- token DEL COMERCIO ──────────
  let mpRes: Response;
  try {
    mpRes = await fetch(MP_PREFERENCE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mpAccessToken}` },
      body: JSON.stringify(preferencePayload),
    });
  } catch (err) {
    console.error('[create-merchant-mp-checkout] fetch a checkout/preferences falló:', (err as Error)?.message, { businessId: business.id, orderId });
    return errorResponse('No se pudo crear la preferencia de pago', 'MP_PREFERENCE_FAILED', 502);
  }

  const mpBodyText = await mpRes.text();
  if (!mpRes.ok) {
    // Solo el status -- nunca el body completo (podría ecoar el payload
    // enviado, incluida información no destinada al browser).
    console.error('[create-merchant-mp-checkout] MP checkout/preferences respondió error, status:', mpRes.status, { businessId: business.id, orderId });
    return errorResponse('No se pudo crear la preferencia de pago', 'MP_PREFERENCE_FAILED', 502);
  }

  let preference: { id?: string; init_point?: string; sandbox_init_point?: string };
  try {
    preference = JSON.parse(mpBodyText);
  } catch {
    console.error('[create-merchant-mp-checkout] respuesta de MP no es JSON válido', { businessId: business.id, orderId });
    return errorResponse('No se pudo crear la preferencia de pago', 'MP_PREFERENCE_FAILED', 502);
  }

  const initPoint = preference?.init_point || preference?.sandbox_init_point;
  if (!initPoint) {
    console.error('[create-merchant-mp-checkout] respuesta de MP sin init_point', { businessId: business.id, orderId });
    return errorResponse('No se pudo crear la preferencia de pago', 'MP_PREFERENCE_FAILED', 502);
  }

  console.log('[create-merchant-mp-checkout] preference_created', {
    businessId: business.id,
    orderId,
    preferenceId: preference?.id,
    sandbox: !!preference?.sandbox_init_point,
  });

  // ── 12. Respuesta mínima -- nunca access_token, nunca la respuesta cruda
  //       de Mercado Pago ─────────────────────────────────────────────────
  return jsonResponse({ ok: true, init_point: initPoint, preference_id: preference?.id ?? null, order_id: orderId }, 200);
});
