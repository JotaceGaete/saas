-- Fotografía del catálogo de objetos de public. Dos bases con el mismo resultado
-- tienen el mismo esquema. Se usa para comparar órdenes de migración y el rollback.
select 'fn|' || p.oid::regprocedure::text || '|' || md5(pg_get_functiondef(p.oid))
       || '|' || coalesce(p.proacl::text, '-')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
union all
select 'rel|' || c.relname || '|' || c.relkind::text || '|' || coalesce(c.relacl::text, '-')
       || '|rls=' || c.relrowsecurity::text
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'v', 'p')
union all
select 'idx|' || indexname || '|' || md5(indexdef)
from pg_indexes where schemaname = 'public'
union all
select 'con|' || conrelid::regclass::text || '|' || conname || '|' || md5(pg_get_constraintdef(oid))
from pg_constraint where connamespace = 'public'::regnamespace
order by 1;
