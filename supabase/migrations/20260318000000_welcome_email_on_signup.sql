-- Trigger: envía email de bienvenida al crear un usuario (signUp email/password O signInWithOAuth Google).
-- Requiere: pg_net (ya creado en 20260317000001), vault con project_url y anon_key.
-- Si no tienes vault configurado, ejecuta en SQL Editor:
--   SELECT vault.create_secret('https://TU-PROJECT-REF.supabase.co', 'project_url');
--   SELECT vault.create_secret('TU_ANON_KEY', 'anon_key');
--
-- Este trigger reemplaza el envío client-side en AuthContext para:
-- 1. Cubrir también registro vía Google OAuth (que nunca llama a signUp)
-- 2. Garantizar envío server-side aunque el cliente navegue o falle

CREATE OR REPLACE FUNCTION public.wa_send_welcome_email_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
DECLARE
  v_project_url TEXT;
  v_anon_key    TEXT;
  v_email       TEXT;
  v_name        TEXT;
  v_dashboard   TEXT;
  v_body        JSONB;
  v_headers     JSONB;
BEGIN
  IF NEW.email IS NULL OR trim(NEW.email) = '' THEN
    RETURN NEW;
  END IF;

  v_project_url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1);
  v_anon_key    := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1);

  IF v_project_url IS NULL OR v_anon_key IS NULL THEN
    RAISE WARNING 'wa_send_welcome_email_on_signup: vault secrets project_url o anon_key no configurados; saltando envío';
    RETURN NEW;
  END IF;

  v_email := trim(NEW.email);
  v_name := COALESCE(
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1),
    'Usuario'
  );
  v_dashboard := 'https://go.ventalink.app/dashboard';

  v_body := jsonb_build_object(
    'to', v_email,
    'type', 'welcome',
    'data', jsonb_build_object('name', v_name, 'dashboardUrl', v_dashboard),
    'userId', NEW.id
  );

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_anon_key,
    'apikey', v_anon_key
  );

  PERFORM net.http_post(
    url := trim(trailing '/' from v_project_url) || '/functions/v1/send-email',
    headers := v_headers,
    body := v_body
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'wa_send_welcome_email_on_signup failed for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wa_on_auth_user_send_welcome ON auth.users;
CREATE TRIGGER wa_on_auth_user_send_welcome
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.wa_send_welcome_email_on_signup();

COMMENT ON FUNCTION public.wa_send_welcome_email_on_signup() IS 'Envía email de bienvenida vía send-email Edge Function cuando se crea un usuario (email o OAuth). Requiere vault: project_url, anon_key.';
