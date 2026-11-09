-- COMPROBACIONES INMEDIATAMENTE DESPUÉS DE APLICAR A–G. Solo lectura (SELECT). Cada fila debe dar ok = true.
-- Ejecutar después de CADA migración (las filas de migraciones aún no aplicadas darán false: es esperado).
-- Funciona aunque las tablas de A todavía no existan (no da error).
with checks(paso, comprobacion, ok) as (
  -- Seguridad del sistema durante la puesta en marcha
  select '0', 'emisión global apagada', not coalesce((select enabled from fiscal.dte39_emission_control where singleton), false)
  union all select '0', 'ninguna emisión en curso (sending)', not exists (select 1 from public.crm_fiscal_issuances where status = 'sending')
  union all select '0', 'la boleta ya emitida sigue intacta', (select count(*) = 1 from public.crm_fiscal_issuances where status = 'issued' and folio is not null and xml_base64 is not null)
  union all select '0', 'triggers de encolado antiguos siguen desactivados',
    (select bool_and(tgenabled = 'D') from pg_trigger where tgname in ('crm_invoice_paid_pos_dte39_enqueue', 'trg_enqueue_point_fiscal_pilot'))
  -- P0
  union all select 'P0', 'admin_audit y business_fiscal_roles existen', to_regclass('fiscal.admin_audit') is not null and to_regclass('fiscal.business_fiscal_roles') is not null
  -- A
  union all select 'A', 'business_credentials existe y está vacía', case when to_regclass('fiscal.business_credentials') is null then false else (xpath('/row/c/text()', query_to_xml('select count(*) as c from fiscal.business_credentials', false, true, '')))[1]::text::int = 0 end
  union all select 'A', 'crm_claim_fiscal_issuance reemplazada (ya no es la versión previa a A del respaldo)',
    md5(pg_get_functiondef('public.crm_claim_fiscal_issuance(uuid,uuid,text,integer)'::regprocedure)) <> '06d1f18683242ffa3e6b1d60e8452afb'
  union all select 'A', 'service_role lee dte39_emission_control y pos_dte39_outbox (las RPC lo necesitan)',
    has_table_privilege('service_role', 'fiscal.dte39_emission_control', 'SELECT') and has_table_privilege('service_role', 'fiscal.pos_dte39_outbox', 'SELECT')
  union all select 'A', 'service_role no escribe dte39_emission_control ni pos_dte39_outbox',
    not has_table_privilege('service_role', 'fiscal.dte39_emission_control', 'INSERT,UPDATE,DELETE')
    and not has_table_privilege('service_role', 'fiscal.pos_dte39_outbox', 'INSERT,UPDATE,DELETE')
  union all select 'A', 'anon sin permisos sobre crm_invoices', not has_table_privilege('anon', 'public.crm_invoices', 'SELECT,INSERT,UPDATE,DELETE')
  union all select 'A', 'authenticated conserva SELECT/INSERT/UPDATE/DELETE en crm_invoices',
    has_table_privilege('authenticated', 'public.crm_invoices', 'SELECT') and has_table_privilege('authenticated', 'public.crm_invoices', 'INSERT')
    and has_table_privilege('authenticated', 'public.crm_invoices', 'UPDATE') and has_table_privilege('authenticated', 'public.crm_invoices', 'DELETE')
  union all select 'A', 'authenticated actualiza todas las columnas de wa_businesses salvo user_id',
    (select bool_and(has_column_privilege('authenticated', 'public.wa_businesses', column_name, 'UPDATE') = (column_name <> 'user_id'))
       from information_schema.columns where table_schema = 'public' and table_name = 'wa_businesses')
  union all select 'A', 'catálogo: anon sigue leyendo wa_businesses y wa_products',
    has_table_privilege('anon', 'public.wa_businesses', 'SELECT') and has_table_privilege('anon', 'public.wa_products', 'SELECT')
  union all select 'A', 'un fiscal_owner por cada negocio con dueño',
    (select count(*) from fiscal.business_fiscal_roles where role = 'fiscal_owner' and revoked_at is null)
      = (select count(*) from public.wa_businesses where user_id is not null)
  union all select 'A', '4 bloqueos de ventas Point antiguas', case when to_regclass('fiscal.retroactive_emission_blocks') is null then false else (xpath('/row/c/text()', query_to_xml('select count(*) as c from fiscal.retroactive_emission_blocks', false, true, '')))[1]::text::int = 4 end
  union all select 'A', 'triggers nuevos activos (dueño y guardas)',
    (select count(*) = 5 from pg_trigger where tgenabled = 'O' and tgname in ('wa_businesses_seed_fiscal_owner', 'wa_businesses_owner_change',
       'fiscal_p1_cross_pipeline_guard', 'fiscal_p3_cross_pipeline_guard', 'fiscal_p4_cross_pipeline_guard'))
  -- B
  union all select 'B', 'save_credentials y connection_status solo service_role',
    coalesce((select count(*) = 2 and bool_and(not has_function_privilege('anon', p.oid, 'EXECUTE') and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
                     and has_function_privilege('service_role', p.oid, 'EXECUTE'))
       from pg_proc p where p.proname in ('crm_fiscal_save_credentials', 'crm_fiscal_connection_status') and p.pronamespace = 'public'::regnamespace), false)
  -- C
  union all select 'C', 'claim_with_credentials existe', to_regprocedure('public.crm_fiscal_claim_with_credentials(uuid,uuid,text)') is not null
  union all select 'C', 'provider_check admite siisolutions y dtecore',
    (select pg_get_constraintdef(oid) ~ 'dtecore' and pg_get_constraintdef(oid) ~ 'siisolutions' from pg_constraint where conname = 'crm_fiscal_issuances_provider_check')
  -- D
  union all select 'D', 'columnas de sucursal en issuers',
    (select count(*) = 2 from information_schema.columns where table_schema = 'fiscal' and table_name = 'issuers' and column_name in ('sucursal_nombre', 'sucursal_codigo'))
  -- E
  union all select 'E', 'sii_status existe y la boleta emitida queda unverified',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'crm_fiscal_issuances' and column_name = 'sii_status')
  -- F
  union all select 'F', 'review_status y resolución en issuers; emisor existente en draft sin verificar',
    exists (select 1 from information_schema.columns where table_schema = 'fiscal' and table_name = 'issuers' and column_name = 'review_status')
  union all select 'F', 'constraint issuers_review_check', exists (select 1 from pg_constraint where conname = 'issuers_review_check')
  -- G
  union all select 'G', 'wa_products.tax_treatment existe y todos los productos en NULL (nada cambia)',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wa_products' and column_name = 'tax_treatment')
  union all select 'G', 'trigger de auditoría de tax_treatment', exists (select 1 from pg_trigger where tgname = 'wa_products_tax_treatment_audit')
  -- Todas: ninguna función fiscal nueva ejecutable por anon o authenticated
  union all select 'A–G', 'anon y authenticated sin acceso al esquema fiscal (sus funciones no son alcanzables)',
    not has_schema_privilege('anon', 'fiscal', 'USAGE') and not has_schema_privilege('authenticated', 'fiscal', 'USAGE')
  union all select 'A–G', 'ninguna función pública crm_fiscal_* / crm_*fiscal_issuance ejecutable por anon o authenticated',
    not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and (p.proname like 'crm_fiscal%' or p.proname like 'crm_%fiscal_issuance')
                   and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype
                   and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE')))
)
select paso, comprobacion, ok from checks order by paso, comprobacion;

-- Consultas sueltas (leer el resultado a mano):
-- 1) Point sigue reconciliando sin errores (últimas 10 ejecuciones del cron de Point):
--    select status, start_time from cron.job_run_details d join cron.job j on j.jobid = d.jobid
--     where j.jobname = 'point-reconcile-stale-operations' order by start_time desc limit 10;
-- 2) Productos con tratamiento (debe ser 0 al aplicar G):
--    select count(*) from public.wa_products where tax_treatment is not null;
-- 3) Emisor existente después de F (debe ser draft, enabled=false, verified=false):
--    select review_status, enabled, verified from fiscal.issuers;
-- 4) Asesor de seguridad de Supabase (get_advisors, tipo security): sin avisos nuevos sobre tablas fiscal.*.
