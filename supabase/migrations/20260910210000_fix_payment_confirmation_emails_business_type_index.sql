-- ============================================================
-- EMAIL-PAYMENTS-2B — fix de índices legacy de email_queue que
-- rompían wa_enqueue_payment_confirmation_emails (RPC corregida en
-- 20260910200000, YA APLICADA -- NO se toca acá).
--
-- AUDITORÍA (antes de escribir este archivo):
--
-- A) Origen histórico de la protección "un email por negocio":
--    20260405000000_email_queue_activation24h.sql crea
--    idx_email_queue_business_type UNIQUE(business_id, type), usado por
--    wa_schedule_activation_24h_email() (INSERT ... ON CONFLICT
--    (business_id, type) DO NOTHING, type='activation_24h').
--    20260424000000_welcome_queue_and_admin_alerts.sql agrega
--    wa_queue_welcome_email() con el MISMO patrón (type='welcome'),
--    reutilizando el mismo índice -- nunca crea uno propio.
--
-- B) Semántica legacy protegida: "como máximo UN email de tipo X por
--    NEGOCIO" -- correcto para welcome/activation_24h (ocurren una vez
--    por negocio) y, según la evidencia empírica de producción, también
--    para news/new_order/onboarding_tip_* (mismo criterio histórico).
--    Los duplicados (business_id,type) que SÍ existen hoy en producción
--    (news:57, new_order:2, type NULL:2) ocurren EXCLUSIVAMENTE con
--    business_id IS NULL -- esperado: NULL nunca es igual a NULL para
--    una restricción UNIQUE en Postgres, así que esas filas nunca
--    estuvieron protegidas por este índice de todos modos, con o sin
--    este fix. No hace falta (ni conviene) agregar business_id IS NOT
--    NULL al predicado nuevo: no cambiaría ningún comportamiento real,
--    solo agregaría una condición redundante.
--
-- C) Estado ACTUAL (no histórico) de ambas funciones: DESHABILITADAS.
--    20260510000000_disable_internal_email_automation.sql (aplicada
--    antes que 180000/200000/este archivo) hace DROP de AMBOS triggers
--    (trigger_queue_welcome_email, trigger_schedule_activation_24h_email)
--    Y reemplaza AMBAS funciones con un no-op (RAISE LOG; RETURN NEW;
--    -- sin ningún INSERT INTO email_queue). Verificado leyendo el
--    archivo completo antes de escribir este fix: hoy NINGÚN código
--    activo en este repo ejecuta
--    "INSERT INTO email_queue ... ON CONFLICT (business_id, type)".
--    Por eso este archivo NO necesita tocar wa_queue_welcome_email ni
--    wa_schedule_activation_24h_email -- no hay ningún INSERT activo
--    cuyo ON CONFLICT deba actualizarse para seguir siendo inferible
--    contra el índice parcial nuevo (ver "RIESGO A FUTURO" más abajo).
--
-- D) process-email-queue: no hace ningún INSERT INTO email_queue (solo
--    SELECT vía wa_claim_email_queue_batch y UPDATE por id en
--    markSent/markFailed) -- no le afecta ningún índice de esta tabla.
--
-- ── BUG #1: ON CONFLICT (event_key) DO NOTHING no es inferible ────────
-- El índice REAL de producción es
--   CREATE UNIQUE INDEX idx_email_queue_event_key
--   ON public.email_queue (event_key) WHERE event_key IS NOT NULL;
-- (parcial -- igual que en 20260910180000, sin drift de nombre en este
-- caso). Postgres NO infiere un índice parcial a partir de un
-- conflict_target sin WHERE -- error 42P10 "there is no unique or
-- exclusion constraint matching the ON CONFLICT specification". El fix
-- de 200000 seguía usando "ON CONFLICT (event_key) DO NOTHING" sin el
-- WHERE, así que en producción real (con el índice parcial, no uno
-- full como asumía el código) el INSERT sigue fallando -- ahora con un
-- error de sintaxis/inferencia distinto al de NOT NULL, pero mismo
-- resultado: cero filas. Este archivo corrige a
--   ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING
-- -- WHERE textualmente idéntico al predicado del índice, inferencia
-- garantizada. event_key SIEMPRE es NOT NULL en el valor insertado acá
-- (se construye como 'payment-confirmed:'||...), así que el predicado
-- es trivialmente cierto para estas filas -- no cambia ningún
-- comportamiento, solo hace la inferencia explícita.
--
-- ── BUG #2: email_queue_business_type_unique bloquea la 2da venta ─────
-- El índice REAL de producción se llama email_queue_business_type_unique
-- (drift de NOMBRE respecto al idx_email_queue_business_type que crea
-- 20260405000000 -- mismas columnas (business_id, type), mismo
-- comportamiento, nombre distinto; aplicado fuera de tracking en algún
-- punto, igual que el resto del drift ya documentado en 200000). Es NO
-- parcial (sin WHERE) -- se aplica a TODAS las filas, incluidas
-- payment_received_buyer/payment_received_merchant. Un mismo negocio
-- con una segunda venta pagada intenta insertar una segunda fila
-- (business_id, 'payment_received_buyer') -- distinto event_key, pero
-- MISMO (business_id, type) que la primera venta. ON CONFLICT
-- (event_key) ... solo absorbe conflictos contra ESE índice: un
-- conflicto contra un índice UNIQUE *distinto* (business_type) no
-- queda cubierto por ese arbiter y el INSERT completo falla con 23505.
-- Los pagos son repetibles por diseño (N pedidos pagados por negocio),
-- así que este índice, tal como está, es incompatible con
-- payment_received_buyer/merchant.
--
-- FIX: excluir ÚNICAMENTE los dos tipos transaccionales del predicado
-- del índice -- la protección "un email por negocio" para
-- welcome/activation_24h/news/new_order/onboarding_tip_*/cualquier tipo
-- legacy futuro queda EXACTAMENTE igual que hoy. La unicidad real de
-- los emails de pago ya está garantizada por event_key
-- ('payment-confirmed:<order_id>:buyer'/':merchant', UNIQUE parcial,
-- fix del Bug #1 de arriba) -- no hace falta que business_type también
-- la cubra para estos dos tipos.
--
-- RIESGO A FUTURO (documentado, sin acción en este archivo): si algún
-- día se reactiva EMAIL_AUTOMATION_ENABLED restaurando los triggers/
-- funciones originales de welcome/activation_24h con su
-- "ON CONFLICT (business_id, type) DO NOTHING" sin WHERE, ESE INSERT
-- dejará de ser inferible contra el índice parcial de este archivo
-- (mismo error 42P10 que el Bug #1) -- quien reactive esa
-- automatización deberá agregar el mismo WHERE type NOT IN (...) a su
-- ON CONFLICT, o usar ON CONFLICT ON CONSTRAINT tras convertir el
-- índice en una constraint real. No se anticipa acá porque hoy ese
-- código no existe en ninguna función activa (ver punto C).
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. email_queue_business_type_unique -- recrear como parcial
-- ─────────────────────────────────────────────────────────────────────────────
-- Se hace DROP de AMBOS nombres posibles (el real de producción y el
-- que el propio historial de migraciones de este repo generaría en un
-- entorno sin el drift) para que este fix sea idempotente y correcto
-- tanto en producción como en cualquier otro entorno que haya aplicado
-- las migraciones tal cual están trackeadas.

DROP INDEX IF EXISTS public.email_queue_business_type_unique;
DROP INDEX IF EXISTS public.idx_email_queue_business_type;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_queue_business_type
  ON public.email_queue (business_id, type)
  WHERE type NOT IN ('payment_received_buyer', 'payment_received_merchant');

COMMENT ON INDEX public.idx_email_queue_business_type IS
  'Un email de tipo X por negocio -- welcome/activation_24h/news/'
  'new_order/onboarding_tip_*/legacy futuro. EXCLUYE '
  'payment_received_buyer/merchant a propósito (EMAIL-PAYMENTS-2B): '
  'esos son repetibles por negocio (uno por pedido pagado) y su '
  'unicidad real la garantiza event_key, no este índice.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. wa_enqueue_payment_confirmation_emails -- ON CONFLICT (event_key)
--    ahora declara el WHERE del índice parcial real de producción.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_enqueue_payment_confirmation_emails(
  p_order_id UUID
)
RETURNS TABLE (buyer_enqueued BOOLEAN, merchant_enqueued BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id       UUID;
  v_customer_email    TEXT;
  v_business_email    TEXT;
  v_owner_user_id     UUID;
  v_merchant_email    TEXT;
  v_buyer_key         TEXT;
  v_merchant_key      TEXT;
  v_buyer_enqueued    BOOLEAN := false;
  v_merchant_enqueued BOOLEAN := false;
  v_row_count         INTEGER;
BEGIN
  IF p_order_id IS NULL THEN
    RETURN QUERY SELECT false, false;
    RETURN;
  END IF;

  SELECT o.business_id, NULLIF(trim(o.customer_email), '')
    INTO v_business_id, v_customer_email
  FROM public.wa_orders o
  WHERE o.id = p_order_id;

  IF v_business_id IS NULL THEN
    RAISE WARNING 'wa_enqueue_payment_confirmation_emails: order % no existe, nada que encolar', p_order_id;
    RETURN QUERY SELECT false, false;
    RETURN;
  END IF;

  v_buyer_key    := 'payment-confirmed:' || p_order_id::text || ':buyer';
  v_merchant_key := 'payment-confirmed:' || p_order_id::text || ':merchant';

  -- Comprador: SOLO si hay un email válido en el pedido. Nunca se inventa
  -- ni se intenta resolver de otra fuente -- si no hay customer_email, no
  -- hay a quién escribirle, y eso no es un error.
  IF v_customer_email IS NOT NULL AND v_customer_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    INSERT INTO public.email_queue (
      business_id, type, event_key, next_attempt_at, status,
      to_email, template, payload
    )
    VALUES (
      v_business_id, 'payment_received_buyer', v_buyer_key, now(), 'pending',
      v_customer_email, 'payment_received_buyer', jsonb_build_object('order_id', p_order_id)
    )
    ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_buyer_enqueued := (v_row_count > 0);
  END IF;

  -- Comercio: se resuelve el email ACÁ (mismo criterio de fallback que ya
  -- usa wa_queue_welcome_email: wa_businesses.email primero, luego el
  -- owner en auth.users) porque to_email es NOT NULL sin default en el
  -- schema real de producción -- ya no se puede insertar "a ciegas" como
  -- antes de EMAIL-PAYMENTS-2A. process-email-queue sigue resolviendo el
  -- email de nuevo, en fresco, al momento de enviar -- esta resolución
  -- acá NO lo reemplaza, solo permite que la fila llegue a existir.
  SELECT NULLIF(trim(b.email), ''), b.user_id
    INTO v_business_email, v_owner_user_id
  FROM public.wa_businesses b
  WHERE b.id = v_business_id;

  v_merchant_email := v_business_email;
  IF v_merchant_email IS NULL AND v_owner_user_id IS NOT NULL THEN
    SELECT NULLIF(trim(email), '') INTO v_merchant_email
    FROM auth.users
    WHERE id = v_owner_user_id;
  END IF;

  IF v_merchant_email IS NOT NULL THEN
    INSERT INTO public.email_queue (
      business_id, type, event_key, next_attempt_at, status,
      to_email, template, payload
    )
    VALUES (
      v_business_id, 'payment_received_merchant', v_merchant_key, now(), 'pending',
      v_merchant_email, 'payment_received_merchant', jsonb_build_object('order_id', p_order_id)
    )
    ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_merchant_enqueued := (v_row_count > 0);
  ELSE
    RAISE WARNING 'wa_enqueue_payment_confirmation_emails: sin email de comercio resoluble para business % (order %), no se encola payment_received_merchant', v_business_id, p_order_id;
  END IF;

  RETURN QUERY SELECT v_buyer_enqueued, v_merchant_enqueued;
END;
$$;

COMMENT ON FUNCTION public.wa_enqueue_payment_confirmation_emails(UUID) IS
  'EMAIL-PAYMENTS-2B: ON CONFLICT (event_key) ahora declara WHERE '
  'event_key IS NOT NULL, igual que el índice parcial real de '
  'producción (idx_email_queue_event_key) -- sin este WHERE, Postgres '
  'no puede inferir un índice parcial y el INSERT falla con 42P10. '
  'email_queue_business_type_unique/idx_email_queue_business_type ahora '
  'excluye payment_received_buyer/merchant de su predicado (ver '
  '20260910210000_fix_payment_confirmation_emails_business_type_index.sql) '
  '-- un mismo negocio puede tener múltiples pedidos pagados sin violar '
  'esa unicidad; la unicidad real de cada email de pago la garantiza '
  'event_key. Resto sin cambios respecto a EMAIL-PAYMENTS-2A: encola '
  'payment_received_buyer (si hay customer_email válido) y '
  'payment_received_merchant (si se resuelve un email de comercio -- '
  'wa_businesses.email o el owner en auth.users). '
  'process-email-queue relee todo fresco al enviar.';

REVOKE ALL ON FUNCTION public.wa_enqueue_payment_confirmation_emails(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_enqueue_payment_confirmation_emails(UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
