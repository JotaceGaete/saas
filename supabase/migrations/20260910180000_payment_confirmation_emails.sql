-- ============================================================
-- EMAIL-PAYMENTS-1 — infraestructura de emails transaccionales de pago
-- (payment_received_buyer / payment_received_merchant), reutilizando
-- email_queue + process-email-queue + send-email (Supabase, Deno).
-- Vercel no participa en ningún punto de este flujo.
--
-- Productor: merchant-mp-webhook, vía wa_enqueue_payment_confirmation_emails.
-- Consumidor: process-email-queue, vía wa_claim_email_queue_batch
--             (claim atómico -- reemplaza el SELECT sin lock anterior).
--
-- NO se toca crm_payments, wa_payments, billing_subscriptions,
-- mp_connections, create-merchant-mp-checkout ni marketplace_fee.
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. email_queue: columnas nuevas + índice de idempotencia por evento
-- ─────────────────────────────────────────────────────────────────────────────
--
-- No se reutiliza UNIQUE(business_id, type) para pagos -- ese índice modela
-- "un email de tipo X por NEGOCIO" (correcto para welcome/activation_24h,
-- que ocurren una vez por negocio). Un negocio tiene muchos pedidos
-- pagados, así que hace falta una clave de idempotencia por EVENTO, no por
-- negocio. event_key es nullable para no romper ni tocar las filas
-- históricas (welcome/activation_24h), que siguen sin event_key.

ALTER TABLE public.email_queue
  ADD COLUMN IF NOT EXISTS event_key  TEXT NULL,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.email_queue.event_key IS
  'Clave de idempotencia por evento (no por negocio). Formato: '
  '"payment-confirmed:<order_id>:buyer" / "...:merchant". NULL para filas '
  'legacy (welcome/activation_24h), que ya usan UNIQUE(business_id, type).';
COMMENT ON COLUMN public.email_queue.claimed_at IS
  'Timestamp de claim por wa_claim_email_queue_batch. Una fila en '
  '''processing'' con claimed_at más viejo que el umbral de staleness '
  'vuelve a quedar disponible para reclamo (worker caído a mitad de proceso).';

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_queue_event_key
  ON public.email_queue (event_key)
  WHERE event_key IS NOT NULL;

-- Ampliar el estado permitido: 'processing' es el estado transitorio entre
-- el claim atómico y el resultado final (sent/failed). El CHECK original
-- (pending|sent|failed) se declaró inline sin nombre explícito en
-- 20260405000000_email_queue_activation24h.sql, así que Postgres le puso
-- el nombre por defecto email_queue_status_check.
ALTER TABLE public.email_queue DROP CONSTRAINT IF EXISTS email_queue_status_check;
ALTER TABLE public.email_queue
  ADD CONSTRAINT email_queue_status_check
  CHECK (status IN ('pending', 'processing', 'sent', 'failed'));

CREATE INDEX IF NOT EXISTS idx_email_queue_processing_claimed_at
  ON public.email_queue (claimed_at)
  WHERE status = 'processing';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. wa_claim_email_queue_batch — claim atómico contra ejecución concurrente
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Reemplaza el SELECT sin lock que usaba process-email-queue (Deno) hasta
-- ahora. Usa FOR UPDATE SKIP LOCKED dentro de una función SECURITY DEFINER
-- -- el cliente supabase-js no puede emitir ese SQL directo, así que el
-- lock vive acá. Dos workers ejecutando esta función al mismo tiempo nunca
-- reciben la misma fila: SKIP LOCKED hace que el segundo worker simplemente
-- salte cualquier fila que el primero ya esté reteniendo.
--
-- Reclama tres categorías de FILAS por elegibilidad de tiempo/estado:
--   a) pending, listas (next_attempt_at <= now() o NULL)
--   b) failed pero reintentable (next_attempt_at <= now(), retry_count < 3)
--   c) processing "atascadas" -- un worker anterior murió a mitad de proceso
--      sin llegar a marcar sent/failed. p_stale_minutes define cuánto
--      tiempo debe pasar antes de considerarla abandonada y reclamarla.
--
-- Además filtra por CATEGORÍA de negocio (EMAIL-PAYMENTS-1, separación de
-- flags): p_include_payment_types / p_include_legacy_types deciden si se
-- reclaman filas payment_received_buyer/merchant y/o welcome/activation_24h
-- (todo lo que no sea de pago). Por defecto ambas true (reclama todo,
-- mismo comportamiento que antes de este parámetro) -- el caller
-- (process-email-queue) los fija según EMAIL_AUTOMATION_ENABLED /
-- PAYMENT_EMAILS_ENABLED, así que una fila de una categoría deshabilitada
-- nunca llega siquiera a reclamarse (no hay que "liberarla" después: más
-- simple y más barato que reclamar y revertir).

CREATE OR REPLACE FUNCTION public.wa_claim_email_queue_batch(
  p_batch_size             INTEGER DEFAULT 20,
  p_stale_minutes          INTEGER DEFAULT 5,
  p_include_payment_types  BOOLEAN DEFAULT true,
  p_include_legacy_types   BOOLEAN DEFAULT true
)
RETURNS SETOF public.email_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_batch_size IS NULL OR p_batch_size < 1 THEN
    p_batch_size := 20;
  END IF;
  IF p_batch_size > 100 THEN
    p_batch_size := 100;
  END IF;
  IF p_stale_minutes IS NULL OR p_stale_minutes < 1 THEN
    p_stale_minutes := 5;
  END IF;
  IF p_include_payment_types IS NULL THEN
    p_include_payment_types := true;
  END IF;
  IF p_include_legacy_types IS NULL THEN
    p_include_legacy_types := true;
  END IF;

  RETURN QUERY
  UPDATE public.email_queue eq
  SET status = 'processing', claimed_at = now()
  WHERE eq.id IN (
    SELECT candidate.id
    FROM public.email_queue candidate
    WHERE
      (
        (
          candidate.type IN ('payment_received_buyer', 'payment_received_merchant')
          AND p_include_payment_types
        )
        OR (
          candidate.type NOT IN ('payment_received_buyer', 'payment_received_merchant')
          AND p_include_legacy_types
        )
      )
      AND (
        (
          candidate.status = 'pending'
          AND (candidate.next_attempt_at IS NULL OR candidate.next_attempt_at <= now())
        )
        OR (
          candidate.status = 'failed'
          AND candidate.retry_count < 3
          AND candidate.next_attempt_at IS NOT NULL
          AND candidate.next_attempt_at <= now()
        )
        OR (
          candidate.status = 'processing'
          AND candidate.claimed_at IS NOT NULL
          AND candidate.claimed_at < now() - make_interval(mins => p_stale_minutes)
        )
      )
    ORDER BY candidate.created_at ASC
    LIMIT p_batch_size
    FOR UPDATE OF candidate SKIP LOCKED
  )
  RETURNING eq.*;
END;
$$;

COMMENT ON FUNCTION public.wa_claim_email_queue_batch(INTEGER, INTEGER, BOOLEAN, BOOLEAN) IS
  'Claim atómico de un lote de email_queue (FOR UPDATE SKIP LOCKED). '
  'Solo service_role -- process-email-queue es el único caller. '
  'Reclama pending listos, failed reintentables y processing abandonados '
  'hace más de p_stale_minutes, filtrado por categoría '
  '(p_include_payment_types / p_include_legacy_types) según qué flags '
  'de automatización estén activos.';

REVOKE ALL ON FUNCTION public.wa_claim_email_queue_batch(INTEGER, INTEGER, BOOLEAN, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_claim_email_queue_batch(INTEGER, INTEGER, BOOLEAN, BOOLEAN) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. wa_enqueue_payment_confirmation_emails — productor, llamado por
--    merchant-mp-webhook tras confirmar un pago (applied_now = true)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Toda la data de decisión (existe email del comprador, existe email del
-- negocio) se lee FRESCA acá, server-side -- nunca se recibe como
-- parámetro desde el webhook, que solo pasa el order_id. Esto es
-- deliberado: el webhook no debe ser la fuente de verdad de nada más allá
-- de "confirmar que hay que intentar encolar para este pedido".
--
-- Idempotencia: event_key = 'payment-confirmed:<order_id>:buyer'/':merchant'
-- + ON CONFLICT (event_key) DO NOTHING. Un reintento del webhook de MP que
-- vuelva a llamar esta función (no debería, el caller la gatea con
-- applied_now, pero esta función es idempotente igual, en profundidad)
-- nunca crea una segunda fila para el mismo pedido.
--
-- payload solo guarda order_id -- process-email-queue relee
-- wa_orders/wa_order_items/wa_order_payments/wa_businesses en el momento
-- de procesar la fila, nunca confía en un snapshot tomado acá.

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
    INSERT INTO public.email_queue (business_id, type, event_key, next_attempt_at, status)
    VALUES (v_business_id, 'payment_received_buyer', v_buyer_key, now(), 'pending')
    ON CONFLICT (event_key) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_buyer_enqueued := (v_row_count > 0);
  END IF;

  -- Comercio: siempre se intenta encolar (el pedido siempre pertenece a un
  -- negocio). Si ni wa_businesses.email ni el email del owner en
  -- auth.users existen, process-email-queue lo detecta al procesar la fila
  -- y la marca failed sin reintento -- nunca bloquea ni revierte el pago,
  -- que ya quedó confirmado antes de que este RPC se llame.
  INSERT INTO public.email_queue (business_id, type, event_key, next_attempt_at, status)
  VALUES (v_business_id, 'payment_received_merchant', v_merchant_key, now(), 'pending')
  ON CONFLICT (event_key) DO NOTHING;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_merchant_enqueued := (v_row_count > 0);

  RETURN QUERY SELECT v_buyer_enqueued, v_merchant_enqueued;
END;
$$;

COMMENT ON FUNCTION public.wa_enqueue_payment_confirmation_emails(UUID) IS
  'Encola payment_received_buyer (si hay customer_email válido) y '
  'payment_received_merchant (siempre) para un pedido ya confirmado. '
  'Idempotente vía event_key. Nunca falla de forma que bloquee al caller '
  '-- errores de datos (pedido inexistente) solo devuelven false/false.';

REVOKE ALL ON FUNCTION public.wa_enqueue_payment_confirmation_emails(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_enqueue_payment_confirmation_emails(UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
