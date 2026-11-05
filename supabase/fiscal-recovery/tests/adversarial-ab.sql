-- Pruebas adversariales A/B de la auditoría del 2026-11-05 (27 pruebas). SOLO base local *_test.
-- Todo ocurre en una transacción que se revierte. Uso:
--   PGHOST=/home/pgtest/pg/sock PGPORT=5544 psql -U postgres -d walinka_test -f supabase/fiscal-recovery/tests/adversarial-ab.sql
-- Cada fila: BIEN (el resultado es el esperado) o FALLA. Las pruebas 21, 23, 24, 26 y 27 fallaban
-- antes de la migración H (RUT repetido, folio repetido, venta emitida editable).
select current_database() like '%\_test' as es_test \gset
\if :es_test
\else
  \echo 'Se niega a correr: la base debe terminar en _test'
  \quit
\endif
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned
\pset fieldsep ' | '
begin;
create temp table r (n serial, resultado text, prueba text);
grant all on r to public; grant all on sequence r_n_seq to public;
create or replace function pg_temp.intento(p_sql text, p_prueba text, p_esperado text) returns void language plpgsql as $$
declare v_rows bigint; v_msg text;
begin
  begin
    execute p_sql; get diagnostics v_rows = row_count;
    insert into r(resultado, prueba) values (case when p_esperado = 'ok' then 'BIEN' else 'FALLA' end, p_prueba || ' -> ejecutó (' || v_rows || ' filas)');
  exception when others then
    v_msg := sqlerrm;
    insert into r(resultado, prueba) values (case when p_esperado = 'error' then 'BIEN' else 'FALLA' end, p_prueba || ' -> ' || left(v_msg, 70));
  end;
end $$;
grant execute on function pg_temp.intento(text,text,text) to public;

-- Datos: dos comercios con dueños distintos, emisor aprobado y una venta pagada cada uno
insert into auth.users (id, email) values ('a0000000-0000-4000-8000-00000000000a','dueno-a@test.local'), ('b0000000-0000-4000-8000-00000000000b','dueno-b@test.local');
insert into public.wa_businesses (id, user_id, name, whatsapp, country_code, currency) values
  ('aaaaaaaa-0000-4000-8000-0000000000aa','a0000000-0000-4000-8000-00000000000a','Comercio A','+56911111111','CL','CLP'),
  ('bbbbbbbb-0000-4000-8000-0000000000bb','b0000000-0000-4000-8000-00000000000b','Comercio B','+56922222222','CL','CLP');
insert into fiscal.business_credentials (business_id, provider, key_version, ciphertext, iv, auth_tag) values
  ('aaaaaaaa-0000-4000-8000-0000000000aa','dtecore',1,'\x01','\x000000000000000000000000','\x00000000000000000000000000000000'),
  ('bbbbbbbb-0000-4000-8000-0000000000bb','dtecore',1,'\x02','\x000000000000000000000000','\x00000000000000000000000000000000');
insert into fiscal.issuers (business_id, issuer_rut, provider, enabled, verified, review_status) values
  ('aaaaaaaa-0000-4000-8000-0000000000aa','76123456-0','dtecore',true,true,'approved'),
  ('bbbbbbbb-0000-4000-8000-0000000000bb','77654321-7','dtecore',true,true,'approved');
insert into public.crm_invoices (id, business_id, invoice_number, status, paid_at, total, subtotal, discount_amount) values
  ('5a000000-0000-4000-8000-0000000000a1','aaaaaaaa-0000-4000-8000-0000000000aa',1,'pagada',now(),1190,1190,0),
  ('5a000000-0000-4000-8000-0000000000a2','aaaaaaaa-0000-4000-8000-0000000000aa',2,'pagada',now(),1190,1190,0),
  ('5b000000-0000-4000-8000-0000000000b1','bbbbbbbb-0000-4000-8000-0000000000bb',1,'pagada',now(),1190,1190,0);
insert into public.crm_invoice_items (invoice_id, name, unit_price, quantity, subtotal, sort_order) values
  ('5a000000-0000-4000-8000-0000000000a1','Café',1190,1,1190,1), ('5b000000-0000-4000-8000-0000000000b1','Café',1190,1,1190,1);
insert into public.wa_products (id, business_id, name, price) values ('9a000000-0000-4000-8000-0000000000a1','aaaaaaaa-0000-4000-8000-0000000000aa','Producto A',1190);
-- Migración H: identidad credencial↔RUT verificada (simulada) para A y B, y un método aceptado
-- solo dentro de esta transacción. Sin esto ninguna fila puede pasar a sending.
insert into fiscal.identity_checks (business_id, provider, key_version, credential_fp, expected_rut, observed_rut, method, outcome, actor_user_id, detail)
select c.business_id, c.provider, c.key_version, fiscal.credential_fp(c.business_id), i.issuer_rut, i.issuer_rut, 'provider_api', 'match',
       '00000000-0000-4000-8000-000000000001', '{"adversarial": true}'::jsonb
  from fiscal.business_credentials c join fiscal.issuers i using (business_id)
 where c.business_id in ('aaaaaaaa-0000-4000-8000-0000000000aa','bbbbbbbb-0000-4000-8000-0000000000bb');
update fiscal.dte39_emission_control set identity_methods_accepted = '{provider_api}' where singleton;

-- 1) Usuario con sesión de B contra datos de A
select set_config('request.jwt.claim.sub','b0000000-0000-4000-8000-00000000000b',true), set_config('request.jwt.claim.role','authenticated',true) \gset
set local role authenticated;
select pg_temp.intento($q$select 1 from public.crm_invoices where business_id='aaaaaaaa-0000-4000-8000-0000000000aa' having count(*) > 0$q$, 'B lee ventas de A (RLS)', 'ok');
select pg_temp.intento($q$select * from public.crm_fiscal_issuances$q$, 'B lee el ledger de emisiones', 'error');
select pg_temp.intento($q$select * from fiscal.issuers$q$, 'B lee emisores (esquema fiscal)', 'error');
select pg_temp.intento($q$select public.crm_fiscal_claim_with_credentials('aaaaaaaa-0000-4000-8000-0000000000aa','5a000000-0000-4000-8000-0000000000a1','WLK-x')$q$, 'B reclama emisión (y credenciales) de A', 'error');
select pg_temp.intento($q$select public.crm_fiscal_get_credentials('aaaaaaaa-0000-4000-8000-0000000000aa')$q$, 'B obtiene credenciales de A', 'error');
select pg_temp.intento($q$select public.crm_fiscal_emission_context('aaaaaaaa-0000-4000-8000-0000000000aa','5a000000-0000-4000-8000-0000000000a1')$q$, 'B lee contexto fiscal de A', 'error');
select pg_temp.intento($q$select public.crm_finalize_fiscal_issuance('aaaaaaaa-0000-4000-8000-0000000000aa','5a000000-0000-4000-8000-0000000000a1','WLK-x','issued',1,'x','y',null)$q$, 'B finaliza emisión de A', 'error');
select pg_temp.intento($q$select public.crm_fiscal_reconcile_admin('aaaaaaaa-0000-4000-8000-0000000000aa','5a000000-0000-4000-8000-0000000000a1','WLK-x','b0000000-0000-4000-8000-00000000000b','b0000000-0000-4000-8000-00000000000b','failed',null,null,null,'rev','motivo largo','ref','not_found',now())$q$, 'B reconcilia venta de A', 'error');
select pg_temp.intento($q$select public.crm_fiscal_save_credentials('aaaaaaaa-0000-4000-8000-0000000000aa','b0000000-0000-4000-8000-00000000000b','76123456-0','\x01','\x000000000000000000000000','\x00000000000000000000000000000000',1)$q$, 'B reemplaza la API key de A', 'error');
select pg_temp.intento($q$update public.wa_products set tax_treatment='EXENTO' where id='9a000000-0000-4000-8000-0000000000a1'$q$, 'B cambia el IVA de un producto de A (0 filas esperado)', 'ok');
select pg_temp.intento($q$update public.crm_invoices set total=1 where business_id='aaaaaaaa-0000-4000-8000-0000000000aa'$q$, 'B modifica ventas de A (0 filas esperado)', 'ok');
select pg_temp.intento($q$update public.wa_businesses set user_id='b0000000-0000-4000-8000-00000000000b' where id='aaaaaaaa-0000-4000-8000-0000000000aa'$q$, 'B se apropia del comercio A (cambiar user_id)', 'error');
select pg_temp.intento($q$select * from public.crm_create_pos_sale('aaaaaaaa-0000-4000-8000-0000000000aa','x',jsonb_build_array(jsonb_build_object('name','x','unit_price',1,'quantity',1)),current_date)$q$, 'B crea una venta en el TPV de A', 'error');
select pg_temp.intento($q$select * from public.crm_finalize_point_sale('5a000000-0000-4000-8000-0000000000a1')$q$, 'B cierra una venta Point (requiere service_role)', 'error');
reset role;
-- comprobar que las 0 filas fueron realmente 0
insert into r(resultado, prueba) select case when tax_treatment is null then 'BIEN' else 'FALLA' end, 'producto de A sin cambios tras el intento de B' from public.wa_products where id='9a000000-0000-4000-8000-0000000000a1';
insert into r(resultado, prueba) select case when bool_and(total=1190) then 'BIEN' else 'FALLA' end, 'ventas de A sin cambios tras el intento de B' from public.crm_invoices where business_id='aaaaaaaa-0000-4000-8000-0000000000aa';

-- 2) Sin sesión (anon)
select set_config('request.jwt.claim.sub','',true), set_config('request.jwt.claim.role','anon',true) \gset
set local role anon;
select pg_temp.intento($q$select * from public.crm_invoices$q$, 'anon lee ventas', 'error');
select pg_temp.intento($q$select public.crm_fiscal_connection_status('aaaaaaaa-0000-4000-8000-0000000000aa')$q$, 'anon lee estado fiscal de A', 'error');
reset role;

-- 3) Servidor (service_role) mezclando negocio y venta: debe rechazar
select set_config('request.jwt.claim.role','service_role',true) \gset
update fiscal.dte39_emission_control set enabled = true where singleton;
set local role service_role;
select pg_temp.intento($q$select public.crm_fiscal_claim_with_credentials('bbbbbbbb-0000-4000-8000-0000000000bb','5a000000-0000-4000-8000-0000000000a1','WLK-cruzado')$q$, 'servidor: reclamo con negocio B y venta de A', 'error');
select pg_temp.intento($q$select 1 where public.crm_fiscal_get_issuance('bbbbbbbb-0000-4000-8000-0000000000bb','5a000000-0000-4000-8000-0000000000a1') is not null$q$, 'servidor: leer emisión de A como B (0 filas esperado)', 'ok');
reset role;

-- 4) Mismo RUT emisor en dos comercios (B registra el RUT de A)
select pg_temp.intento($q$update fiscal.issuers set issuer_rut='76123456-0' where business_id='bbbbbbbb-0000-4000-8000-0000000000bb'$q$, 'BD: B registra el RUT emisor de A (debería impedirse)', 'error');

-- 5) El mismo folio en dos boletas del mismo emisor
insert into public.crm_fiscal_issuances (business_id, sale_id, operation_id, status, provider) values
  ('aaaaaaaa-0000-4000-8000-0000000000aa','5a000000-0000-4000-8000-0000000000a1','op-1','sending','dtecore'),
  ('aaaaaaaa-0000-4000-8000-0000000000aa','5a000000-0000-4000-8000-0000000000a2','op-2','sending','dtecore');
set local role service_role;
select pg_temp.intento($q$select public.crm_finalize_fiscal_issuance('aaaaaaaa-0000-4000-8000-0000000000aa','5a000000-0000-4000-8000-0000000000a1','op-1','issued',777,'eA==','eA==',null)$q$, 'servidor: primera boleta folio 777', 'ok');
select pg_temp.intento($q$select public.crm_finalize_fiscal_issuance('aaaaaaaa-0000-4000-8000-0000000000aa','5a000000-0000-4000-8000-0000000000a2','op-2','issued',777,'eA==','eA==',null)$q$, 'BD: segunda boleta con el MISMO folio 777 (debería impedirse)', 'error');
reset role;
insert into r(resultado, prueba) select case when count(*) = 1 then 'BIEN' else 'FALLA' end, 'boletas con folio 777 del emisor A = ' || count(*) from public.crm_fiscal_issuances where business_id='aaaaaaaa-0000-4000-8000-0000000000aa' and folio=777 and status='issued';

-- 6) Documento emitido inmutable; venta emitida editable por su dueño
select pg_temp.intento($q$update public.crm_fiscal_issuances set xml_base64='Zm9v' where sale_id='5a000000-0000-4000-8000-0000000000a1'$q$, 'BD: alterar el XML de una boleta emitida', 'error');
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-00000000000a',true), set_config('request.jwt.claim.role','authenticated',true) \gset
set local role authenticated;
select pg_temp.intento($q$update public.crm_invoices set total=1, subtotal=1 where id='5a000000-0000-4000-8000-0000000000a1'$q$, 'dueño A cambia el total de una venta YA emitida (debería impedirse)', 'error');
select pg_temp.intento($q$update public.crm_invoice_items set unit_price=1, subtotal=1 where invoice_id='5a000000-0000-4000-8000-0000000000a1'$q$, 'dueño A cambia líneas de una venta YA emitida (debería impedirse)', 'error');
reset role;

select n, resultado, prueba from r order by n;
rollback;
