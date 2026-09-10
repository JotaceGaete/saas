-- ============================================================
-- MP-PAYMENT-DETAIL-1 — wa_order_payments: fuente normalizada de "cómo
-- se pagó este pedido", uniforme entre Mercado Pago (Checkout Pro hoy;
-- Point/QR a futuro) y pagos manuales (efectivo/transferencia/otro).
--
-- NO reemplaza nada existente:
--   - wa_merchant_payment_events sigue siendo el ledger técnico/
--     idempotente de eventos verificados de Mercado Pago (gate de
--     stock_applied_at, validación amount/currency/reference). Esta
--     migración lo EXTIENDE (agrega p_paid_at a
--     wa_process_merchant_payment_event) para que, en el mismo
--     evento ya idempotente, también se escriba wa_order_payments --
--     nunca lo sustituye ni cambia su comportamiento existente.
--   - crm_payments sigue siendo el sistema de caja/CRM existente
--     (ver auditoría MP-PAYMENT-DETAIL-0: acoplado a sesión de caja
--     abierta, numeración correlativa, RLS con DELETE directo del
--     comerciante -- semánticamente incompatible con un ledger
--     automático de pagos de gateway). No se toca.
--
-- Decisiones de producto YA TOMADAS (no re-decididas acá):
--   1. El 1% Walinka SOLO aplica a pagos Mercado Pago vía Walinka.
--   2. Pagos manuales (cash/bank_transfer/other) -> walinka_fee = 0.
--   3. EMAIL_AUTOMATION_ENABLED no aplica a esta fase (sin emails
--      todavía -- MP-PAYMENT-DETAIL-3).
--
-- Modelo semántico:
--   provider identifica el ORIGEN/PROCESADOR: 'mercado_pago' | 'manual'.
--   method    identifica CÓMO se pagó dentro de ese provider:
--     mercado_pago -> 'checkout_pro' | 'point' | 'qr'
--     manual       -> 'cash' | 'bank_transfer' | 'other'
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CREATE TABLE wa_order_payments
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.wa_order_payments (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           UUID          NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  order_id              UUID          NOT NULL REFERENCES public.wa_orders(id) ON DELETE CASCADE,

  provider              TEXT          NOT NULL,
  method                TEXT          NOT NULL,
  provider_payment_id   TEXT,

  status                TEXT          NOT NULL,

  gross_amount          NUMERIC(12,2) NOT NULL,
  currency              TEXT          NOT NULL,
  walinka_fee           NUMERIC(12,2) NOT NULL DEFAULT 0,
  mp_fee                NUMERIC(12,2),
  net_amount            NUMERIC(12,2),

  payer_name            TEXT,
  payer_email           TEXT,

  paid_at               TIMESTAMPTZ   NOT NULL,
  registered_by         UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  notes                 TEXT,

  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),

  -- provider/method coherentes -- imposible declarar mercado_pago con un
  -- method manual o viceversa (bloquea, a nivel de constraint, que un
  -- pago manual se disfrace de checkout_pro/point/qr).
  CONSTRAINT wa_order_payments_provider_check CHECK (provider IN ('mercado_pago', 'manual')),
  CONSTRAINT wa_order_payments_method_check   CHECK (method   IN ('checkout_pro', 'point', 'qr', 'cash', 'bank_transfer', 'other')),
  CONSTRAINT wa_order_payments_provider_method_check CHECK (
    (provider = 'mercado_pago' AND method IN ('checkout_pro', 'point', 'qr'))
    OR
    (provider = 'manual' AND method IN ('cash', 'bank_transfer', 'other'))
  ),

  -- provider_payment_id es OBLIGATORIO para mercado_pago (es el
  -- mp_payment_id real devuelto por MP) y PROHIBIDO para manual (no
  -- existe un id de proveedor real -- evita que un pago manual falsifique
  -- un provider_payment_id para colarse en la idempotencia de MP).
  CONSTRAINT wa_order_payments_provider_payment_id_check CHECK (
    (provider = 'mercado_pago' AND provider_payment_id IS NOT NULL)
    OR
    (provider = 'manual' AND provider_payment_id IS NULL)
  ),

  CONSTRAINT wa_order_payments_status_check CHECK (status IN ('confirmed', 'voided')),

  -- walinka_fee = 0 para pagos manuales -- decisión de producto #1/#2 de
  -- cabecera, aplicada como constraint (no solo como convención de las
  -- RPCs) para que sea estructuralmente imposible violarla.
  CONSTRAINT wa_order_payments_manual_zero_fee_check CHECK (
    provider <> 'manual' OR walinka_fee = 0
  ),

  CONSTRAINT wa_order_payments_gross_amount_check CHECK (gross_amount > 0),
  CONSTRAINT wa_order_payments_walinka_fee_check   CHECK (walinka_fee >= 0)
);

-- Idempotencia: un mismo (provider, provider_payment_id) nunca puede
-- generar dos filas -- un reintento del webhook de Mercado Pago para el
-- MISMO mp_payment_id no puede crear un segundo pago. Índice parcial
-- (no aplica a manual, que siempre tiene provider_payment_id NULL y
-- puede tener múltiples filas legítimas sin id de proveedor).
CREATE UNIQUE INDEX wa_order_payments_provider_payment_id_unique
  ON public.wa_order_payments(provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE INDEX idx_wa_order_payments_business_id ON public.wa_order_payments(business_id);
CREATE INDEX idx_wa_order_payments_order_id    ON public.wa_order_payments(order_id);

DROP TRIGGER IF EXISTS wa_order_payments_updated_at ON public.wa_order_payments;
CREATE TRIGGER wa_order_payments_updated_at
  BEFORE UPDATE ON public.wa_order_payments
  FOR EACH ROW EXECUTE FUNCTION public.wa_set_updated_at();

COMMENT ON TABLE public.wa_order_payments IS
  'MP-PAYMENT-DETAIL-1: fuente normalizada de "cómo se pagó este pedido", uniforme entre Mercado Pago (Checkout Pro/Point/QR) y pagos manuales (cash/bank_transfer/other). NO reemplaza wa_merchant_payment_events (ledger técnico/idempotente de Mercado Pago, sin cambios de rol) ni crm_payments (sistema de caja/CRM existente, sin cambios). RPC-only desde el cliente: sin GRANT de INSERT/UPDATE/DELETE a ningún rol, ver REVOKE más abajo. Escritura automática exclusiva de merchant-mp-webhook (vía wa_process_merchant_payment_event, service_role); escritura manual exclusiva de wa_register_manual_order_payment (authenticated, dueño del negocio).';
COMMENT ON COLUMN public.wa_order_payments.provider IS
  'Origen/procesador del pago: mercado_pago | manual. Determina qué valores de method son válidos (ver wa_order_payments_provider_method_check) y si provider_payment_id es obligatorio (mercado_pago) o prohibido (manual).';
COMMENT ON COLUMN public.wa_order_payments.method IS
  'Cómo se realizó el pago dentro de su provider: checkout_pro|point|qr (mercado_pago) o cash|bank_transfer|other (manual).';
COMMENT ON COLUMN public.wa_order_payments.provider_payment_id IS
  'mp_payment_id real de Mercado Pago cuando provider=mercado_pago (mismo valor que wa_merchant_payment_events.mp_payment_id para ese evento). NULL para manual -- prohibido por constraint, nunca inventado.';
COMMENT ON COLUMN public.wa_order_payments.mp_fee IS
  'Comisión propia de Mercado Pago -- NULL hasta verificar empíricamente qué campos de la respuesta de pagos de MP son fiables para esta integración (ver auditoría MP-PAYMENT-DETAIL-0 sección C/L). Nunca inventado ni estimado.';
COMMENT ON COLUMN public.wa_order_payments.net_amount IS
  'Neto que recibe el comercio tras comisiones -- NULL hasta poder derivarse de forma fiable (mismo criterio que mp_fee). Nunca calculado con datos no verificados.';
COMMENT ON COLUMN public.wa_order_payments.paid_at IS
  'Momento real de aprobación del pago. Para mercado_pago: payment.date_approved de la respuesta ya verificada de GET /v1/payments/:id cuando está presente y es válida; si no, el momento en que merchant-mp-webhook confirmó el evento (fallback documentado en merchant-mp-webhook/lib.ts resolvePaidAt(), nunca inventado). Para manual: now() en el momento del registro.';
COMMENT ON COLUMN public.wa_order_payments.registered_by IS
  'auth.uid() de quien registró el pago -- solo aplica a pagos manuales (auditoría de quién lo marcó). NULL para pagos automáticos de Mercado Pago.';

-- ── RLS: SELECT únicamente al dueño del negocio. Cero INSERT/UPDATE/
--    DELETE directo para authenticated/anon -- toda escritura pasa por
--    las 2 RPCs de más abajo (SECURITY DEFINER, bypasean RLS). ──────────
ALTER TABLE public.wa_order_payments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.wa_order_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.wa_order_payments TO authenticated;

DROP POLICY IF EXISTS "wa_order_payments_owner_select" ON public.wa_order_payments;
CREATE POLICY "wa_order_payments_owner_select"
  ON public.wa_order_payments FOR SELECT TO authenticated
  USING (business_id IN (
    SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. wa_process_merchant_payment_event — se agrega p_paid_at y, dentro
--    del mismo bloque 'approved' (mismo gate de stock_applied_at, misma
--    transacción), se escribe wa_order_payments. DROP + CREATE porque
--    cambia la firma -- mismo patrón que 20260910160000 (que a su vez
--    siguió el patrón de 20260810100000_referral_paid_periods_
--    consecutive_streaks.sql) para evitar overloads en PostgREST.
--
--    p_paid_at es REQUERIDO (sin DEFAULT), mismo criterio que
--    p_walinka_fee en 20260910160000: el llamador (merchant-mp-webhook)
--    siempre debe resolverlo explícitamente antes de invocar la RPC.
--
--    El INSERT en wa_order_payments usa ON CONFLICT ... DO NOTHING sobre
--    el mismo índice parcial (provider, provider_payment_id) como
--    defensa en profundidad adicional (más allá del gate de
--    stock_applied_at ya existente) contra la carrera teórica de dos
--    notificaciones concurrentes para un mp_payment_id NUEVO que aún no
--    tiene fila en wa_merchant_payment_events (ver justificación
--    completa en el reporte de esta fase) -- no modifica ni debilita el
--    gate de stock_applied_at existente, que sigue intacto.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.wa_process_merchant_payment_event(
  UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, NUMERIC
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
  p_walinka_fee        NUMERIC,
  p_paid_at            TIMESTAMPTZ
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
     OR p_walinka_fee IS NULL OR p_paid_at IS NULL
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
    -- tocar wa_orders, stock, la comisión ni el registro normalizado
    -- de pago ya persistidos.
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

    -- MP-PAYMENT-DETAIL-1: registrar la vista normalizada del pago.
    -- ON CONFLICT DO NOTHING adicional (defensa en profundidad, ver
    -- comentario de cabecera) -- el gate de stock_applied_at de arriba
    -- ya es la protección principal contra reintentos.
    INSERT INTO public.wa_order_payments (
      business_id, order_id, provider, method, provider_payment_id,
      status, gross_amount, currency, walinka_fee, mp_fee, net_amount,
      payer_name, payer_email, paid_at, registered_by, notes
    ) VALUES (
      p_business_id, p_order_id, 'mercado_pago', 'checkout_pro', p_mp_payment_id,
      'confirmed', p_amount, p_currency, p_walinka_fee, NULL, NULL,
      NULL, NULL, p_paid_at, NULL, NULL
    )
    ON CONFLICT (provider, provider_payment_id) WHERE provider_payment_id IS NOT NULL DO NOTHING;

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
  -- wa_orders, stock y wa_order_payments permanecen sin cambios a
  -- propósito.
  END IF;

  RETURN QUERY SELECT v_applied_now, false,
    (SELECT payment_status FROM public.wa_orders WHERE id = p_order_id);
END;
$$;

REVOKE ALL ON FUNCTION public.wa_process_merchant_payment_event(
  UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, NUMERIC, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;

-- Endurecido explícitamente (MP-PAYMENT-DETAIL-1 pre-commit security
-- check): el DROP + CREATE de arriba crea un objeto de función NUEVO, que
-- en PostgreSQL parte con EXECUTE otorgado a PUBLIC por defecto hasta que
-- el REVOKE de arriba corre -- ambas sentencias viven en la misma
-- transacción implícita de esta migración, así que no hay ventana real
-- donde PUBLIC tenga acceso. El acceso de service_role para esta función
-- YA existía de forma implícita (privilegio por defecto que Supabase
-- otorga a service_role sobre funciones nuevas del schema public --
-- mismo mecanismo documentado en 20260907120000_mp_oauth_connect.sql
-- para wa_mp_connection_encryption_key()); se hace explícito acá para no
-- depender de ese default de plataforma.
GRANT EXECUTE ON FUNCTION public.wa_process_merchant_payment_event(
  UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, NUMERIC, TIMESTAMPTZ
) TO service_role;

COMMENT ON FUNCTION public.wa_process_merchant_payment_event(
  UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, NUMERIC, TIMESTAMPTZ
) IS
  'service_role-only. Transición atómica de un pago del checkout de comercio: idempotente por mp_payment_id (UNIQUE + SELECT...FOR UPDATE), aplica payment_status=''pagado'' + crm_stock_movements + wa_order_payments EXACTAMENTE UNA VEZ por payment_id cuando mp_status=''approved'' (gate: stock_applied_at). rejected/cancelled marcan ''anulado'' solo si el pedido seguía ''pendiente'' -- nunca revierte un pedido ya ''pagado''. Valida amount/currency contra wa_orders como defensa en profundidad. MP-PAYMENT-DETAIL-1: persiste p_paid_at (REQUERIDO, sin DEFAULT) tal cual lo resolvió el llamador (payment.date_approved de MP o fallback documentado), y crea la fila normalizada en wa_order_payments (provider=mercado_pago, method=checkout_pro) con ON CONFLICT DO NOTHING como defensa adicional. El frontend NUNCA debe poder invocar esta función directamente -- ni siquiera autenticado.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. wa_register_manual_order_payment — registro de pagos manuales
--    (efectivo/transferencia/otro) por el dueño del negocio.
--
--    Reglas explícitas de validación de monto/moneda (documentadas acá
--    porque el enunciado de esta fase pide definirlas explícitamente):
--      - p_amount debe ser EXACTAMENTE igual a wa_orders.total_amount
--        del pedido (NUMERIC, comparación exacta sin drift -- a
--        diferencia del cálculo en JS de create-merchant-mp-checkout,
--        NUMERIC de Postgres no tiene drift de punto flotante). No se
--        soportan pagos parciales en esta fase -- wa_orders.payment_status
--        es un enum de 2 estados útiles (pendiente/pagado), no hay
--        concepto de "parcialmente pagado" todavía; introducirlo es una
--        decisión de producto fuera de alcance de MP-PAYMENT-DETAIL-1.
--      - p_currency debe coincidir con wa_orders.currency del pedido.
--      - Un pedido ya 'pagado' rechaza un segundo registro manual
--        (ORDER_ALREADY_PAID) -- evita duplicar el pago por doble click
--        o reintento accidental desde la UI (a implementarse en
--        MP-PAYMENT-DETAIL-2).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_register_manual_order_payment(
  p_order_id UUID,
  p_method   TEXT,
  p_amount   NUMERIC,
  p_currency TEXT,
  p_notes    TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    UUID := auth.uid();
  v_order      RECORD;
  v_payment_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;

  IF p_order_id IS NULL OR p_method IS NULL OR p_amount IS NULL OR p_currency IS NULL THEN
    RAISE EXCEPTION 'MISSING_REQUIRED_PARAMETER' USING ERRCODE = 'P0001';
  END IF;

  -- Solo métodos manuales -- mercado_pago/checkout_pro/point/qr son
  -- EXCLUSIVOS del flujo automático (wa_process_merchant_payment_event).
  -- No es un chequeo redundante con el CHECK de la tabla: rechazar acá,
  -- ANTES del INSERT, da un código de error explícito y estable
  -- (INVALID_PAYMENT_METHOD) en vez de depender del texto interno de una
  -- violación de constraint.
  IF p_method NOT IN ('cash', 'bank_transfer', 'other') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_METHOD' USING ERRCODE = 'P0001';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = 'P0001';
  END IF;

  -- Ownership derivado EXCLUSIVAMENTE server-side (auth.uid() -> el
  -- pedido debe pertenecer a un wa_businesses de ese usuario) -- nunca
  -- se confía en un business_id de parámetro (esta función no lo
  -- recibe en absoluto).
  SELECT o.id, o.business_id, o.payment_status, o.total_amount, o.currency
    INTO v_order
    FROM public.wa_orders o
    JOIN public.wa_businesses b ON b.id = o.business_id
   WHERE o.id = p_order_id
     AND b.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND_OR_NOT_OWNED' USING ERRCODE = 'P0001';
  END IF;

  IF v_order.payment_status = 'pagado' THEN
    RAISE EXCEPTION 'ORDER_ALREADY_PAID' USING ERRCODE = 'P0001';
  END IF;

  IF p_amount <> v_order.total_amount THEN
    RAISE EXCEPTION 'AMOUNT_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  IF p_currency <> v_order.currency THEN
    RAISE EXCEPTION 'CURRENCY_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.wa_order_payments (
    business_id, order_id, provider, method, provider_payment_id,
    status, gross_amount, currency, walinka_fee, mp_fee, net_amount,
    payer_name, payer_email, paid_at, registered_by, notes
  ) VALUES (
    v_order.business_id, p_order_id, 'manual', p_method, NULL,
    'confirmed', p_amount, p_currency, 0, NULL, NULL,
    NULL, NULL, now(), v_user_id, NULLIF(btrim(COALESCE(p_notes, '')), '')
  )
  RETURNING id INTO v_payment_id;

  UPDATE public.wa_orders
     SET payment_status = 'pagado',
         paid_at         = now()
   WHERE id = p_order_id;

  RETURN v_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.wa_register_manual_order_payment(UUID, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_register_manual_order_payment(UUID, TEXT, NUMERIC, TEXT, TEXT) TO authenticated;
-- Endurecido explícitamente (mismo criterio que arriba): service_role
-- también puede invocarla (uso interno/soporte), sin depender del
-- default de plataforma. auth.uid() sigue siendo NULL para una llamada
-- de service_role sin JWT de usuario -- el guard NOT_AUTHENTICATED de la
-- función la protege igual, este GRANT no abre ningún camino nuevo para
-- un cliente autenticado como otro usuario.
GRANT EXECUTE ON FUNCTION public.wa_register_manual_order_payment(UUID, TEXT, NUMERIC, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.wa_register_manual_order_payment(UUID, TEXT, NUMERIC, TEXT, TEXT) IS
  'authenticated-only (dueño del negocio, ownership derivado de auth.uid() -> wa_businesses.user_id -> el pedido, nunca de un business_id de parámetro). Registra un pago manual (cash|bank_transfer|other, nunca mercado_pago/checkout_pro/point/qr -- INVALID_PAYMENT_METHOD si se intenta) con walinka_fee=0 (constraint + valor explícito), exige monto/moneda EXACTAMENTE iguales a wa_orders.total_amount/currency (AMOUNT_MISMATCH/CURRENCY_MISMATCH), y rechaza un segundo registro sobre un pedido ya pagado (ORDER_ALREADY_PAID). Inserta wa_order_payments y actualiza wa_orders.payment_status=''pagado''+paid_at en la misma transacción -- nunca dos pasos separados desde el cliente.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. BACKFILL — pagos Mercado Pago ya confirmados en
--    wa_merchant_payment_events, incluida la primera transacción real
--    de prueba.
--
--    Solo eventos con stock_applied_at IS NOT NULL (= realmente
--    aplicados: status fue 'approved' y wa_process_merchant_payment_event
--    ya corrió su bloque de side-effects una vez) -- nunca eventos
--    pending/rejected/cancelled/etc, que no representan un pago
--    confirmado.
--
--    method='checkout_pro' para TODAS las filas backfilled: evidencia
--    estructural, no una suposición. external_reference tiene el
--    formato walinka:merchant:<business_id>:<order_id>
--    (parseExternalReference en merchant-mp-webhook/lib.ts), producido
--    EXCLUSIVAMENTE por create-merchant-mp-checkout (único punto del
--    código que construye ese external_reference -- ver
--    buildExternalReference en create-merchant-mp-checkout/lib.ts).
--    wa_merchant_payment_events.mp_payment_id solo se escribe desde
--    wa_process_merchant_payment_event, invocada EXCLUSIVAMENTE desde
--    merchant-mp-webhook, cuyo único origen de order_id es un pedido
--    creado por wa_create_merchant_checkout_order (también exclusiva de
--    create-merchant-mp-checkout). No existe HOY ningún otro código que
--    pueda haber insertado una fila en wa_merchant_payment_events --
--    Point/QR no están implementados todavía (MP-PAYMENT-DETAIL-1 no
--    los introduce). Por lo tanto, TODA fila existente en esta tabla a
--    la fecha de esta migración es, con certeza estructural, un pago de
--    Checkout Pro.
--
--    paid_at = stock_applied_at (el momento real, registrado, en que
--    este mismo sistema confirmó y aplicó el pago) -- NO es
--    payment.date_approved de Mercado Pago (esa fecha nunca se capturó
--    para eventos históricos, no existe forma de recuperarla
--    retroactivamente sin volver a consultar la API de MP, fuera de
--    alcance de una migración). Se documenta explícitamente como proxy,
--    nunca se inventa.
--
--    payer_name/payer_email/mp_fee/net_amount: NUNCA inventados, quedan
--    NULL (la tabla los permite NULL exactamente para este caso).
--
--    Idempotente: ON CONFLICT (provider, provider_payment_id) DO NOTHING
--    sobre el mismo índice parcial -- correr esta migración dos veces
--    (o re-ejecutar el backfill manualmente) nunca duplica filas.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.wa_order_payments (
  business_id, order_id, provider, method, provider_payment_id,
  status, gross_amount, currency, walinka_fee, mp_fee, net_amount,
  payer_name, payer_email, paid_at, registered_by, notes
)
SELECT
  e.business_id,
  e.order_id,
  'mercado_pago',
  'checkout_pro',
  e.mp_payment_id,
  'confirmed',
  e.amount,
  e.currency,
  e.walinka_fee,
  NULL,
  NULL,
  NULL,
  NULL,
  e.stock_applied_at,
  NULL,
  'Backfill MP-PAYMENT-DETAIL-1 desde wa_merchant_payment_events (paid_at = stock_applied_at, ver comentario de cabecera de esta sección)'
FROM public.wa_merchant_payment_events e
WHERE e.stock_applied_at IS NOT NULL
ON CONFLICT (provider, provider_payment_id) WHERE provider_payment_id IS NOT NULL DO NOTHING;

NOTIFY pgrst, 'reload schema';
