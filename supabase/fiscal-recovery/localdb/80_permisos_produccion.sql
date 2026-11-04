-- Solo base LOCAL de pruebas. Permisos de PRODUCCIÓN (verificados en solo lectura el 2026-11-04)
-- sobre el esquema fiscal ANTES de las migraciones A–G. Se aplica antes de las propuestas: así cada
-- migración debe conceder por sí misma lo que necesita, igual que en producción. Antes, un GRANT ALL
-- final a service_role ocultaba permisos que producción no tiene (dte39_emission_control,
-- pos_dte39_outbox).
--   fiscal (esquema): postgres=UC, service_role=U
--   issuers, operations, line_tax_verifications: service_role=arw (select, insert, update)
--   admin_audit, business_fiscal_roles: service_role=arwd (los concede P0)
--   dte39_emission_control, pos_dte39_outbox, dte39_reconciliation_evidence, business_tax_defaults: sin permisos
--   enqueue_paid_pos_dte39(), protect_dte39_outbox_transition(): solo postgres
-- Además, los esquemas de Supabase que usan los triggers de la app (extensions.unaccent, auth.users).
revoke all on schema fiscal from public, anon, authenticated;
grant usage on schema fiscal to service_role;
revoke all on all tables in schema fiscal from public, anon, authenticated, service_role;
revoke all on all sequences in schema fiscal from public, anon, authenticated, service_role;
do $$ declare t text; begin
  foreach t in array array['fiscal.issuers', 'fiscal.operations', 'fiscal.line_tax_verifications'] loop
    if to_regclass(t) is not null then execute format('grant select, insert, update on %s to service_role', t); end if;
  end loop;
  foreach t in array array['fiscal.admin_audit', 'fiscal.business_fiscal_roles'] loop
    if to_regclass(t) is not null then execute format('grant select, insert, update, delete on %s to service_role', t); end if;
  end loop;
  if to_regprocedure('fiscal.enqueue_paid_pos_dte39()') is not null then
    revoke all on function fiscal.enqueue_paid_pos_dte39() from public, service_role;
  end if;
  if to_regprocedure('fiscal.protect_dte39_outbox_transition()') is not null then
    revoke all on function fiscal.protect_dte39_outbox_transition() from public, service_role;
  end if;
end $$;
grant usage, select on all sequences in schema fiscal to service_role;
grant usage on schema extensions, auth to anon, authenticated, service_role;
grant execute on all functions in schema extensions to anon, authenticated, service_role;
