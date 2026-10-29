-- Security hotfix: administrative views join auth.users and must not be
-- queryable through public PostgREST roles.
-- Keep the views intact for privileged backend consumers.
-- No grants to authenticated: being signed in is not admin authorization.
revoke all privileges on table public.wa_payments_admin_view
  from public, anon, authenticated;
revoke all privileges on table public.wa_admin_business_overview
  from public, anon, authenticated;
grant select on table public.wa_payments_admin_view to service_role;
grant select on table public.wa_admin_business_overview to service_role;
