-- Email queue: sistema de emails programados (activation_24h y extensible a futuros tipos).
--
-- Componentes:
--   1. Tabla email_queue            — cola de emails pendientes con send_at diferido.
--   2. Trigger en wa_businesses     — programa activation_24h 24h después del registro.
--   3. pg_cron job                  — llama a process-email-queue cada hora.
--
-- Requisitos previos en vault (ya deberían estar de migraciones anteriores):
--   SELECT vault.create_secret('project_url', 'https://TU_REF.supabase.co');
--   SELECT vault.create_secret('anon_key', 'TU_ANON_KEY');
--
-- Para probar sin esperar 24h:
--   UPDATE public.email_queue SET send_at = now() WHERE type = 'activation_24h' AND status = 'pending';
--   -- Luego invocar process-email-queue manualmente (ver sección de testing).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tabla email_queue
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.email_queue (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES auth.users(id)          ON DELETE CASCADE,
  business_id uuid        REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  type        text        NOT NULL,
  send_at     timestamptz NOT NULL,
  sent_at     timestamptz,
  status      text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.email_queue IS
  'Cola de emails con envío diferido. status: pending → sent | failed.';

COMMENT ON COLUMN public.email_queue.type IS
  'Tipo de email: activation_24h, etc. Extensible sin cambio de esquema.';

COMMENT ON COLUMN public.email_queue.send_at IS
  'Timestamp a partir del cual el email puede enviarse. process-email-queue lo compara con now().';

-- Índice principal: usado por process-email-queue para buscar pending con send_at vencido.
CREATE INDEX IF NOT EXISTS idx_email_queue_pending_send_at
  ON public.email_queue (send_at)
  WHERE status = 'pending';

-- Índice de unicidad lógica: un solo email por tipo por negocio (evita duplicados en INSERT).
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_queue_business_type
  ON public.email_queue (business_id, type);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS: solo service role puede leer/escribir (la Edge Function usa service key)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;

-- No hay políticas para usuarios normales: solo service role accede vía Edge Function.

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Función y trigger: programar activation_24h al crear un negocio
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_schedule_activation_24h_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- El índice UNIQUE (business_id, type) previene duplicados a nivel DB.
  -- El INSERT … ON CONFLICT DO NOTHING es el guard explícito.
  INSERT INTO public.email_queue (user_id, business_id, type, send_at)
  VALUES (
    NEW.user_id,
    NEW.id,
    'activation_24h',
    now() + interval '24 hours'
  )
  ON CONFLICT (business_id, type) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- No bloquear la creación del negocio si falla el scheduling.
    RAISE WARNING 'wa_schedule_activation_24h_email failed for business %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.wa_schedule_activation_24h_email() IS
  'Programa un email de activación 24h después de crear un negocio. Guard: ON CONFLICT DO NOTHING evita duplicados.';

-- Trigger: AFTER INSERT en wa_businesses (no interfiere con el INSERT original).
DROP TRIGGER IF EXISTS trigger_schedule_activation_24h_email ON public.wa_businesses;

CREATE TRIGGER trigger_schedule_activation_24h_email
  AFTER INSERT ON public.wa_businesses
  FOR EACH ROW
  EXECUTE FUNCTION public.wa_schedule_activation_24h_email();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. pg_cron: invocar process-email-queue cada hora
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

-- Desregistrar job anterior si existe (idempotente).
SELECT cron.unschedule('process-email-queue') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'process-email-queue'
);

SELECT cron.schedule(
  'process-email-queue',
  '0 * * * *',   -- cada hora en punto
  $$
  SELECT net.http_post(
    url     := trim(trailing '/' from (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url'))
               || '/functions/v1/process-email-queue',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key'),
      'apikey',        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key')
    ),
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);

COMMENT ON EXTENSION pg_cron IS 'Cron jobs. process-email-queue: cada hora.';

-- ─────────────────────────────────────────────────────────────────────────────
-- TESTING: probar sin esperar 24h
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Opción A — Adelantar send_at de un registro existente:
--   UPDATE public.email_queue
--   SET send_at = now() - interval '1 minute'
--   WHERE type = 'activation_24h' AND status = 'pending'
--   RETURNING id, user_id, business_id, send_at;
--
-- Opción B — Insertar directamente para un negocio existente:
--   INSERT INTO public.email_queue (user_id, business_id, type, send_at)
--   SELECT user_id, id, 'activation_24h', now() - interval '1 minute'
--   FROM public.wa_businesses
--   WHERE slug = 'mi-slug-de-prueba'
--   ON CONFLICT (business_id, type) DO UPDATE SET send_at = now() - interval '1 minute', status = 'pending', sent_at = NULL;
--
-- Luego invocar la Edge Function desde el Dashboard o CLI:
--   supabase functions invoke process-email-queue --data '{}'
--
-- Verificar resultado:
--   SELECT id, type, status, sent_at FROM public.email_queue ORDER BY created_at DESC LIMIT 10;
--   SELECT type, status, to_email, created_at FROM public.wa_email_logs ORDER BY created_at DESC LIMIT 10;

NOTIFY pgrst, 'reload schema';
