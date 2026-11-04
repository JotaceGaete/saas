-- Huella del catálogo (public, fiscal): funciones, tablas, columnas, restricciones, triggers, políticas y
-- permisos efectivos (ordenados; los permisos por defecto se expanden con acldefault, así que no
-- cuenta como diferencia ni el orden interno de las ACL ni que estén implícitos o escritos).
select 'fn '||n.nspname||'.'||p.oid::regprocedure::text||' '||md5(pg_get_functiondef(p.oid))||' '||(select string_agg(x::text, ',' order by x::text) from unnest(coalesce(p.proacl, acldefault('f', p.proowner))) x)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','fiscal') and p.prokind in ('f','p')
union all
select 'rel '||c.oid::regclass::text||' '||c.relkind::text||' '||(select string_agg(x::text, ',' order by x::text) from unnest(coalesce(c.relacl, acldefault('r', c.relowner))) x)||' rls='||c.relrowsecurity
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','fiscal') and c.relkind in ('r','v','m','S')
union all
select 'col '||c.oid::regclass::text||'.'||a.attname||' '||format_type(a.atttypid,a.atttypmod)||' '||a.attnotnull||' '||coalesce((select string_agg(x::text, ',' order by x::text) from unnest(a.attacl) x),'')
  from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','fiscal') and c.relkind='r' and a.attnum>0 and not a.attisdropped
union all
select 'con '||conrelid::regclass::text||'.'||conname||' '||md5(pg_get_constraintdef(oid)) from pg_constraint
 where connamespace in ('public'::regnamespace,'fiscal'::regnamespace)
union all
select 'trg '||tgrelid::regclass::text||'.'||tgname||' '||tgenabled::text||' '||md5(pg_get_triggerdef(oid)) from pg_trigger
 where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace in ('public'::regnamespace,'fiscal'::regnamespace))
union all
select 'pol '||schemaname||'.'||tablename||'.'||policyname||' '||md5(coalesce(qual,'')||coalesce(with_check,'')) from pg_policies where schemaname in ('public','fiscal')
order by 1;
