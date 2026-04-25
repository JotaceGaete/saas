-- ─────────────────────────────────────────────────────────────────────────────
-- Migración: onboarding_tip_sequence
--
-- QUÉ HACE:
--   Crea una función trigger que inserta 10 emails programados en email_queue
--   cuando se crea un negocio (wa_businesses INSERT).
--
--   Los emails se programan con next_attempt_at escalonado:
--     tip_01 → +24 horas
--     tip_02 → +2 días  ... tip_10 → +10 días
--
-- DEDUPLICACIÓN:
--   Usa ON CONFLICT (business_id, type) DO NOTHING.
--   El índice único ya existe (email_queue_business_type_unique).
--   Ejecutar el trigger dos veces para el mismo negocio es seguro.
--
-- NO TOCA:
--   - welcome (trigger separado, tipo distinto)
--   - n8n ni el cron
--   - schema de email_queue
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_queue_onboarding_tips()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email       text;
  v_name        text;
  v_tip_num     int;
  v_type        text;
  v_delay       interval;
BEGIN
  -- Resolver email del usuario
  v_email := COALESCE(
    NULLIF(trim(NEW.email), ''),
    (SELECT email FROM auth.users WHERE id = NEW.user_id LIMIT 1)
  );

  IF v_email IS NULL THEN
    RAISE WARNING 'wa_queue_onboarding_tips: sin email para business %, saltando', NEW.id;
    RETURN NEW;
  END IF;

  v_name := COALESCE(NULLIF(trim(NEW.name), ''), split_part(v_email, '@', 1));

  -- Insertar 10 tips con next_attempt_at escalonado
  FOR v_tip_num IN 1..10 LOOP
    v_type := 'onboarding_tip_' || lpad(v_tip_num::text, 2, '0');

    -- tip_01 = +24h, tip_02..tip_10 = +N days
    IF v_tip_num = 1 THEN
      v_delay := interval '24 hours';
    ELSE
      v_delay := make_interval(days => v_tip_num);
    END IF;

    INSERT INTO public.email_queue (
      user_id,
      business_id,
      type,
      template,
      to_email,
      subject,
      payload,
      next_attempt_at,
      status,
      retry_count
    )
    VALUES (
      NEW.user_id,
      NEW.id,
      v_type,
      v_type,
      v_email,
      NULL,          -- el template JS genera el subject
      jsonb_build_object(
        'name',          NULLIF(trim(NEW.name), ''),
        'business_name', v_name,
        'user_email',    v_email,
        'created_at',    now()
      ),
      now() + v_delay,
      'pending',
      0
    )
    ON CONFLICT (business_id, type) DO NOTHING;

  END LOOP;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'wa_queue_onboarding_tips failed for business %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.wa_queue_onboarding_tips() IS
  'Inserta 10 emails de onboarding en email_queue al crear un negocio. '
  'Escalonados: tip_01 +24h, tip_02..tip_10 +N días. '
  'Guard: ON CONFLICT (business_id, type) DO NOTHING.';

-- Registrar el trigger (idempotente)
DROP TRIGGER IF EXISTS trigger_queue_onboarding_tips ON public.wa_businesses;

CREATE TRIGGER trigger_queue_onboarding_tips
  AFTER INSERT ON public.wa_businesses
  FOR EACH ROW
  EXECUTE FUNCTION public.wa_queue_onboarding_tips();

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN POST-MIGRACIÓN
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 1. Confirmar trigger activo:
--    SELECT trigger_name, event_manipulation
--    FROM information_schema.triggers
--    WHERE event_object_table = 'wa_businesses'
--    ORDER BY trigger_name;
--
-- 2. Simular creación de negocio (requiere user_id real):
--    INSERT INTO public.wa_businesses (user_id, name, email, slug, is_active)
--    VALUES ('UUID-REAL', 'Test Tips', 'test@ejemplo.com',
--            'test-tips-' || extract(epoch from now())::int, true)
--    RETURNING id;
--
-- 3. Verificar que se insertaron 10 tips:
--    SELECT type, template, status, next_attempt_at
--    FROM public.email_queue
--    WHERE business_id = 'UUID-DEL-NEGOCIO-INSERTADO'
--    ORDER BY next_attempt_at;
--
-- 4. Confirmar deduplicación (repetir el INSERT anterior con mismo business_id):
--    -- Debe retornar 0 filas nuevas en email_queue
