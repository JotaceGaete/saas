-- Email hardening: idempotencia, trazabilidad y autenticación por secret.
--
-- QW-2: idempotency_key + unique index en wa_email_logs
-- QW-3: columna source en wa_email_logs
-- QW-1 + QW-4: recrea wa_send_welcome_email_on_signup con guard de idempotencia
--              y x-email-secret (con fallback a anon_key si el secret no está en vault).
--
-- Pasos manuales requeridos ANTES de activar QW-4 en producción:
--   1. Generar un secret aleatorio (ej: openssl rand -hex 32)
--   2. Guardarlo en vault:
--        SELECT vault.create_secret('EL_SECRET_GENERADO', 'email_function_secret');
--   3. Agregarlo como env var en Supabase Dashboard > Edge Functions > send-email:
--        EMAIL_FUNCTION_SECRET = EL_SECRET_GENERADO
--   Mientras no esté configurado, el endpoint funciona igual que antes (sin validación).

-- ─────────────────────────────────────────────────────────────────────────────
-- QW-2 + QW-3: Nuevas columnas en wa_email_logs
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.wa_email_logs
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT NULL,
  ADD COLUMN IF NOT EXISTS source          TEXT NULL;

-- Unique index: garantiza que no se registren dos envíos para el mismo evento lógico.
-- Solo aplica cuando idempotency_key IS NOT NULL (emails puntuales de ciclo de vida).
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_email_logs_idempotency_key
  ON public.wa_email_logs(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Index de diagnóstico: consultas tipo "¿este usuario recibió el welcome?"
CREATE INDEX IF NOT EXISTS idx_wa_email_logs_user_type
  ON public.wa_email_logs(user_id, type)
  WHERE user_id IS NOT NULL;

COMMENT ON COLUMN public.wa_email_logs.idempotency_key IS
  'Clave única por evento lógico. Formato: {type}:{user_id} para lifecycle (welcome, trial_expiring), {type}:{business_id}:{date} para periódicos. NULL para emails ad-hoc sin requisito de unicidad.';
COMMENT ON COLUMN public.wa_email_logs.source IS
  'Origen del envío: trigger_signup | trigger_trial | api | cron | admin_test.';

-- ─────────────────────────────────────────────────────────────────────────────
-- QW-1 + QW-4: Recrea wa_send_welcome_email_on_signup con guard e idempotency_key
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_send_welcome_email_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
DECLARE
  v_project_url     TEXT;
  v_anon_key        TEXT;
  v_email_secret    TEXT;
  v_email           TEXT;
  v_name            TEXT;
  v_dashboard       TEXT;
  v_body            JSONB;
  v_headers         JSONB;
  v_idempotency_key TEXT;
BEGIN
  IF NEW.email IS NULL OR trim(NEW.email) = '' THEN
    RETURN NEW;
  END IF;

  -- QW-1: Guard de idempotencia — no enviar si ya existe un log con esta clave.
  -- Cubre el caso de duplicados por webhooks adicionales o llamadas manuales posteriores.
  v_idempotency_key := 'welcome:' || NEW.id::text;
  IF EXISTS (
    SELECT 1 FROM public.wa_email_logs
    WHERE idempotency_key = v_idempotency_key
    LIMIT 1
  ) THEN
    RAISE NOTICE 'wa_send_welcome_email_on_signup: welcome ya enviado para user %, saltando', NEW.id;
    RETURN NEW;
  END IF;

  -- Leer secrets del vault
  v_project_url  := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url'         LIMIT 1);
  v_email_secret := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_function_secret' LIMIT 1);
  v_anon_key     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key'            LIMIT 1);

  IF v_project_url IS NULL THEN
    RAISE WARNING 'wa_send_welcome_email_on_signup: vault secret project_url no configurado; saltando envío';
    RETURN NEW;
  END IF;

  IF v_email_secret IS NULL AND v_anon_key IS NULL THEN
    RAISE WARNING 'wa_send_welcome_email_on_signup: vault secrets email_function_secret y anon_key no configurados; saltando envío';
    RETURN NEW;
  END IF;

  v_email := trim(NEW.email);
  v_name  := COALESCE(
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1),
    'Usuario'
  );
  v_dashboard := 'https://go.ventalink.app/dashboard';

  v_body := jsonb_build_object(
    'to',              v_email,
    'type',            'welcome',
    'data',            jsonb_build_object('name', v_name, 'dashboardUrl', v_dashboard),
    'userId',          NEW.id,
    'idempotencyKey',  v_idempotency_key,
    'source',          'trigger_signup'
  );

  -- QW-4: headers — usar x-email-secret si está disponible en vault;
  -- conservar anon_key como Bearer para compatibilidad con verify_jwt=false.
  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || COALESCE(v_anon_key, ''),
    'apikey',        COALESCE(v_anon_key, '')
  );

  IF v_email_secret IS NOT NULL THEN
    v_headers := v_headers || jsonb_build_object('x-email-secret', v_email_secret);
  END IF;

  PERFORM net.http_post(
    url     := trim(trailing '/' from v_project_url) || '/functions/v1/send-email',
    headers := v_headers,
    body    := v_body
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'wa_send_welcome_email_on_signup failed for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.wa_send_welcome_email_on_signup() IS
  'Envía email de bienvenida vía send-email Edge Function al crear un usuario (email/password u OAuth). Guard de idempotencia: no envía si ya existe log con clave welcome:{user_id}. Requiere vault: project_url + (email_function_secret o anon_key).';

NOTIFY pgrst, 'reload schema';
