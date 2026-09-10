-- ============================================================
-- MP-MARKETPLACE-1 — comisión Walinka (1%) sobre el checkout de
-- Mercado Pago DEL COMERCIO, vía Split Payments 1:1 (marketplace_fee).
--
-- marketplace_fee es la comisión de PLATAFORMA descontada de la
-- liquidación del VENDEDOR -- NUNCA un recargo al comprador. El
-- comprador sigue pagando exactamente wa_orders.total_amount, sin
-- cambios (create-merchant-mp-checkout/index.ts y
-- merchant-mp-webhook/index.ts no modifican esa invariante en esta
-- fase).
--
-- Extiende wa_merchant_payment_events (creada en MP-CHECKOUT-2,
-- 20260910140000) en vez de crear una tabla nueva -- ya es el ledger
-- técnico 1:1 por mp_payment_id de este flujo (ver auditoría
-- MP-MARKETPLACE-0 sección G: extenderla evita una segunda fuente de
-- verdad desincronizable del mismo mp_payment_id y reutiliza el gate
-- de idempotencia ya probado, stock_applied_at). Fase mínima a
-- propósito: solo walinka_fee NOT NULL DEFAULT 0. mp_fee/
-- seller_net_amount quedan explícitamente fuera de esta migración --
-- se agregarían NULLABLE en una fase futura, solo si se confirma que
-- Mercado Pago los devuelve de forma fiable (ver auditoría sección K,
-- riesgo #3).
--
-- No renombra columnas existentes. No toca billing
-- (create-mp-preference/mp-webhook/wa_payments/wa_payment_events/
-- billing_subscriptions), OAuth (mp-oauth-*/mp_connections),
-- wa_orders, wa_order_items ni crm_stock_movements.
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. walinka_fee — comisión Walinka persistida por evento de pago.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.wa_merchant_payment_events
  ADD COLUMN IF NOT EXISTS walinka_fee NUMERIC(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.wa_merchant_payment_events.walinka_fee IS
  'MP-MARKETPLACE-1: comisión de PLATAFORMA (Walinka) descontada de la liquidación del VENDEDOR vía marketplace_fee de Mercado Pago -- NUNCA un recargo al comprador, que sigue pagando exactamente wa_orders.total_amount. 1% de ese total (WALINKA_MARKETPLACE_FEE_BPS=100 en supabase/functions/_shared/walinkaMarketplaceFee.ts), calculado server-side de forma DETERMINISTA por merchant-mp-webhook a partir de amount/currency de este mismo evento (nunca leído de un valor enviado por el frontend ni de la respuesta de Mercado Pago). DEFAULT 0 por compatibilidad con filas de MP-CHECKOUT-2 anteriores a esta fase (sin comisión aplicable retroactivamente).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. wa_process_merchant_payment_event — se agrega p_walinka_fee.
--
--    DROP + CREATE porque cambia la firma (nuevo parámetro) -- mismo
--    patrón que 20260810100000_referral_paid_periods_consecutive_
--    streaks.sql para evitar que PostgREST exponga dos overloads de la
--    misma función.
--
--    p_walinka_fee es REQUERIDO (no tiene DEFAULT): el llamador
--    (merchant-mp-webhook) siempre debe calcularlo explícitamente vía
--    computeWalinkaMarketplaceFee() antes de invocar esta RPC -- un
--    valor ausente debe fallar ruidosamente (MISSING_REQUIRED_
--    PARAMETER), nunca persistir 0 en silencio por omisión accidental.
--    Esta RPC NO recalcula el 1%: es, igual que con p_amount/
--    p_currency, un primitivo de persistencia que confía en que el
--    llamador ya hizo el cálculo correcto server-side.
--
--    Idempotencia sin cambios: walinka_fee se escribe en el INSERT
--    inicial y se sobreescribe (nunca se acumula) en cada notificación
--    pre-aplicación vía el mismo ON CONFLICT DO UPDATE que ya
--    actualiza mp_status/mp_status_detail -- una vez stock_applied_at
--    queda seteado, la rama de "ya procesado" retorna ANTES de tocar
--    el upsert, así que un webhook duplicado nunca duplica ni
--    recalcula la comisión ya persistida.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.wa_process_merchant_payment_event(
  UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION public.wa_process_merchant_payment_event(
  p_business_id        UUID,
  p_order_id           UUID,
  p_mp_payment_id      TEXT,
  p_mp_status          TEXT,
  p_mp_status_detail   TEXT,
  p_amount             NUMERIC,
  p_currency           TEXT,
  p_external_reference TEXT,
  p_walinka_fee        NUMERIC
)
RETURNS TABLE (applied_now BOOLEAN, already_processed BOOLEAN, order_payment_status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_order       RECORD;
  v_existing    RECORD;
  v_applied_now BOOLEAN := false;
  v_item        RECORD;
BEGIN
  IF p_business_id IS NULL OR p_order_id IS NULL OR p_mp_payment_id IS NULL OR btrim(p_mp_payment_id) = ''
     OR p_mp_status IS NULL OR p_amount IS NULL OR p_currency IS NULL OR p_external_reference IS NULL
     OR p_walinka_fee IS NULL
  THEN
    RAISE EXCEPTION 'MISSING_REQUIRED_PARAMETER' USING ERRCODE = 'P0001';
  END IF;

  -- El pedido debe existir y pertenecer al negocio indicado -- defensa
  -- en profundidad, el llamador ya lo resolvió así antes de invocar.
  SELECT id, business_id, total_amount, currency, payment_status
    INTO v_order
    FROM public.wa_orders
   WHERE id = p_order_id AND business_id = p_business_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_BUSINESS_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  -- Lock de la fila del evento (si existe) -- serializa concurrencia
  -- para el mismo mp_payment_id antes de decidir si hay side-effects
  -- pendientes por aplicar.
  SELECT * INTO v_existing
    FROM public.wa_merchant_payment_events
   WHERE mp_payment_id = p_mp_payment_id
     FOR UPDATE;

  IF FOUND AND v_existing.stock_applied_at IS NOT NULL THEN
    -- Ya se aplicaron side-effects para este payment_id -- solo se
    -- actualiza el snapshot de estado (auditoría), nunca se vuelve a
    -- tocar wa_orders, stock ni la comisión de plataforma ya
    -- persistida en el INSERT inicial.
    UPDATE public.wa_merchant_payment_events
       SET mp_status = p_mp_status, mp_status_detail = p_mp_status_detail, processed_at = now()
     WHERE mp_payment_id = p_mp_payment_id;

    RETURN QUERY SELECT false, true, v_order.payment_status;
    RETURN;
  END IF;

  -- Upsert del ledger (inserta si es la primera notificación de este
  -- payment_id, actualiza el snapshot de estado -- walinka_fee incluida
  -- -- si ya existía pero sin side-effects aplicados todavía).
  INSERT INTO public.wa_merchant_payment_events (
    business_id, order_id, mp_payment_id, mp_status, mp_status_detail,
    amount, currency, external_reference, walinka_fee
  ) VALUES (
    p_business_id, p_order_id, p_mp_payment_id, p_mp_status, p_mp_status_detail,
    p_amount, p_currency, p_external_reference, p_walinka_fee
  )
  ON CONFLICT (mp_payment_id) DO UPDATE SET
    mp_status        = EXCLUDED.mp_status,
    mp_status_detail = EXCLUDED.mp_status_detail,
    walinka_fee      = EXCLUDED.walinka_fee,
    processed_at     = now();

  IF p_mp_status = 'approved' THEN
    -- Defensa en profundidad: el llamador ya comparó esto contra la
    -- respuesta fresca de Mercado Pago antes de invocar esta RPC.
    IF v_order.total_amount <> p_amount OR v_order.currency <> p_currency THEN
      RAISE EXCEPTION 'AMOUNT_CURRENCY_MISMATCH' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.wa_orders
       SET payment_status = 'pagado'
     WHERE id = p_order_id AND payment_status <> 'pagado';

    -- Stock: solo vía crm_stock_movements + su trigger existente
    -- (crm_apply_stock_movement) -- NUNCA UPDATE directo de
    -- wa_products.stock_actual. Solo productos con control de stock
    -- activado (stock_actual IS NOT NULL).
    FOR v_item IN
      SELECT oi.product_id, oi.quantity
        FROM public.wa_order_items oi
       WHERE oi.order_id = p_order_id
    LOOP
      INSERT INTO public.crm_stock_movements (business_id, product_id, type, quantity, notes)
      SELECT p_business_id, v_item.product_id, 'salida', v_item.quantity,
             'Venta Mercado Pago (checkout comercio) -- pedido ' || p_order_id
        FROM public.wa_products p
       WHERE p.id = v_item.product_id
         AND p.stock_actual IS NOT NULL;
    END LOOP;

    UPDATE public.wa_merchant_payment_events
       SET stock_applied_at = now()
     WHERE mp_payment_id = p_mp_payment_id;

    v_applied_now := true;

  ELSIF p_mp_status IN ('rejected', 'cancelled') THEN
    -- Nunca descuenta stock. Nunca revierte un pedido que ya esté
    -- 'pagado' (una notificación tardía/fuera de orden no puede
    -- des-aprobar un pago ya confirmado -- eso sería refund/chargeback,
    -- explícitamente fuera de alcance).
    UPDATE public.wa_orders
       SET payment_status = 'anulado'
     WHERE id = p_order_id AND payment_status = 'pendiente';

  -- pending / in_process / authorized / in_mediation / refunded /
  -- charged_back: el ledger ya quedó actualizado arriba (upsert);
  -- wa_orders y stock permanecen sin cambios a propósito.
  END IF;

  RETURN QUERY SELECT v_applied_now, false,
    (SELECT payment_status FROM public.wa_orders WHERE id = p_order_id);
END;
$$;

REVOKE ALL ON FUNCTION public.wa_process_merchant_payment_event(
  UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, NUMERIC
) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.wa_process_merchant_payment_event(
  UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, NUMERIC
) IS
  'service_role-only. Transición atómica de un pago del checkout de comercio: idempotente por mp_payment_id (UNIQUE + SELECT...FOR UPDATE), aplica payment_status=''pagado'' + crm_stock_movements EXACTAMENTE UNA VEZ por payment_id cuando mp_status=''approved'' (gate: stock_applied_at). rejected/cancelled marcan ''anulado'' solo si el pedido seguía ''pendiente'' -- nunca revierte un pedido ya ''pagado''. Valida amount/currency contra wa_orders como defensa en profundidad (el llamador ya lo validó contra la respuesta fresca de Mercado Pago). MP-MARKETPLACE-1: persiste p_walinka_fee (REQUERIDO, sin DEFAULT) tal cual lo calculó el llamador vía computeWalinkaMarketplaceFee() -- esta RPC no recalcula el 1%, solo persiste. El frontend NUNCA debe poder invocar esta función directamente -- ni siquiera autenticado.';

NOTIFY pgrst, 'reload schema';
