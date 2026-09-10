-- ============================================================
-- MP-CHECKOUT-2 — confirmación server-side de pagos de clientes del
-- checkout Mercado Pago DEL COMERCIO (webhook + idempotencia + stock).
--
-- Completamente aislado de:
--   - wa_payments / wa_payment_events / billing_subscriptions
--   - create-mp-preference / mp-webhook (billing)
--   - MP_ACCESS_TOKEN_CL / MP_ACCESS_TOKEN_AR
--
-- NO usa crm_payments. Auditado antes de escribir esta migración:
-- 20260808110000_crm_payments_reconciliation.sql documenta un DRIFT
-- de producción sobre exactamente la columna que se necesitaría acá
-- ("crm_payments.order_id: producción NO tiene order_id... es un
-- incidente operacional separado del drift histórico y NO se toca
-- acá"). Persistir un registro financiero automático sobre una
-- columna cuya existencia real en producción está auto-documentada
-- como incierta no es aceptable para MP-CHECKOUT-2. wa_merchant_
-- payment_events es, por diseño, el ledger técnico completo de este
-- flujo -- no un complemento de crm_payments.
--
-- No crea tablas nuevas fuera de wa_merchant_payment_events. No
-- modifica wa_orders/wa_order_items/wa_products/mp_connections. Usa
-- crm_stock_movements + su trigger existente (crm_apply_stock_movement,
-- 20260619150000_enforce_stock_movements_trigger.sql) como el único
-- mecanismo de decremento de stock -- NUNCA se escribe
-- wa_products.stock_actual directamente.
--
-- IMPORTANTE (re-confirmado leyendo el trigger real antes de escribir
-- esto): crm_apply_stock_movement() solo lanza excepción si el
-- producto no existe para ese business_id -- si stock_actual es NULL
-- (sin control de stock) igual "encuentra" la fila y calcularía
-- GREATEST(0, 0 - quantity) = 0, es decir, INICIALIZARÍA el stock a 0
-- para un producto que nunca tuvo control de stock activado. Por eso
-- wa_process_merchant_payment_event() más abajo filtra explícitamente
-- por stock_actual IS NOT NULL antes de insertar cualquier movimiento
-- -- no es una optimización, es un requisito de corrección.
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. wa_merchant_payment_events — ledger + idempotencia por mp_payment_id.
--
--    Diseño: UNA fila por mp_payment_id (UNIQUE), actualizada in-place
--    en cada notificación (upsert), en vez de una fila por evento
--    recibido (a diferencia de wa_payment_events de billing). Se eligió
--    así porque acá SÍ existe una columna dedicada para la garantía
--    crítica de "no doble descuento de stock" (stock_applied_at) que
--    necesita poder LOCKEARSE (SELECT ... FOR UPDATE) y consultarse en
--    O(1) por mp_payment_id sin agregación -- una fila por evento
--    obligaría a esa agregación (¿ya existe algún evento 'approved'
--    para este payment_id?) en cada notificación, con más superficie
--    para una race condition entre el SELECT de chequeo y el INSERT
--    del nuevo evento. Con una única fila lockeable, el gate de
--    "aplicar side-effects una sola vez" es estructuralmente imposible
--    de bypasear por dos llamadas concurrentes (ver
--    wa_process_merchant_payment_event: SELECT...FOR UPDATE ANTES de
--    cualquier side-effect). mp_status/mp_status_detail siempre
--    reflejan el ÚLTIMO estado conocido por Mercado Pago para ese
--    payment_id -- no se pierde historial relevante para MP-CHECKOUT-2
--    (solo approved/pending/in_process/rejected/cancelled importan acá;
--    transiciones intermedias no aplicadas nunca mueven wa_orders ni
--    stock, así que no hay nada que "perder" no auditando cada paso).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.wa_merchant_payment_events (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         UUID        NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  order_id            UUID        NOT NULL REFERENCES public.wa_orders(id) ON DELETE CASCADE,

  mp_payment_id       TEXT        NOT NULL,
  mp_status           TEXT        NOT NULL,
  mp_status_detail    TEXT,

  amount              NUMERIC(10,2) NOT NULL,
  currency            TEXT        NOT NULL,
  external_reference  TEXT        NOT NULL,

  -- Se setea UNA sola vez, exactamente cuando este payment_id aplica
  -- sus side-effects (payment_status='pagado' + stock) por primera y
  -- única vez. Es el gate atómico de "no doble descuento" -- ver RPC.
  stock_applied_at    TIMESTAMPTZ,

  processed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT wa_merchant_payment_events_mp_payment_id_unique UNIQUE (mp_payment_id),
  -- Vocabulario real de Mercado Pago (Payments API) -- incluye
  -- refunded/charged_back aunque MP-CHECKOUT-2 no los procesa
  -- todavía (solo se registran en el ledger, sin side-effects; ver
  -- RPC), para no romper el INSERT si MP los envía.
  CONSTRAINT wa_merchant_payment_events_mp_status_check CHECK (
    mp_status IN (
      'pending', 'approved', 'authorized', 'in_process', 'in_mediation',
      'rejected', 'cancelled', 'refunded', 'charged_back'
    )
  )
);

CREATE INDEX idx_wa_merchant_payment_events_business_id ON public.wa_merchant_payment_events(business_id);
CREATE INDEX idx_wa_merchant_payment_events_order_id    ON public.wa_merchant_payment_events(order_id);

COMMENT ON TABLE public.wa_merchant_payment_events IS
  'MP-CHECKOUT-2: ledger técnico + idempotencia de pagos de clientes del checkout Mercado Pago DEL COMERCIO. UNA fila por mp_payment_id (UNIQUE), actualizada in-place -- no un log de eventos por notificación. Nunca contiene access_token/refresh_token/client_secret. RPC-only desde el cliente: sin GRANT de tabla a ningún rol, ver REVOKE más abajo. Escritura exclusiva de merchant-mp-webhook (service_role) vía wa_process_merchant_payment_event().';
COMMENT ON COLUMN public.wa_merchant_payment_events.stock_applied_at IS
  'NULL hasta que este payment_id pasa a approved por primera vez Y se aplica el decremento de stock + payment_status=''pagado''. A partir de ahí, cualquier notificación posterior para el mismo mp_payment_id (duplicada o con un status distinto) actualiza solo mp_status/mp_status_detail/processed_at -- nunca vuelve a tocar wa_orders ni crm_stock_movements. Es el gate atómico de "no doble descuento", lockeado vía SELECT...FOR UPDATE dentro de wa_process_merchant_payment_event().';

-- Sin trigger de updated_at: esta tabla no tiene esa columna a
-- propósito -- wa_process_merchant_payment_event() ya setea
-- processed_at = now() explícitamente en cada camino de escritura
-- (INSERT inicial, upsert de estado, y actualización post-side-effects),
-- así que un trigger genérico sería redundante (y wa_set_updated_at()
-- específicamente espera una columna updated_at que esta tabla no tiene).

ALTER TABLE public.wa_merchant_payment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.wa_merchant_payment_events FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. wa_process_merchant_payment_event(...) — transición atómica de un
--    pago a su estado confirmado por Mercado Pago.
--
--    Todo lo que sigue ocurre dentro de UNA sola invocación de función
--    (una sola transacción implícita): lock de la fila del evento,
--    upsert del ledger, validación de monto/moneda contra wa_orders
--    (defensa en profundidad -- el llamador YA validó esto contra la
--    respuesta fresca de Mercado Pago antes de invocar esta RPC),
--    actualización de wa_orders.payment_status, generación de
--    crm_stock_movements por cada línea con control de stock, y el
--    marcado stock_applied_at -- nada de esto depende de múltiples
--    llamadas independientes desde la Edge Function.
--
--    SELECT ... FOR UPDATE sobre la fila existente (si la hay) ANTES
--    de cualquier side-effect serializa automáticamente 2 llamadas
--    concurrentes para el MISMO mp_payment_id (la segunda espera a
--    que la primera termine su transacción, y al reanudar ve
--    stock_applied_at ya seteado -- entra por la rama "ya procesado",
--    sin aplicar nada de nuevo). Esto cubre tanto un webhook
--    duplicado como una notificación 'approved' repetida.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_process_merchant_payment_event(
  p_business_id        UUID,
  p_order_id           UUID,
  p_mp_payment_id      TEXT,
  p_mp_status          TEXT,
  p_mp_status_detail   TEXT,
  p_amount             NUMERIC,
  p_currency           TEXT,
  p_external_reference TEXT
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
    -- tocar wa_orders ni stock.
    UPDATE public.wa_merchant_payment_events
       SET mp_status = p_mp_status, mp_status_detail = p_mp_status_detail, processed_at = now()
     WHERE mp_payment_id = p_mp_payment_id;

    RETURN QUERY SELECT false, true, v_order.payment_status;
    RETURN;
  END IF;

  -- Upsert del ledger (inserta si es la primera notificación de este
  -- payment_id, actualiza el snapshot de estado si ya existía pero
  -- sin side-effects aplicados todavía).
  INSERT INTO public.wa_merchant_payment_events (
    business_id, order_id, mp_payment_id, mp_status, mp_status_detail,
    amount, currency, external_reference
  ) VALUES (
    p_business_id, p_order_id, p_mp_payment_id, p_mp_status, p_mp_status_detail,
    p_amount, p_currency, p_external_reference
  )
  ON CONFLICT (mp_payment_id) DO UPDATE SET
    mp_status        = EXCLUDED.mp_status,
    mp_status_detail = EXCLUDED.mp_status_detail,
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
    -- activado (stock_actual IS NOT NULL) -- ver comentario de
    -- cabecera sobre por qué esto es obligatorio, no opcional.
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
    -- explícitamente fuera de alcance de MP-CHECKOUT-2).
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
  UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.wa_process_merchant_payment_event(
  UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT
) IS
  'service_role-only. Transición atómica de un pago del checkout de comercio: idempotente por mp_payment_id (UNIQUE + SELECT...FOR UPDATE), aplica payment_status=''pagado'' + crm_stock_movements EXACTAMENTE UNA VEZ por payment_id cuando mp_status=''approved'' (gate: stock_applied_at). rejected/cancelled marcan ''anulado'' solo si el pedido seguía ''pendiente'' -- nunca revierte un pedido ya ''pagado''. Valida amount/currency contra wa_orders como defensa en profundidad (el llamador ya lo validó contra la respuesta fresca de Mercado Pago). El frontend NUNCA debe poder invocar esta función directamente -- ni siquiera autenticado.';

NOTIFY pgrst, 'reload schema';
