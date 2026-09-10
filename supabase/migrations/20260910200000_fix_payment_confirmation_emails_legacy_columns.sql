-- ============================================================
-- EMAIL-PAYMENTS-2A — fix de compatibilidad legacy de email_queue para
-- wa_enqueue_payment_confirmation_emails.
--
-- BUG CONFIRMADO EMPÍRICAMENTE EN PRODUCCIÓN (pedido
-- afe02713-5437-40f2-8082-6ab3afb4d769, pagado 2026-09-10 19:13:27 UTC,
-- customer_email=artesellos@outlook.com, payment_status=pagado): el
-- INSERT de 20260910180000_payment_confirmation_emails.sql (YA APLICADA
-- en producción, NO se modifica acá -- ver política de migraciones)
-- solo especifica (business_id, type, event_key, next_attempt_at, status).
--
-- El schema REAL de public.email_queue en producción (verificado
-- empíricamente vía la evidencia de este pedido -- NO coincide con lo
-- que sugiere el historial de migraciones de este repo; hay drift de
-- schema aplicado fuera de tracking, probablemente vía dashboard/SQL
-- manual en algún punto) exige, además:
--   to_email  TEXT  NOT NULL  (sin default)
--   template  TEXT  NOT NULL  (sin default)
--   payload   JSONB NOT NULL  DEFAULT '{}'::jsonb
--
-- Como to_email/template no tienen default, CUALQUIER INSERT que no los
-- incluya viola NOT NULL y el INSERT completo falla -- exactamente lo
-- observado: cero filas en email_queue pese a un pago confirmado.
--
-- Ese fallo SÍ quedaba logueado (merchant-mp-webhook ya envuelve la
-- llamada a esta RPC en try/catch + console.error con orderId, sección
-- "8. Encolar emails de confirmación de pago" de
-- supabase/functions/merchant-mp-webhook/index.ts -- SIN cambios en este
-- fix, ya es correcto y suficiente para diagnóstico). El problema no era
-- falta de logging: era que el INSERT nunca llegaba a crear la fila.
--
-- SEGUNDO BUG, enmascarado por el primero: el INSERT original tampoco
-- seteaba `payload`. Aunque el NOT NULL de to_email/template no
-- existiera, process-email-queue habría fallado igual con "Missing
-- order_id in payload" (processPaymentRow relee row.payload?.order_id --
-- ver supabase/functions/process-email-queue/index.ts -- y el default
-- '{}'::jsonb no contiene order_id). Este fix agrega también
-- payload = jsonb_build_object('order_id', p_order_id).
--
-- QUÉ NO CAMBIA (arquitectura de seguridad preservada, verificada leyendo
-- process-email-queue/index.ts y send-email/index.ts antes de este fix):
--   - process-email-queue SIGUE releyendo wa_orders/wa_order_items/
--     wa_order_payments/wa_businesses FRESCO en el momento de enviar --
--     processPaymentRow no lee row.to_email ni row.template en ningún
--     punto. to_email/template acá son SOLO para satisfacer el schema
--     legado + visibilidad de diagnóstico (SELECT to_email FROM
--     email_queue), igual que ya hace welcome/activation_24h desde
--     20260424000000_welcome_queue_and_admin_alerts.sql.
--   - send-email sigue construyendo `subject` 100% server-side vía
--     renderTemplate(type, data), dispatchado por `type` -- la columna
--     `template` de email_queue no se lee en ningún punto del pipeline
--     de pago, ni antes ni después de este fix.
--   - merchant-mp-webhook: CERO cambios. Un fallo de este RPC sigue
--     logueado y sigue sin revertir el pago ya confirmado.
--
-- QUÉ SÍ CAMBIA (mínimo, justificado por el NOT NULL real de producción):
--   - Comprador: to_email = el mismo v_customer_email ya validado más
--     abajo (ninguna fuente nueva). template = 'payment_received_buyer'
--     (coincide con type -- mismo criterio ya documentado en el propio
--     COMMENT ON COLUMN email_queue.template: "Coincide con type").
--   - Comercio: ANTES se encolaba SIEMPRE, sin importar si había un
--     email resoluble -- process-email-queue lo detectaba recién al
--     enviar. Con to_email NOT NULL sin default ya no se puede insertar
--     sin un valor. Se resuelve el email del comercio ACÁ TAMBIÉN, con
--     el MISMO criterio de fallback que ya usa wa_queue_welcome_email
--     (wa_businesses.email primero, luego el owner en auth.users) --
--     no es una fuente nueva ni una lectura menos confiable, es la misma
--     resolución que process-email-queue ya hacía, ejecutada una vez más
--     temprano solo para poder satisfacer el NOT NULL. Si NINGUNA de las
--     dos fuentes tiene email (anomalía de datos extremadamente
--     improbable -- todo owner tiene email en auth.users), NO se inserta
--     fila para el comercio (mismo criterio ya usado para el comprador
--     sin email: se omite limpiamente, RAISE WARNING, sin fila "condenada
--     a fallar"). Se decidió explícitamente NO usar un placeholder
--     inventado (p. ej. 'sin-email@...') para forzar el INSERT: sería un
--     dato falso persistido en una columna llamada "to_email".
-- ============================================================

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
    ON CONFLICT (event_key) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_buyer_enqueued := (v_row_count > 0);
  END IF;

  -- Comercio: se resuelve el email ACÁ (mismo criterio de fallback que ya
  -- usa wa_queue_welcome_email: wa_businesses.email primero, luego el
  -- owner en auth.users) porque to_email es NOT NULL sin default en el
  -- schema real de producción -- ya no se puede insertar "a ciegas" como
  -- antes de este fix. process-email-queue sigue resolviendo el email de
  -- nuevo, en fresco, al momento de enviar -- esta resolución acá NO lo
  -- reemplaza, solo permite que la fila llegue a existir.
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
    ON CONFLICT (event_key) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_merchant_enqueued := (v_row_count > 0);
  ELSE
    RAISE WARNING 'wa_enqueue_payment_confirmation_emails: sin email de comercio resoluble para business % (order %), no se encola payment_received_merchant', v_business_id, p_order_id;
  END IF;

  RETURN QUERY SELECT v_buyer_enqueued, v_merchant_enqueued;
END;
$$;

COMMENT ON FUNCTION public.wa_enqueue_payment_confirmation_emails(UUID) IS
  'EMAIL-PAYMENTS-2A: compatible con el schema legacy real de email_queue '
  '(to_email/template NOT NULL sin default, payload NOT NULL default '
  '''{}''::jsonb -- ver drift de schema documentado en '
  '20260910200000_fix_payment_confirmation_emails_legacy_columns.sql). '
  'Encola payment_received_buyer (si hay customer_email válido) y '
  'payment_received_merchant (si se resuelve un email de comercio -- '
  'wa_businesses.email o el owner en auth.users). Idempotente vía '
  'event_key. process-email-queue relee todo fresco al enviar -- '
  'to_email/template/payload acá son solo para satisfacer el schema '
  'legado, nunca la fuente de verdad del envío real.';

REVOKE ALL ON FUNCTION public.wa_enqueue_payment_confirmation_emails(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_enqueue_payment_confirmation_emails(UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
