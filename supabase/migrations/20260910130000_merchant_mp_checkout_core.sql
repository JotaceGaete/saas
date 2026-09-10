-- ============================================================
-- MP-CHECKOUT-1 — núcleo server-side del checkout Mercado Pago
-- DEL COMERCIO (no confundir con billing de plataforma).
--
-- Completamente aislado de:
--   - wa_payments / wa_payment_events / billing_subscriptions
--   - create-mp-preference / mp-webhook
--   - MP_ACCESS_TOKEN_CL / MP_ACCESS_TOKEN_AR
-- Esas 2 rutas siguen usando `provider='mercado_pago'` (billing);
-- esta migración solo agrega RPCs para el checkout de CATÁLOGO,
-- que usa la conexión OAuth del comercio (mp_connections,
-- `provider='mercado_pago_connect'`, ver 20260907120000_mp_oauth_connect.sql).
--
-- No crea tablas nuevas. No modifica wa_orders/wa_order_items/
-- wa_products/wa_businesses/mp_connections. Agrega únicamente 2 RPCs
-- service_role-only:
--
--   1. wa_get_mp_connection_for_checkout(business_id)
--      Descifra y devuelve el access_token de la conexión MP de un
--      negocio -- exclusivamente para uso server-side dentro de
--      create-merchant-mp-checkout (y, en una fase futura,
--      merchant-mp-webhook). Nunca refresh_token, nunca alcanzable
--      por anon/authenticated.
--
--   2. wa_create_merchant_checkout_order(...)
--      Crea wa_orders + wa_order_items en una única invocación
--      (atómica: ambos INSERT ocurren dentro de la misma función,
--      dentro de la misma transacción implícita) en vez de 2
--      llamadas independientes desde el cliente (patrón actual de
--      createOrder() en waBusinessService.js, que SÍ es no-atómico
--      -- ver auditoría MP-CHECKOUT-0). Recibe precios/cantidades ya
--      recalculados y validados server-side por la Edge Function
--      llamante (que corre con service_role) -- esta RPC no vuelve a
--      consultar wa_products, solo persiste de forma atómica lo que
--      ya fue validado en el mismo request server-to-server.
--      service_role-only: el frontend jamás puede invocarla
--      directamente, ni siquiera autenticado.
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. wa_get_mp_connection_for_checkout(p_business_id) — lectura del
--    access_token EN CLARO, exclusivamente server-side.
--
--    Reusa wa_mp_connection_encryption_key() (misma clave de Vault que
--    wa_upsert_mp_connection). Solo devuelve una fila si existe una
--    conexión con status='connected' para ese negocio -- una conexión
--    desconectada (fila inexistente, ya que mp-oauth-disconnect hace
--    DELETE físico) o con status distinto simplemente no aparece, sin
--    distinguir la razón (mismo criterio "sin oráculo" que el resto de
--    MP-OAUTH). NUNCA devuelve refresh_token_ciphertext/refresh_token:
--    MP-CHECKOUT-1 no implementa refresh todavía (ver header del
--    ticket) y no hay motivo para descifrarlo aún.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_get_mp_connection_for_checkout(p_business_id UUID)
RETURNS TABLE (
  access_token      TEXT,
  token_expires_at  TIMESTAMPTZ,
  provider_user_id  TEXT,
  live_mode         BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_key TEXT;
BEGIN
  IF p_business_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_REQUIRED_PARAMETER' USING ERRCODE = 'P0001';
  END IF;

  v_key := public.wa_mp_connection_encryption_key();

  RETURN QUERY
  SELECT
    pgp_sym_decrypt(mc.access_token_ciphertext, v_key),
    mc.token_expires_at,
    mc.provider_user_id,
    mc.live_mode
  FROM public.mp_connections mc
  WHERE mc.business_id = p_business_id
    AND mc.status = 'connected';
END;
$$;

REVOKE ALL ON FUNCTION public.wa_get_mp_connection_for_checkout(UUID) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.wa_get_mp_connection_for_checkout(UUID) IS
  'service_role-only. Descifra y devuelve el access_token EN CLARO de la conexión mercado_pago_connect de un negocio -- exclusivamente para llamar la API de Mercado Pago server-side dentro de create-merchant-mp-checkout. Nunca devuelve refresh_token (MP-CHECKOUT-1 no implementa refresh). Sin fila si no existe conexión con status=''connected'' para ese business_id -- el llamador decide si eso significa "nunca conectado" o "desconectado", sin distinguir la razón exacta (mismo criterio que wa_get_my_mp_connection_status). No debe usarse desde ningún camino alcanzable por anon/authenticated.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. wa_create_merchant_checkout_order(...) — inserción atómica de
--    wa_orders + wa_order_items para un checkout de catálogo.
--
--    payment_status siempre 'pendiente' al crearse (la Edge Function
--    jamás puede pasar otro valor -- no es parámetro de esta función).
--    order_status siempre 'pedido' (mismo default que createOrder()
--    hoy). Los triggers existentes de wa_orders (wa_orders_updated_at,
--    wa_orders_set_paid_at, wa_orders_link_customer,
--    wa_orders_enforce_limit_trigger) se aplican exactamente igual que
--    con cualquier otro INSERT -- en particular, un negocio en un plan
--    con límite mensual de pedidos alcanzado sigue bloqueado acá
--    también (PLAN_LIMIT_EXCEEDED se propaga como excepción; la Edge
--    Function la traduce a ORDER_CREATION_FAILED sin exponer el texto
--    crudo de Postgres al browser).
--
--    p_items es un array JSONB de objetos {product_id, product_name,
--    unit_price, quantity, subtotal} -- ya validados/recalculados
--    server-side por la Edge Function (product.business_id = negocio
--    resuelto, is_active, !is_sold_out, stock si aplica, precio leído
--    de wa_products.price). Esta RPC NO vuelve a tocar wa_products: es
--    un primitivo de persistencia atómica, no de validación de
--    negocio -- misma división de responsabilidades que
--    wa_upsert_mp_connection (cifra y persiste lo que el llamador ya
--    resolvió, sin re-verificar contra Mercado Pago).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_create_merchant_checkout_order(
  p_business_id      UUID,
  p_customer_name    TEXT,
  p_customer_email   TEXT,
  p_customer_phone   TEXT,
  p_service_type     TEXT,
  p_delivery_address TEXT,
  p_notes            TEXT,
  p_currency         TEXT,
  p_subtotal         NUMERIC,
  p_total_amount     NUMERIC,
  p_items            JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_order_id UUID;
  v_item     JSONB;
BEGIN
  IF p_business_id IS NULL
     OR p_customer_name IS NULL OR btrim(p_customer_name) = ''
     OR p_currency IS NULL OR btrim(p_currency) = ''
     OR p_total_amount IS NULL OR p_subtotal IS NULL
  THEN
    RAISE EXCEPTION 'MISSING_REQUIRED_PARAMETER' USING ERRCODE = 'P0001';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'EMPTY_CART' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.wa_orders (
    business_id, customer_name, customer_email, customer_phone,
    total_amount, subtotal, currency,
    order_status, payment_status,
    service_type, delivery_address, notes
  ) VALUES (
    p_business_id,
    p_customer_name,
    NULLIF(btrim(COALESCE(p_customer_email, '')), ''),
    NULLIF(btrim(COALESCE(p_customer_phone, '')), ''),
    p_total_amount,
    p_subtotal,
    p_currency,
    'pedido',
    'pendiente',
    p_service_type,
    p_delivery_address,
    NULLIF(btrim(COALESCE(p_notes, '')), '')
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.wa_order_items (
      order_id, product_id, product_name, product_price, quantity, subtotal
    ) VALUES (
      v_order_id,
      (v_item->>'product_id')::UUID,
      v_item->>'product_name',
      (v_item->>'unit_price')::NUMERIC,
      (v_item->>'quantity')::INTEGER,
      (v_item->>'subtotal')::NUMERIC
    );
  END LOOP;

  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.wa_create_merchant_checkout_order(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, JSONB
) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.wa_create_merchant_checkout_order(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, JSONB
) IS
  'service_role-only. Crea wa_orders + wa_order_items de forma atómica (una sola invocación de función, dentro de la misma transacción implícita) para el checkout público de Mercado Pago del comercio -- reemplaza, para este flujo, el patrón no-atómico de 2 INSERT separados que usa hoy createOrder() en el frontend. payment_status siempre arranca en ''pendiente'' (no es parámetro). No revalida productos/precios contra wa_products -- confía en que el llamador (create-merchant-mp-checkout, corriendo con service_role) ya recalculó todo server-side en el mismo request. Sujeta a los triggers existentes de wa_orders sin excepción, incluido el límite de pedidos por plan (wa_orders_enforce_limit_trigger). El frontend NUNCA debe poder invocar esta función directamente -- ni siquiera autenticado.';

NOTIFY pgrst, 'reload schema';
