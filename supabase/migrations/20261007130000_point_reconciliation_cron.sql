-- POINT-SMART reconciliation scheduler.
-- Prerequisite (production setup, intentionally not embedded in git):
--   1) Edge Function secret POINT_RECONCILE_SECRET
--   2) Vault secret point_reconcile_secret with the same random value
--
-- The job is intentionally NOT scheduled by this migration unless the Vault
-- secret already exists. This keeps branch/test migrations fail-closed.

do $$
begin
  if exists (select 1 from vault.decrypted_secrets where name = 'point_reconcile_secret') then
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
      );
      $cron$
    );
  else
    raise notice 'point_reconcile_secret is absent: Point reconciliation cron not scheduled';
  end if;
end
$$;
