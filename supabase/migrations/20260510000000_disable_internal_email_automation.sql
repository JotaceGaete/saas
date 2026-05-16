-- Disable internal email automation based on email_queue.
--
-- This keeps the legacy tables and historical migrations in place, but stops:
--   - DB triggers that enqueue welcome / activation_24h emails.
--   - Supabase pg_cron execution of process-email-queue.
--
-- Supabase Auth emails such as verify/reset password are not touched.

DROP TRIGGER IF EXISTS trigger_queue_welcome_email ON public.wa_businesses;
DROP TRIGGER IF EXISTS trigger_schedule_activation_24h_email ON public.wa_businesses;

CREATE OR REPLACE FUNCTION public.wa_queue_welcome_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE LOG 'wa_queue_welcome_email skipped: EMAIL_AUTOMATION_DISABLED';
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.wa_queue_welcome_email() IS
  'Disabled legacy email_queue welcome automation. Kept as a no-op while EMAIL_AUTOMATION_ENABLED is false.';

CREATE OR REPLACE FUNCTION public.wa_schedule_activation_24h_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE LOG 'wa_schedule_activation_24h_email skipped: EMAIL_AUTOMATION_DISABLED';
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.wa_schedule_activation_24h_email() IS
  'Disabled legacy email_queue activation_24h automation. Kept as a no-op while EMAIL_AUTOMATION_ENABLED is false.';

DO $$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL
     AND to_regprocedure('cron.unschedule(text)') IS NOT NULL
     AND EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-email-queue') THEN
    EXECUTE 'SELECT cron.unschedule($1)' USING 'process-email-queue';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Could not unschedule process-email-queue cron job: %', SQLERRM;
END;
$$;

NOTIFY pgrst, 'reload schema';
