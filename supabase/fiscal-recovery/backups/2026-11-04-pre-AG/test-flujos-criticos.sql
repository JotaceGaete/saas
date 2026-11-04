-- Flujos críticos después de A–G. SOLO BASE LOCAL de prueba: todo corre en una transacción que se
-- revierte al final (no deja datos). Uso: psql -d <base_local_test> -f test-flujos-criticos.sql
-- Cada comprobación imprime una fila "ok | comprobación"; ninguna debe salir con ok = f.
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned
\pset fieldsep ' | '
begin;
create temp table r (ok boolean, comprobacion text);
grant all on r to public;
insert into auth.users (id, email) values ('aaaaaaaa-1111-4000-8000-000000000001', 'prueba-flujos@test.local');

-- 1. Alta de negocio como usuario con sesión (como waBusinessService)
select set_config('request.jwt.claim.sub', 'aaaaaaaa-1111-4000-8000-000000000001', true),
       set_config('request.jwt.claim.role', 'authenticated', true) \gset
set local role authenticated;
insert into public.wa_businesses (id, user_id, name, whatsapp, country_code, currency, slug)
values ('bbbbbbbb-1111-4000-8000-000000000001', 'aaaaaaaa-1111-4000-8000-000000000001', 'Negocio Flujos', '+56911111111', 'CL', 'CLP', 'negocio-flujos-test');
reset role;
insert into r select count(*) = 1, 'alta: se siembra el rol fiscal_owner' from fiscal.business_fiscal_roles where business_id = 'bbbbbbbb-1111-4000-8000-000000000001' and role = 'fiscal_owner';
-- Informativo: en producción los tips de bienvenida no se encolan desde el 2026-08-24 (ON CONFLICT
-- (business_id, type) no coincide con el índice único parcial). Falla previa y ajena a A–G.
insert into r select true, 'alta (informativo, falla previa a A–G): tips de bienvenida encolados = ' || count(*) from public.email_queue where business_id = 'bbbbbbbb-1111-4000-8000-000000000001';
insert into r select count(*) = 1, 'alta: trigger de producción encola el aviso de nuevo usuario' from public.admin_alert_queue where payload->>'business_id' = 'bbbbbbbb-1111-4000-8000-000000000001';
insert into r select email = 'prueba-flujos@test.local', 'alta: email del negocio tomado de auth.users' from public.wa_businesses where id = 'bbbbbbbb-1111-4000-8000-000000000001';

-- 2. Edición del negocio y cambio de dueño
set local role authenticated;
update public.wa_businesses set name = 'Negocio Flujos Editado', operating_days = '{}'::jsonb, onboarding_step = 'completed' where id = 'bbbbbbbb-1111-4000-8000-000000000001';
savepoint s_owner;
do $$ begin
  update public.wa_businesses set user_id = 'aaaaaaaa-1111-4000-8000-000000000001' where id = 'bbbbbbbb-1111-4000-8000-000000000001';
  insert into r values (false, 'permisos: cambiar user_id desde el cliente debe fallar');
exception when insufficient_privilege then
  insert into r values (true, 'permisos: cambiar user_id desde el cliente queda bloqueado');
end $$;
reset role;
insert into r select name = 'Negocio Flujos Editado', 'permisos: editar el negocio sigue funcionando' from public.wa_businesses where id = 'bbbbbbbb-1111-4000-8000-000000000001';

-- 3. Producto como dueño (triggers de producción: slug, límite de plan, primer producto)
set local role authenticated;
insert into public.wa_products (id, business_id, name, price, status, is_active)
values ('cccccccc-1111-4000-8000-000000000001', 'bbbbbbbb-1111-4000-8000-000000000001', 'Café Grande', 1190, 'active', true);
update public.wa_products set tax_treatment = 'IVA_AFECTO_19' where id = 'cccccccc-1111-4000-8000-000000000001';
reset role;
insert into r select slug = 'cafe-grande', 'producto: slug asignado por el trigger de producción' from public.wa_products where id = 'cccccccc-1111-4000-8000-000000000001';
insert into r select count(*) = 1, 'producto: cambio de IVA del producto queda auditado' from fiscal.admin_audit where business_id = 'bbbbbbbb-1111-4000-8000-000000000001' and action = 'tax_product_set';
update public.wa_products set tax_treatment = null where id = 'cccccccc-1111-4000-8000-000000000001';

-- 4. Catálogo público sin sesión
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true) \gset
set local role anon;
insert into r select count(*) = 1, 'catálogo: anon ve el negocio' from public.wa_businesses where slug = 'negocio-flujos-test';
insert into r select count(*) = 1, 'catálogo: anon ve el producto activo' from public.wa_products where business_id = 'bbbbbbbb-1111-4000-8000-000000000001' and is_active;
savepoint s_anon;
do $$ begin
  perform 1 from public.crm_invoices limit 1;
  insert into r values (false, 'catálogo: anon no debe acceder a crm_invoices');
exception when insufficient_privilege then
  insert into r values (true, 'catálogo: anon sin acceso a crm_invoices (cambio de A)');
end $$;
reset role;

-- 5. TPV: venta en efectivo con caja abierta (crm_create_pos_sale)
insert into public.crm_cash_sessions (id, business_id, date, opened_by, status, initial_amount)
values ('dddddddd-1111-4000-8000-000000000001', 'bbbbbbbb-1111-4000-8000-000000000001', current_date, 'aaaaaaaa-1111-4000-8000-000000000001', 'open', 0);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-1111-4000-8000-000000000001', true), set_config('request.jwt.claim.role', 'authenticated', true) \gset
set local role authenticated;
select id as venta1, invoice_number as num1 from public.crm_create_pos_sale('bbbbbbbb-1111-4000-8000-000000000001', 'flujos-idem-1',
  '[{"product_id":"cccccccc-1111-4000-8000-000000000001","name":"Café Grande","unit_price":1190,"quantity":1}]'::jsonb,
  current_date, null, 0, '[{"method":"cash","amount":2000}]'::jsonb) \gset
select id as venta1b from public.crm_create_pos_sale('bbbbbbbb-1111-4000-8000-000000000001', 'flujos-idem-1',
  '[{"product_id":"cccccccc-1111-4000-8000-000000000001","name":"Café Grande","unit_price":1190,"quantity":1}]'::jsonb,
  current_date, null, 0, '[{"method":"cash","amount":2000}]'::jsonb) \gset
reset role;
insert into r select status = 'pagada' and total = 1190, 'TPV: venta en efectivo pagada por 1190' from public.crm_invoices where id = :'venta1';
insert into r select :'venta1' = :'venta1b', 'TPV: misma clave de idempotencia devuelve la misma venta';
insert into r select count(*) = 1, 'TPV: una sola venta para la clave' from public.crm_invoices where pos_idempotency_key = 'flujos-idem-1';
insert into r select count(*) = 1 and sum(amount) = 1190, 'TPV: un pago en efectivo por el total (vuelto no se registra)' from public.crm_payments where invoice_id = :'venta1';

-- 6. Point: cierre de una venta cobrada (crm_finalize_point_sale, como service_role)
insert into public.crm_pos_point_operations (id, business_id, created_by, cash_session_id, terminal_id, mp_order_id, external_reference,
  create_idempotency_key, sale_idempotency_key, sale_snapshot, amount, currency, mp_status, processed_at)
values ('eeeeeeee-1111-4000-8000-000000000001', 'bbbbbbbb-1111-4000-8000-000000000001', 'aaaaaaaa-1111-4000-8000-000000000001',
  'dddddddd-1111-4000-8000-000000000001', 'TERMINAL-PRUEBA', 'ORD-PRUEBA-1', 'ref-flujos-1', gen_random_uuid(), 'flujos-point-1',
  jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id','cccccccc-1111-4000-8000-000000000001','name','Café Grande','unit_price',1190,'quantity',1)),
                     'discount', 0, 'currency', 'CLP', 'issue_date', current_date::text),
  1190, 'CLP', 'processed', now());
select set_config('request.jwt.claim.role', 'service_role', true) \gset
set local role service_role;
select id as venta2, invoice_number as num2 from public.crm_finalize_point_sale('eeeeeeee-1111-4000-8000-000000000001') \gset
select id as venta2b from public.crm_finalize_point_sale('eeeeeeee-1111-4000-8000-000000000001') \gset
reset role;
insert into r select status = 'pagada' and total = 1190, 'Point: venta cerrada y pagada' from public.crm_invoices where id = :'venta2';
insert into r select :'venta2' = :'venta2b', 'Point: cerrar dos veces devuelve la misma venta';
insert into r select count(*) = 1, 'Point: un pago mercado_pago' from public.crm_payments where invoice_id = :'venta2' and payment_method = 'mercado_pago';

-- 7. Numeración y ausencia de efectos fiscales
insert into r select :num2::int = :num1::int + 1, 'numeración: TPV y Point comparten el correlativo (' || :num1 || ' -> ' || :num2 || ')';
insert into r select count(*) = 0, 'fiscal: ninguna venta creó registro de emisión' from public.crm_fiscal_issuances where business_id = 'bbbbbbbb-1111-4000-8000-000000000001';
insert into r select count(*) = 0, 'fiscal: ninguna venta entró a colas antiguas' from fiscal.pos_dte39_outbox where business_id = 'bbbbbbbb-1111-4000-8000-000000000001';
insert into r select not coalesce((select enabled from fiscal.dte39_emission_control where singleton), false), 'fiscal: emisión global sigue apagada';

select ok, comprobacion from r;
rollback;
