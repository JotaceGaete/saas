-- POINT-SMART reconciliation scheduler.
-- The job is always installed, but its SQL body invokes the Edge Function
-- only when both Vault prerequisites exist. This avoids the dangerous state
-- where a migration runs before secret provisioning and the cron is never
-- installed afterwards.
--
-- Production prerequisites:
--   1) Edge Function secret POINT_RECONCILE_SECRET
--   2) Vault secret point_reconcile_secret with the same random value
-- Existing project_url is reused.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'point-reconcile-stale-operations') then
    perform cron.unschedule('point-reconcile-stale-operations');
  end if;

  perform cron.schedule(
    'point-reconcile-stale-operations',
    '*/2 * * * *',
    $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1)
        || '/functions/v1/mp-point-reconcile',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-point-reconcile-secret',
        (select decrypted_secret from vault.decrypted_secrets where name = 'point_reconcile_secret' limit 1)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    )
    where exists (select 1 from vault.decrypted_secrets where name = 'project_url')
      and exists (select 1 from vault.decrypted_secrets where name = 'point_reconcile_secret');
    $cron$
  );
end
$$;
