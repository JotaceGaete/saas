-- Solo base LOCAL de pruebas: privilegios de service_role sobre el esquema fiscal, como los
-- tiene el backend de Supabase (las RPC del ledger son security invoker y corren como service_role).
grant usage on schema fiscal to service_role;
grant all on all tables in schema fiscal to service_role;
grant all on all sequences in schema fiscal to service_role;
grant execute on all functions in schema fiscal to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
