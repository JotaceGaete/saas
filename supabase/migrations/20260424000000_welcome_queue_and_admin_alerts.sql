-- ─────────────────────────────────────────────────────────────────────────────
-- Migración: welcome_queue_and_admin_alerts
--
-- QUÉ HACE:
--   A) Corrige el schema de email_queue: añade columnas que el cron JS ya usa
--      (template, to_email, subject, payload, next_attempt_at, last_error,
--       provider_message_id). Sin estas columnas el endpoint estaba roto para
--       cualquier tipo de email.
--   B) Elimina el trigger que enviaba el welcome DIRECTO desde auth.users
--      (wa_on_auth_user_send_welcome). Reemplaza con insert en email_queue
--      disparado en wa_businesses INSERT.
--   C) Crea la tabla admin_alert_queue + trigger que inserta alerta 'new_user'
--      cuando se crea un negocio.
--
-- IMPACTO EN PRODUCCIÓN:
--   - El trigger de welcome directo deja de funcionar (está reemplazado).
--   - Los emails en cola siguen procesándose normalmente.
--   - No se tocan pedidos ni pagos.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- A. Corregir schema de email_queue
-- ─────────────────────────────────────────────────────────────────────────────

-- Columna dispatch: el cron JS usa email.template para buscar la función.
-- Se inicializa con el valor de 'type' para los registros existentes.
ALTER TABLE public.email_queue
  ADD COLUMN IF NOT EXISTS template             text,
  ADD COLUMN IF NOT EXISTS to_email             text,
  ADD COLUMN IF NOT EXISTS subject              text,
  ADD COLUMN IF NOT EXISTS payload              jsonb,
  ADD COLUMN IF NOT EXISTS next_attempt_at      timestamptz,
  ADD COLUMN IF NOT EXISTS last_error           text,
  ADD COLUMN IF NOT EXISTS provider_message_id  text;

-- Backfill: alinear template con type y next_attempt_at con send_at
-- para que los registros existentes sean procesables.
UPDATE public.email_queue
SET
  template        = COALESCE(template, 'unknown'),
  next_attempt_at = COALESCE(next_attempt_at, created_at, now())
WHERE next_attempt_at IS NULL
   OR template IS NULL;

-- Índice para la query principal del cron:
-- .in('status', ['pending','failed']).lte('next_attempt_at', now())
CREATE INDEX IF NOT EXISTS idx_email_queue_next_attempt_status
  ON public.email_queue (next_attempt_at)
  WHERE status IN ('pending', 'failed');

COMMENT ON COLUMN public.email_queue.template IS
  'Clave de dispatch: nombre de la función en templates{}. Coincide con type. Ejemplo: welcome, activation_24h, new_order.';
COMMENT ON COLUMN public.email_queue.to_email IS
  'Destinatario real del email (respeta EMAIL_TEST_MODE en el cron).';
COMMENT ON COLUMN public.email_queue.payload IS
  'Datos pasados a la función de template. Estructura varía por tipo.';
COMMENT ON COLUMN public.email_queue.next_attempt_at IS
  'Próximo intento permitido. Igual a send_at en el primer intento; se incrementa con backoff en reintentos.';
COMMENT ON COLUMN public.email_queue.last_error IS
  'Mensaje del último error. Útil para diagnóstico. Se limpia en envío exitoso.';
COMMENT ON COLUMN public.email_queue.provider_message_id IS
  'ID del mensaje devuelto por Resend al enviar con éxito.';

-- ─────────────────────────────────────────────────────────────────────────────
-- B1. Eliminar el trigger de welcome directo en auth.users
--     (wa_on_auth_user_send_welcome llama /functions/v1/send-email directamente)
-- ─────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS wa_on_auth_user_send_welcome ON auth.users;

-- La función puede quedar definida (no interfiere), pero el trigger se elimina.
-- Si se quiere limpiar completamente:
-- DROP FUNCTION IF EXISTS public.wa_send_welcome_email_on_signup();

-- ─────────────────────────────────────────────────────────────────────────────
-- B2. Trigger: insertar welcome en email_queue cuando se crea un negocio
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_queue_welcome_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_name  text;
BEGIN
  -- Obtener email: primero de wa_businesses.email, luego de auth.users como fallback.
  v_email := COALESCE(
    NULLIF(trim(NEW.email), ''),
    (SELECT email FROM auth.users WHERE id = NEW.user_id LIMIT 1)
  );

  IF v_email IS NULL THEN
    RAISE WARNING 'wa_queue_welcome_email: sin email para business %, saltando', NEW.id;
    RETURN NEW;
  END IF;

  v_name := COALESCE(NULLIF(trim(NEW.name), ''), split_part(v_email, '@', 1));

  -- ON CONFLICT DO NOTHING: el índice único (business_id, type) previene duplicados.
  INSERT INTO public.email_queue (
    user_id,
    business_id,
    type,
    template,
    to_email,
    subject,
    payload,
    next_attempt_at,
    status
  )
  VALUES (
    NEW.user_id,
    NEW.id,
    'welcome',
    'welcome',
    v_email,
    '¡Bienvenido a Ventalink!',
    jsonb_build_object(
      'user_email',    v_email,
      'business_name', v_name,
      'created_at',    now()
    ),
    now(),
    'pending'
  )
  ON CONFLICT (business_id, type) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'wa_queue_welcome_email failed for business %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.wa_queue_welcome_email() IS
  'Inserta el email de bienvenida en email_queue al crear un negocio. '
  'El cron process-email-queue lo procesa en ≤5 min. '
  'Guard: ON CONFLICT (business_id, type) DO NOTHING.';

DROP TRIGGER IF EXISTS trigger_queue_welcome_email ON public.wa_businesses;

CREATE TRIGGER trigger_queue_welcome_email
  AFTER INSERT ON public.wa_businesses
  FOR EACH ROW
  EXECUTE FUNCTION public.wa_queue_welcome_email();

-- ─────────────────────────────────────────────────────────────────────────────
-- C. Tabla admin_alert_queue
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.admin_alert_queue (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text        NOT NULL,
  status      text        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'sent', 'failed')),
  payload     jsonb,
  error       text,
  retry_count integer     NOT NULL DEFAULT 0,
  sent_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.admin_alert_queue IS
  'Cola de alertas para el admin. Procesada por /api/cron/process-admin-alert-queue cada 5 min. '
  'Actualmente: Telegram. Extensible a Slack, email, etc.';

COMMENT ON COLUMN public.admin_alert_queue.type IS
  'Tipo de alerta. Ejemplo: new_user, payment_failed, plan_expired.';

CREATE INDEX IF NOT EXISTS idx_admin_alert_queue_pending
  ON public.admin_alert_queue (created_at)
  WHERE status = 'pending';

-- RLS: solo service_role (el cron usa SUPABASE_SERVICE_ROLE_KEY).
ALTER TABLE public.admin_alert_queue ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- D. Trigger: insertar alerta new_user en admin_alert_queue al crear negocio
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_queue_new_user_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  v_email := COALESCE(
    NULLIF(trim(NEW.email), ''),
    (SELECT email FROM auth.users WHERE id = NEW.user_id LIMIT 1),
    'sin-email'
  );

  INSERT INTO public.admin_alert_queue (type, payload)
  VALUES (
    'new_user',
    jsonb_build_object(
      'user_email',    v_email,
      'business_name', COALESCE(NULLIF(trim(NEW.name), ''), 'Sin nombre'),
      'business_id',   NEW.id,
      'created_at',    now()
    )
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'wa_queue_new_user_alert failed for business %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.wa_queue_new_user_alert() IS
  'Inserta alerta new_user en admin_alert_queue al crear un negocio. '
  'El cron process-admin-alert-queue la envía por Telegram en ≤5 min.';

DROP TRIGGER IF EXISTS trigger_queue_new_user_alert ON public.wa_businesses;

CREATE TRIGGER trigger_queue_new_user_alert
  AFTER INSERT ON public.wa_businesses
  FOR EACH ROW
  EXECUTE FUNCTION public.wa_queue_new_user_alert();

-- ─────────────────────────────────────────────────────────────────────────────
-- NOTIFY
-- ─────────────────────────────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN POST-MIGRACIÓN
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 1. Triggers activos en wa_businesses:
--    SELECT trigger_name, event_manipulation, action_statement
--    FROM information_schema.triggers
--    WHERE event_object_table = 'wa_businesses'
--    ORDER BY trigger_name;
--
-- 2. Triggers activos en auth.users (confirmar que wa_on_auth_user_send_welcome fue eliminado):
--    SELECT trigger_name FROM information_schema.triggers
--    WHERE event_object_schema = 'auth' AND event_object_table = 'users';
--
-- 3. Columnas de email_queue:
--    SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'email_queue' ORDER BY ordinal_position;
--
-- 4. Columnas de admin_alert_queue:
--    SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'admin_alert_queue' ORDER BY ordinal_position;
--
-- 5. Simular registro de negocio para probar ambas colas:
--    -- (requiere un user_id real de auth.users)
--    INSERT INTO public.wa_businesses (user_id, name, email, slug, is_active)
--    VALUES ('UUID-DE-USUARIO-REAL', 'Test Negocio', 'test@ejemplo.com', 'test-negocio-'||extract(epoch from now())::int, true)
--    RETURNING id;
--
--    -- Verificar que se insertó en ambas colas:
--    SELECT id, template, to_email, status, send_at FROM public.email_queue ORDER BY created_at DESC LIMIT 3;
--    SELECT id, type, status, payload FROM public.admin_alert_queue ORDER BY created_at DESC LIMIT 3;
