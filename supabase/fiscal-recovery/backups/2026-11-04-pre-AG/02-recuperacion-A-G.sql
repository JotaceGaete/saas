-- PROCEDIMIENTO DE RECUPERACIÓN DE LAS MIGRACIONES FISCALES A–G. NO EJECUTAR SIN AUTORIZACIÓN.
-- Generado el 2026-11-04 a partir de los archivos de supabase/fiscal-recovery/proposed y del respaldo
-- 01-respaldo-estructura-pre-AG.sql (solo estructura). Probado en la base local walinka_test.
--
-- Uso: se revierte en orden inverso (G, F, E, D, C, B, A) y SOLO hasta la migración que falló o que se
-- quiere deshacer. Cada sección es una transacción y deja la base como estaba antes de esa migración.
-- Antes de cada sección: comprobar que la emisión está apagada y que no hay filas 'sending':
--   select enabled from fiscal.dte39_emission_control;                         -- debe ser false
--   select count(*) from public.crm_fiscal_issuances where status = 'sending';   -- debe ser 0
-- Pensado para usarse inmediatamente después de aplicar, ANTES de guardar credenciales o emitir:
-- quitar columnas o tablas borra lo que se haya escrito en ellas.


-- ================================ Revertir G (tratamiento tributario) ================================
-- Borra la columna wa_products.tax_treatment (productos con IVA ya marcado lo pierden) y la categoría por
-- defecto del emisor. Vuelve a las versiones de F de emission_context y connection_status, y a la de A
-- de sale_tax_lines_verified.
begin;
set local lock_timeout = '5s';
drop trigger if exists wa_products_tax_treatment_audit on public.wa_products;
drop function if exists fiscal.audit_product_tax_treatment();
drop function if exists public.crm_fiscal_set_tax_default(uuid, uuid, text);

-- public.crm_fiscal_emission_context: versión de la migración F
create or replace function public.crm_fiscal_emission_context(p_business_id uuid, p_sale_id uuid)
returns jsonb
language sql
stable
set search_path = public, fiscal
as $$
  select jsonb_build_object(
    'issuer', (select jsonb_build_object(
                        'issuer_rut', s.issuer_rut, 'enabled', s.enabled, 'verified', s.verified,
                        'sucursal_nombre', s.sucursal_nombre, 'sucursal_codigo', s.sucursal_codigo,
                        'resolucion_numero', s.resolucion_numero, 'resolucion_fecha', s.resolucion_fecha)
                 from fiscal.issuers s where s.business_id = p_business_id),
    'emission_enabled', exists (select 1 from fiscal.dte39_emission_control c where c.singleton and c.enabled),
    'tax_lines_verified', fiscal.sale_tax_lines_verified(p_business_id, p_sale_id),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'unit_price', x.unit_price,
                                          'quantity', x.quantity, 'discount_pct', x.discount_pct,
                                          'category', x.category) order by x.sort_order nulls last, x.id)
        from (select i.id, i.name, i.unit_price, i.quantity, i.discount_pct, i.sort_order,
                     (select v.category from fiscal.line_tax_verifications v
                       where v.invoice_item_id = i.id and v.verified is true
                       order by v.created_at desc limit 1) as category
                from public.crm_invoice_items i
               where i.invoice_id = p_sale_id) x), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('method', p.payment_method, 'amount', p.amount,
                                          'status', p.payment_status, 'voided', p.voided_at is not null))
        from public.crm_payments p
       where p.business_id = p_business_id and p.invoice_id = p_sale_id), '[]'::jsonb),
    'point_ops', coalesce((
      select jsonb_agg(jsonb_build_object('mp_status', o.mp_status, 'mp_order_id', o.mp_order_id,
                                          'mp_payment_id', o.mp_payment_id, 'finalized_at', o.finalized_at,
                                          'currency', o.currency, 'amount', o.amount))
        from public.crm_pos_point_operations o
       where o.business_id = p_business_id and o.crm_invoice_id = p_sale_id), '[]'::jsonb)
  );
$$;
revoke all on function public.crm_fiscal_emission_context(uuid, uuid) from public, anon, authenticated;
grant execute on function public.crm_fiscal_emission_context(uuid, uuid) to service_role;

-- public.crm_fiscal_connection_status: versión de la migración F
create or replace function public.crm_fiscal_connection_status(p_business_id uuid)
returns jsonb
language sql
stable
set search_path = public, fiscal
as $$
  select jsonb_build_object(
    'connected', c.business_id is not null,
    'issuerRut', i.issuer_rut,
    'enabled', coalesce(i.enabled, false),
    'verified', coalesce(i.verified, false),
    'keyVersion', c.key_version,
    'updatedAt', greatest(c.updated_at, i.updated_at),
    'reviewStatus', coalesce(i.review_status, 'draft'),
    'reviewNote', i.review_note,
    'submittedAt', i.submitted_at,
    'reviewedAt', i.reviewed_at,
    'resolucionNumero', i.resolucion_numero,
    'resolucionFecha', i.resolucion_fecha,
    'sucursalNombre', i.sucursal_nombre,
    'sucursalCodigo', i.sucursal_codigo)
  from (select p_business_id as bid) b
  left join fiscal.business_credentials c on c.business_id = b.bid
  left join fiscal.issuers i on i.business_id = b.bid;
$$;
revoke all on function public.crm_fiscal_connection_status(uuid) from public, anon, authenticated;
grant execute on function public.crm_fiscal_connection_status(uuid) to service_role;

-- fiscal.sale_tax_lines_verified: versión de la migración A
create or replace function fiscal.sale_tax_lines_verified(p_business_id uuid, p_sale_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public, fiscal
as $$
  with lines as (
    select i.id, md5(jsonb_build_array(i.product_id, i.name, i.description, i.unit_price, i.quantity,
                       i.discount_pct, i.subtotal, i.sort_order, i.discount_type)::text) fp
      from public.crm_invoice_items i
     where i.invoice_id = p_sale_id
  )
  select exists (select 1 from lines)
     and not exists (
       select 1 from lines l
        where not exists (
          select 1 from fiscal.line_tax_verifications t
           where t.invoice_item_id = l.id and t.sale_id = p_sale_id and t.business_id = p_business_id
             and t.verified is true and t.category in ('IVA_AFECTO_19', 'EXENTO')
             and length(trim(coalesce(t.evidence, ''))) >= 15
             and t.line_fingerprint = l.fp));
$$;
revoke all on function fiscal.sale_tax_lines_verified(uuid, uuid) from public, anon, authenticated;
grant execute on function fiscal.sale_tax_lines_verified(uuid, uuid) to service_role;

drop function if exists fiscal.line_tax_category(uuid, uuid, uuid);
alter table public.wa_products drop constraint if exists wa_products_tax_treatment_check;
alter table public.wa_products drop column if exists tax_treatment;
alter table fiscal.issuers drop constraint if exists issuers_default_tax_category_check;
alter table fiscal.issuers drop column if exists default_tax_category;
alter table fiscal.admin_audit drop constraint if exists admin_audit_action_check;
alter table fiscal.admin_audit add constraint admin_audit_action_check
  check (action in ('reconcile_attempt', 'reconcile_result', 'owner_changed', 'credentials_saved',
                    'credentials_removed', 'application_submitted', 'application_approved',
                    'application_rejected', 'application_suspended'));
commit;


-- ================================ Revertir F (alta y revisión) ================================
-- Exige que no haya filas de auditoría con acciones de F (admin_audit es solo-anexar: no se borran).
begin;
set local lock_timeout = '5s';
do $$ begin
  if exists (select 1 from fiscal.admin_audit where action like 'application_%') then
    raise exception 'Hay auditoría de solicitudes: no se revierte F sin decidir qué hacer con ella';
  end if;
end $$;
drop trigger if exists business_credentials_reset_review on fiscal.business_credentials;
drop function if exists fiscal.credentials_reset_review();
drop function if exists public.crm_fiscal_submit_application(uuid, uuid, integer, date, text, text);
drop function if exists public.crm_fiscal_review_application(uuid, uuid, text, text);
drop function if exists public.crm_fiscal_list_applications(text);

-- public.crm_fiscal_emission_context: versión de la migración D
create or replace function public.crm_fiscal_emission_context(p_business_id uuid, p_sale_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, fiscal
as $$
  select jsonb_build_object(
    'issuer', (select jsonb_build_object(
                        'issuer_rut', s.issuer_rut, 'enabled', s.enabled, 'verified', s.verified,
                        'sucursal_nombre', s.sucursal_nombre, 'sucursal_codigo', s.sucursal_codigo)
                 from fiscal.issuers s where s.business_id = p_business_id),
    'emission_enabled', exists (select 1 from fiscal.dte39_emission_control c where c.singleton and c.enabled),
    'tax_lines_verified', fiscal.sale_tax_lines_verified(p_business_id, p_sale_id),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'unit_price', x.unit_price,
                                          'quantity', x.quantity, 'discount_pct', x.discount_pct,
                                          'category', x.category) order by x.sort_order nulls last, x.id)
        from (select i.id, i.name, i.unit_price, i.quantity, i.discount_pct, i.sort_order,
                     (select v.category from fiscal.line_tax_verifications v
                       where v.invoice_item_id = i.id and v.verified is true
                       order by v.created_at desc limit 1) as category
                from public.crm_invoice_items i
               where i.invoice_id = p_sale_id) x), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('method', p.payment_method, 'amount', p.amount,
                                          'status', p.payment_status, 'voided', p.voided_at is not null))
        from public.crm_payments p
       where p.business_id = p_business_id and p.invoice_id = p_sale_id), '[]'::jsonb),
    'point_ops', coalesce((
      select jsonb_agg(jsonb_build_object('mp_status', o.mp_status, 'mp_order_id', o.mp_order_id,
                                          'mp_payment_id', o.mp_payment_id, 'finalized_at', o.finalized_at,
                                          'currency', o.currency, 'amount', o.amount))
        from public.crm_pos_point_operations o
       where o.business_id = p_business_id and o.crm_invoice_id = p_sale_id), '[]'::jsonb)
  );
$$;
revoke all on function public.crm_fiscal_emission_context(uuid, uuid) from public, anon, authenticated;
grant execute on function public.crm_fiscal_emission_context(uuid, uuid) to service_role;

-- public.crm_fiscal_connection_status: versión de la migración B
create or replace function public.crm_fiscal_connection_status(p_business_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, fiscal
as $$
  select jsonb_build_object(
    'connected', c.business_id is not null,
    'issuerRut', i.issuer_rut,
    'enabled', coalesce(i.enabled, false),
    'verified', coalesce(i.verified, false),
    'keyVersion', c.key_version,
    'updatedAt', greatest(c.updated_at, i.updated_at))
  from (select p_business_id as bid) b
  left join fiscal.business_credentials c on c.business_id = b.bid
  left join fiscal.issuers i on i.business_id = b.bid;
$$;
revoke all on function public.crm_fiscal_connection_status(uuid) from public, anon, authenticated;
grant execute on function public.crm_fiscal_connection_status(uuid) to service_role;

alter table fiscal.issuers drop constraint if exists issuers_review_check;
alter table fiscal.issuers
  drop column if exists review_status, drop column if exists review_note, drop column if exists submitted_at,
  drop column if exists submitted_by, drop column if exists reviewed_at, drop column if exists reviewed_by,
  drop column if exists resolucion_numero, drop column if exists resolucion_fecha;
alter table fiscal.admin_audit drop constraint if exists admin_audit_action_check;
alter table fiscal.admin_audit add constraint admin_audit_action_check
  check (action in ('reconcile_attempt', 'reconcile_result', 'owner_changed', 'credentials_saved', 'credentials_removed'));
commit;


-- ================================ Revertir E (estado SII) ================================
begin;
set local lock_timeout = '5s';
do $$ begin
  if exists (select 1 from fiscal.crm_fiscal_sii_status_events) then
    raise exception 'Hay eventos de estado SII registrados: no se revierte E sin respaldarlos';
  end if;
end $$;
drop trigger if exists crm_fiscal_issuances_guard_issued on public.crm_fiscal_issuances;
drop trigger if exists crm_fiscal_issuances_same_day on public.crm_fiscal_issuances;
drop function if exists fiscal.guard_issued_document();
drop function if exists fiscal.guard_same_day_claim();
drop function if exists public.crm_fiscal_record_sii_status(uuid, uuid, text, text, text, text, uuid);
drop function if exists public.crm_finalize_fiscal_issuance(uuid, uuid, text, text, integer, text, text, text);

-- public.crm_finalize_fiscal_issuance: versión de la migración C
create or replace function public.crm_finalize_fiscal_issuance(p_business_id uuid,p_sale_id uuid,p_operation_id text,p_status text,p_folio integer default null,p_xml_base64 text default null,p_pdf_base64 text default null) returns boolean language plpgsql security invoker set search_path=public as $$ declare v_count integer; begin if p_status is null or p_status not in ('issued','unknown') or (p_folio is not null and p_folio<=0) or (p_status='issued' and (p_folio is null or nullif(p_xml_base64,'') is null or nullif(p_pdf_base64,'') is null)) then raise exception 'Invalid fiscal outcome'; end if; update public.crm_fiscal_issuances set status=p_status,folio=p_folio,xml_base64=case when p_status='issued' then p_xml_base64 else null end,pdf_base64=case when p_status='issued' then p_pdf_base64 else null end,updated_at=now() where business_id=p_business_id and sale_id=p_sale_id and operation_id=p_operation_id and status='sending' and provider in ('siisolutions', 'dtecore') and dte_type=39; get diagnostics v_count=row_count; return v_count=1; end; $$;
revoke all on function public.crm_finalize_fiscal_issuance(uuid,uuid,text,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.crm_finalize_fiscal_issuance(uuid,uuid,text,text,integer,text,text) to service_role;

-- public.crm_fiscal_get_issuance: versión de la migración A
create or replace function public.crm_fiscal_get_issuance(p_business_id uuid, p_sale_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object('id', f.id, 'status', f.status, 'folio', f.folio, 'pdf_base64', f.pdf_base64)
    from public.crm_fiscal_issuances f
   where f.business_id = p_business_id and f.sale_id = p_sale_id and f.dte_type = 39;
$$;
revoke all on function public.crm_fiscal_get_issuance(uuid, uuid) from public, anon, authenticated;
grant execute on function public.crm_fiscal_get_issuance(uuid, uuid) to service_role;

drop table if exists fiscal.crm_fiscal_sii_status_events;
drop function if exists fiscal.sii_events_append_only();
alter table public.crm_fiscal_issuances drop constraint if exists crm_fiscal_issuances_sii_status_check;
alter table public.crm_fiscal_issuances
  drop column if exists sii_status, drop column if exists sii_track_id, drop column if exists sii_status_detail,
  drop column if exists sii_status_source, drop column if exists sii_checked_at, drop column if exists issued_at;
commit;


-- ================================ Revertir D (sucursal) ================================
begin;
set local lock_timeout = '5s';

-- public.crm_fiscal_emission_context: versión de la migración A
create or replace function public.crm_fiscal_emission_context(p_business_id uuid, p_sale_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, fiscal
as $$
  select jsonb_build_object(
    'issuer', (select jsonb_build_object('issuer_rut', s.issuer_rut, 'enabled', s.enabled, 'verified', s.verified)
                 from fiscal.issuers s where s.business_id = p_business_id),
    'emission_enabled', exists (select 1 from fiscal.dte39_emission_control c where c.singleton and c.enabled),
    'tax_lines_verified', fiscal.sale_tax_lines_verified(p_business_id, p_sale_id),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'unit_price', x.unit_price,
                                          'quantity', x.quantity, 'discount_pct', x.discount_pct,
                                          'category', x.category) order by x.sort_order nulls last, x.id)
        from (select i.id, i.name, i.unit_price, i.quantity, i.discount_pct, i.sort_order,
                     (select v.category from fiscal.line_tax_verifications v
                       where v.invoice_item_id = i.id and v.verified is true
                       order by v.created_at desc limit 1) as category
                from public.crm_invoice_items i
               where i.invoice_id = p_sale_id) x), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('method', p.payment_method, 'amount', p.amount,
                                          'status', p.payment_status, 'voided', p.voided_at is not null))
        from public.crm_payments p
       where p.business_id = p_business_id and p.invoice_id = p_sale_id), '[]'::jsonb),
    'point_ops', coalesce((
      select jsonb_agg(jsonb_build_object('mp_status', o.mp_status, 'mp_order_id', o.mp_order_id,
                                          'mp_payment_id', o.mp_payment_id, 'finalized_at', o.finalized_at,
                                          'currency', o.currency, 'amount', o.amount))
        from public.crm_pos_point_operations o
       where o.business_id = p_business_id and o.crm_invoice_id = p_sale_id), '[]'::jsonb)
  );
$$;
revoke all on function public.crm_fiscal_emission_context(uuid, uuid) from public, anon, authenticated;
grant execute on function public.crm_fiscal_emission_context(uuid, uuid) to service_role;

alter table fiscal.issuers drop constraint if exists issuers_sucursal_pair_check;
alter table fiscal.issuers drop column if exists sucursal_nombre, drop column if exists sucursal_codigo;
commit;


-- ================================ Revertir C (reclamo con credenciales) ================================
-- Exige que no haya filas del ledger con proveedor 'dtecore' (la restricción vuelve a solo 'siisolutions').
begin;
set local lock_timeout = '5s';
do $$ begin
  if exists (select 1 from public.crm_fiscal_issuances where provider <> 'siisolutions') then
    raise exception 'Hay filas con proveedor distinto de siisolutions: no se revierte C';
  end if;
end $$;
drop function if exists public.crm_fiscal_claim_with_credentials(uuid, uuid, text);
drop function if exists public.crm_fiscal_release_claim(uuid, uuid, text);

-- public.crm_fiscal_finalize_from_receipt: versión de la migración A
create or replace function public.crm_fiscal_finalize_from_receipt(
  p_business_id uuid, p_sale_id uuid, p_operation_id text
) returns boolean
language plpgsql
security invoker
set search_path = public, fiscal
as $$
declare
  v_r fiscal.crm_fiscal_provider_receipts%rowtype;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('fiscal_sale:' || p_sale_id::text, 0));
  select * into v_r from fiscal.crm_fiscal_provider_receipts
   where business_id = p_business_id and sale_id = p_sale_id and operation_id = p_operation_id;
  if not found then return false; end if;
  update public.crm_fiscal_issuances
     set status = 'issued', folio = v_r.folio, xml_base64 = v_r.xml_base64, pdf_base64 = v_r.pdf_base64,
         error_code = null, updated_at = now()
   where business_id = p_business_id and sale_id = p_sale_id and dte_type = 39
     and operation_id = p_operation_id and provider = 'siisolutions' and status = 'sending';
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;
revoke all on function public.crm_fiscal_finalize_from_receipt(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.crm_fiscal_finalize_from_receipt(uuid, uuid, text) to service_role;

-- public.crm_fiscal_list_stale_sending: versión de la migración A
create or replace function public.crm_fiscal_list_stale_sending(p_before timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path = public, fiscal
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'business_id', f.business_id, 'sale_id', f.sale_id,
           'operation_id', f.operation_id, 'has_receipt', exists (
             select 1 from fiscal.crm_fiscal_provider_receipts r
              where r.business_id = f.business_id and r.sale_id = f.sale_id and r.operation_id = f.operation_id)
         ) order by f.updated_at), '[]'::jsonb)
    from public.crm_fiscal_issuances f
   where f.status = 'sending' and f.dte_type = 39 and f.provider = 'siisolutions'
     and f.updated_at < p_before;
$$;
revoke all on function public.crm_fiscal_list_stale_sending(timestamptz) from public, anon, authenticated;
grant execute on function public.crm_fiscal_list_stale_sending(timestamptz) to service_role;

-- public.crm_fiscal_mark_failed: versión de la migración A
create or replace function public.crm_fiscal_mark_failed(
  p_business_id uuid, p_sale_id uuid, p_operation_id text, p_error_code text
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare v_count integer;
begin
  if nullif(trim(coalesce(p_operation_id, '')), '') is null or nullif(trim(coalesce(p_error_code, '')), '') is null then
    raise exception 'Invalid fiscal failure';
  end if;
  update public.crm_fiscal_issuances
     set status = 'failed', error_code = p_error_code, updated_at = now()
   where business_id = p_business_id and sale_id = p_sale_id and operation_id = p_operation_id
     and dte_type = 39 and provider = 'siisolutions' and status = 'sending';
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;
revoke all on function public.crm_fiscal_mark_failed(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.crm_fiscal_mark_failed(uuid, uuid, text, text) to service_role;

-- public.crm_fiscal_mark_stale_unknown: versión de la migración A
create or replace function public.crm_fiscal_mark_stale_unknown(
  p_business_id uuid, p_sale_id uuid, p_operation_id text, p_before timestamptz
) returns boolean
language plpgsql
security invoker
set search_path = public, fiscal
as $$
declare v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('fiscal_sale:' || p_sale_id::text, 0));
  -- Nunca si existe recibo: en ese caso hay que finalizar desde el recibo.
  if exists (select 1 from fiscal.crm_fiscal_provider_receipts
              where business_id = p_business_id and sale_id = p_sale_id and operation_id = p_operation_id) then
    return false;
  end if;
  update public.crm_fiscal_issuances
     set status = 'unknown', error_code = 'STALE_SENDING', updated_at = now()
   where business_id = p_business_id and sale_id = p_sale_id and dte_type = 39
     and operation_id = p_operation_id and provider = 'siisolutions'
     and status = 'sending' and updated_at < p_before;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;
revoke all on function public.crm_fiscal_mark_stale_unknown(uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.crm_fiscal_mark_stale_unknown(uuid, uuid, text, timestamptz) to service_role;

-- public.crm_fiscal_reconcile_with_evidence: versión de la migración A
create or replace function public.crm_fiscal_reconcile_with_evidence(
  p_business_id uuid, p_sale_id uuid, p_operation_id text, p_outcome text,
  p_folio integer, p_xml_base64 text, p_pdf_base64 text,
  p_reviewer text, p_reason text, p_evidence_reference text,
  p_provider_status text, p_checked_at timestamptz
) returns boolean
language plpgsql
security invoker
set search_path = public, fiscal
as $$
declare
  v_row public.crm_fiscal_issuances%rowtype;
  v_issued boolean := p_outcome = 'issued';
begin
  if p_outcome is null or p_outcome not in ('issued', 'failed') then
    raise exception 'Invalid fiscal reconciliation outcome';
  end if;
  if v_issued then
    if p_folio is null or p_folio <= 0
       or nullif(btrim(coalesce(p_xml_base64, '')), '') is null
       or nullif(btrim(coalesce(p_pdf_base64, '')), '') is null
       or p_provider_status is distinct from 'found' then
      raise exception 'Invalid fiscal reconciliation evidence';
    end if;
  else
    if p_folio is not null or p_provider_status is distinct from 'not_found' then
      raise exception 'Invalid fiscal reconciliation evidence';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('fiscal_sale:' || p_sale_id::text, 0));
  select * into v_row from public.crm_fiscal_issuances
   where business_id = p_business_id and sale_id = p_sale_id and dte_type = 39
   for update;
  if not found or v_row.status <> 'unknown' or v_row.operation_id <> p_operation_id
     or v_row.provider <> 'siisolutions' then
    raise exception 'FISCAL_NOT_RECONCILABLE';
  end if;

  insert into fiscal.crm_fiscal_reconciliation_evidence (
    business_id, sale_id, operation_id, outcome, folio, xml_sha256, pdf_sha256,
    reviewer, reason, evidence_reference, provider_status, checked_at)
  values (
    p_business_id, p_sale_id, p_operation_id, p_outcome,
    case when v_issued then p_folio end,
    case when v_issued then encode(sha256(decode(p_xml_base64, 'base64')), 'hex') end,
    case when v_issued then encode(sha256(decode(p_pdf_base64, 'base64')), 'hex') end,
    p_reviewer, p_reason, p_evidence_reference, p_provider_status, p_checked_at);

  if v_issued then
    update public.crm_fiscal_issuances
       set status = 'issued', folio = p_folio, xml_base64 = p_xml_base64, pdf_base64 = p_pdf_base64,
           error_code = null, updated_at = now()
     where id = v_row.id;
  else
    update public.crm_fiscal_issuances
       set status = 'failed', folio = null, xml_base64 = null, pdf_base64 = null,
           error_code = 'RECONCILED_NOT_FOUND', updated_at = now()
     where id = v_row.id;
  end if;
  return true;
end;
$$;
revoke all on function public.crm_fiscal_reconcile_with_evidence(uuid, uuid, text, text, integer, text, text, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.crm_fiscal_reconcile_with_evidence(uuid, uuid, text, text, integer, text, text, text, text, text, text, timestamptz) to service_role;

-- public.crm_fiscal_store_receipt: versión de la migración A
create or replace function public.crm_fiscal_store_receipt(
  p_business_id uuid, p_sale_id uuid, p_operation_id text,
  p_folio integer, p_xml_base64 text, p_pdf_base64 text
) returns boolean
language plpgsql
security invoker
set search_path = public, fiscal
as $$
declare
  v_status text;
  v_xml text := encode(sha256(decode(p_xml_base64, 'base64')), 'hex');
  v_pdf text := encode(sha256(decode(p_pdf_base64, 'base64')), 'hex');
  v_existing fiscal.crm_fiscal_provider_receipts%rowtype;
  v_inserted integer;
begin
  if p_folio is null or p_folio <= 0 or nullif(btrim(coalesce(p_operation_id, '')), '') is null then
    raise exception 'Invalid fiscal receipt';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('fiscal_sale:' || p_sale_id::text, 0));
  select f.status into v_status from public.crm_fiscal_issuances f
   where f.business_id = p_business_id and f.sale_id = p_sale_id and f.dte_type = 39
     and f.operation_id = p_operation_id and f.provider = 'siisolutions'
   for update;
  if v_status is distinct from 'sending' then raise exception 'FISCAL_NOT_SENDING'; end if;

  insert into fiscal.crm_fiscal_provider_receipts
    (business_id, sale_id, operation_id, folio, xml_base64, pdf_base64, xml_sha256, pdf_sha256)
  values (p_business_id, p_sale_id, p_operation_id, p_folio, p_xml_base64, p_pdf_base64, v_xml, v_pdf)
  on conflict (business_id, sale_id, operation_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    select * into v_existing from fiscal.crm_fiscal_provider_receipts
     where business_id = p_business_id and sale_id = p_sale_id and operation_id = p_operation_id;
    if v_existing.folio <> p_folio or v_existing.xml_sha256 <> v_xml or v_existing.pdf_sha256 <> v_pdf then
      raise exception 'FISCAL_RECEIPT_CONFLICT';
    end if;
  end if;
  return true;
end;
$$;
revoke all on function public.crm_fiscal_store_receipt(uuid, uuid, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.crm_fiscal_store_receipt(uuid, uuid, text, integer, text, text) to service_role;

-- public.crm_finalize_fiscal_issuance: versión de producción previa a A (respaldo)
CREATE OR REPLACE FUNCTION public.crm_finalize_fiscal_issuance(p_business_id uuid, p_sale_id uuid, p_operation_id text, p_status text, p_folio integer DEFAULT NULL::integer, p_xml_base64 text DEFAULT NULL::text, p_pdf_base64 text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_count integer;
begin
  if p_status is null or p_status not in ('issued', 'unknown') then
    raise exception 'Invalid fiscal outcome';
  end if;
  if p_folio is not null and p_folio <= 0 then
    raise exception 'Invalid fiscal folio';
  end if;
  if p_status = 'issued' and (p_folio is null or
       nullif(p_xml_base64, '') is null or nullif(p_pdf_base64, '') is null) then
    raise exception 'Issued outcome requires folio, XML and PDF';
  end if;
  update public.crm_fiscal_issuances
  set status = p_status,
      folio = p_folio,
      xml_base64 = case when p_status = 'issued' then p_xml_base64 else null end,
      pdf_base64 = case when p_status = 'issued' then p_pdf_base64 else null end,
      updated_at = now()
  where business_id = p_business_id and sale_id = p_sale_id
    and operation_id = p_operation_id and status = 'sending'
    and provider = 'siisolutions' and dte_type = 39;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$function$;
revoke all on function public.crm_finalize_fiscal_issuance(uuid, uuid, text, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.crm_finalize_fiscal_issuance(uuid, uuid, text, text, integer, text, text) to service_role;

-- public.crm_reconcile_fiscal_issuance: versión de producción previa a A (respaldo)
CREATE OR REPLACE FUNCTION public.crm_reconcile_fiscal_issuance(p_business_id uuid, p_sale_id uuid, p_operation_id text, p_folio integer, p_xml_base64 text, p_pdf_base64 text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ declare v_count integer; begin if p_business_id is null or p_sale_id is null or nullif(trim(p_operation_id),'') is null or p_folio is null or p_folio<=0 or nullif(trim(p_xml_base64),'') is null or nullif(trim(p_pdf_base64),'') is null then raise exception 'Invalid original fiscal document'; end if; update public.crm_fiscal_issuances set status='issued',folio=p_folio,xml_base64=p_xml_base64,pdf_base64=p_pdf_base64,error_code=null,updated_at=now() where business_id=p_business_id and sale_id=p_sale_id and operation_id=p_operation_id and dte_type=39 and provider='siisolutions' and status='unknown' and (folio is null or folio=p_folio); get diagnostics v_count=row_count; return v_count=1; end; $function$;
revoke all on function public.crm_reconcile_fiscal_issuance(uuid, uuid, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.crm_reconcile_fiscal_issuance(uuid, uuid, text, integer, text, text) to service_role;

drop function if exists fiscal.ledger_provider(text);
alter table public.crm_fiscal_issuances drop constraint if exists crm_fiscal_issuances_provider_check;
alter table public.crm_fiscal_issuances add constraint crm_fiscal_issuances_provider_check check (provider = 'siisolutions');
commit;


-- ================================ Revertir B (conexión de credenciales) ================================
begin;
set local lock_timeout = '5s';
do $$ begin
  if exists (select 1 from fiscal.issuers where provider <> 'sii_solutions') then
    raise exception 'Hay emisores con proveedor dtecore: no se revierte B';
  end if;
end $$;
drop function if exists public.crm_fiscal_save_credentials(uuid, uuid, text, bytea, bytea, bytea, integer);
drop function if exists public.crm_fiscal_disconnect(uuid, uuid);
drop function if exists public.crm_fiscal_connection_status(uuid);
drop function if exists fiscal.has_fresh_sending(uuid);
drop function if exists fiscal.sending_stale_window();
alter table fiscal.issuers drop constraint if exists issuers_provider_check;
alter table fiscal.issuers add constraint issuers_provider_check check (provider = 'sii_solutions');
commit;


-- ================================ Revertir A (ledger único y guardas) ================================
-- Vuelve permisos de crm_invoices y wa_businesses a los del respaldo, quita triggers nuevos (incluidos los
-- de wa_businesses y de las colas antiguas), borra tablas y funciones nuevas y restaura las 2 funciones
-- previas. Exige que las tablas nuevas estén vacías (credenciales, recibos, evidencias, bloqueos).
begin;
set local lock_timeout = '5s';
do $$ begin
  if exists (select 1 from fiscal.business_credentials) or exists (select 1 from fiscal.crm_fiscal_provider_receipts)
     or exists (select 1 from fiscal.crm_fiscal_reconciliation_evidence)
     -- los 4 bloqueos que la propia A carga (ventas Point antiguas) no cuentan
     or exists (select 1 from fiscal.retroactive_emission_blocks where sale_id not in (
          '8d40285b-4d52-41fa-ab7a-90870ca150dd', 'df077a1b-7cdc-4825-8750-6a5a991a3095',
          'ef2746fd-ca30-4ebc-86c6-4b8442e5fb84', '661c88a9-9731-46f8-a685-4e112290a98e')) then
    raise exception 'Hay datos en tablas de A: respaldarlos antes de revertir';
  end if;
end $$;
-- Triggers nuevos
drop trigger if exists fiscal_p3_cross_pipeline_guard on fiscal.pos_dte39_outbox;
drop trigger if exists fiscal_p1_cross_pipeline_guard on fiscal.operations;
drop trigger if exists fiscal_p4_cross_pipeline_guard on public.crm_point_fiscal_outbox;
drop trigger if exists wa_businesses_seed_fiscal_owner on public.wa_businesses;
drop trigger if exists wa_businesses_owner_change on public.wa_businesses;
-- Roles sembrados por A (P0 dejó la tabla vacía; no hay otra fuente de filas sin granted_by)
delete from fiscal.business_fiscal_roles where role = 'fiscal_owner' and granted_by is null;
-- Permisos de tabla del respaldo
grant all on table public.crm_invoices to anon;
do $$
declare c record;
begin
  for c in select column_name from information_schema.columns where table_schema = 'public' and table_name = 'wa_businesses' loop
    execute format('revoke update (%I) on public.wa_businesses from anon, authenticated', c.column_name);
  end loop;
end $$;
grant update on table public.wa_businesses to anon, authenticated;
grant execute on function fiscal.dte39_evidence_append_only() to public;
-- Tablas nuevas (vacías, comprobado arriba)
drop table if exists fiscal.crm_fiscal_provider_receipts;
drop table if exists fiscal.crm_fiscal_reconciliation_evidence;
drop table if exists fiscal.retroactive_emission_blocks;
drop table if exists fiscal.business_credentials;
-- Funciones nuevas
drop function if exists public.crm_fiscal_reconcile_admin(uuid, uuid, text, uuid, uuid, text, integer, text, text, text, text, text, text, timestamptz);
drop function if exists public.crm_fiscal_reconcile_with_evidence(uuid, uuid, text, text, integer, text, text, text, text, text, text, timestamptz);
drop function if exists public.crm_fiscal_store_receipt(uuid, uuid, text, integer, text, text);
drop function if exists public.crm_fiscal_mark_stale_unknown(uuid, uuid, text, timestamptz);
drop function if exists public.crm_fiscal_mark_failed(uuid, uuid, text, text);
drop function if exists public.crm_fiscal_list_stale_sending(timestamptz);
drop function if exists public.crm_fiscal_has_role(uuid, uuid, text);
drop function if exists public.crm_fiscal_get_issuance(uuid, uuid);
drop function if exists public.crm_fiscal_get_credentials(uuid);
drop function if exists public.crm_fiscal_finalize_from_receipt(uuid, uuid, text);
drop function if exists public.crm_fiscal_emission_context(uuid, uuid);
drop function if exists public.crm_fiscal_audit_append(uuid, uuid, uuid, text, text, jsonb);
drop function if exists public.crm_fiscal_actor_role(uuid, uuid);
drop function if exists fiscal.seed_owner_role();
drop function if exists fiscal.handle_owner_change();
drop function if exists fiscal.sale_tax_lines_verified(uuid, uuid);
drop function if exists fiscal.sale_payment_medio(uuid, uuid);
drop function if exists fiscal.sale_fiscal_conflict(uuid, uuid);
drop function if exists fiscal.guard_cross_pipeline_write();
drop function if exists fiscal.has_role(uuid, uuid, text);
drop function if exists fiscal.actor_role(uuid, uuid);

-- public.crm_claim_fiscal_issuance: versión de producción previa a A (respaldo)
CREATE OR REPLACE FUNCTION public.crm_claim_fiscal_issuance(p_business_id uuid, p_sale_id uuid, p_operation_id text, p_dte_type integer DEFAULT 39)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  if p_dte_type is distinct from 39 or nullif(trim(p_operation_id), '') is null or
     not exists (select 1 from public.crm_invoices i where i.id = p_sale_id and i.business_id = p_business_id) then
    raise exception 'Invalid fiscal issuance claim';
  end if;
  insert into public.crm_fiscal_issuances (business_id, sale_id, operation_id, dte_type, status)
  values (p_business_id, p_sale_id, p_operation_id, p_dte_type, 'sending')
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    update public.crm_fiscal_issuances
    set status = 'sending', updated_at = now()
    where business_id = p_business_id and sale_id = p_sale_id and dte_type = p_dte_type
      and operation_id = p_operation_id and status = 'pending'
    returning id into v_id;
  end if;
  return v_id is not null;
end;
$function$;
revoke all on function public.crm_claim_fiscal_issuance(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.crm_claim_fiscal_issuance(uuid, uuid, text, integer) to service_role;

commit;
