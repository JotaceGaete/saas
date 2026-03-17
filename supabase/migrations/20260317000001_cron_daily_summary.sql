-- Cron: envía resumen diario 1 vez al día.
-- Requiere: extensiones pg_cron y pg_net (habilitar en Dashboard > Integrations si no están);
--          secrets en vault (project_url, anon_key).
--
-- IMPORTANTE: Ejecutar PRIMERO en SQL Editor (reemplazar con valores reales):
--
--   SELECT vault.create_secret('https://TU-PROJECT-REF.supabase.co', 'project_url');
--   SELECT vault.create_secret('TU_ANON_KEY', 'anon_key');
--
-- Horario: 02:00 UTC = ~23:00 Chile / 22:00 Argentina (resumen del día anterior).
-- Para eliminar: SELECT cron.unschedule('send-daily-summary');

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Job: invocar send-daily-summary una vez al día a las 02:00 UTC.
-- Requiere: ejecutar PRIMERO en SQL Editor (con tus valores):
--   SELECT vault.create_secret('https://TU-PROJECT-REF.supabase.co', 'project_url');
--   SELECT vault.create_secret('TU_ANON_KEY', 'anon_key');
--
SELECT cron.schedule(
  'send-daily-summary',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/send-daily-summary',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Para eliminar el job más tarde:
-- SELECT cron.unschedule('send-daily-summary');

COMMENT ON EXTENSION pg_cron IS 'Cron jobs. Resumen diario: send-daily-summary a las 02:00 UTC.';
