-- RECUPERACIÓN DE LA MIGRACIÓN H (20261105_fiscal_identity_integrity). PROPUESTA, NO EJECUTAR SIN AUTORIZACIÓN.
-- Devuelve el catálogo al estado posterior a G (probado localmente: test-recuperacion-H.sh compara la
-- huella del catálogo antes de H y después de revertir).
--
-- Se niega a correr (y no cambia nada) si H ya registró evidencia que no se puede reconstruir:
--   verificaciones de identidad, grupos de RUT compartido, correcciones tributarias autorizadas o
--   borradores de nota de crédito. En ese caso, exportar esas tablas (solo lectura) y decidir antes.
-- Lo que se pierde al revertir y se puede reconstruir: fiscal.document_folios (se deriva del ledger) y
-- crm_fiscal_issuances.issuer_rut (se deriva del XML o del emisor).
-- No se revierte: la normalización de issuer_rut en fiscal.issuers (solo quita ceros a la izquierda).
-- Si H agregó filas de auditoría con acciones nuevas, la restricción de acciones de G vuelve como
-- NOT VALID para no borrar evidencia (fiscal.admin_audit es solo-anexar).

begin;
set local lock_timeout = '5s';

do $$
declare v integer;
begin
  select (select count(*) from fiscal.identity_checks) + (select count(*) from fiscal.rut_share_groups)
       + (select count(*) from fiscal.tributary_corrections) + (select count(*) from fiscal.credit_notes) into v;
  if v > 0 then
    raise exception 'RECUPERACION_H: hay % fila(s) de evidencia de H (identidad, RUT compartido, correcciones o notas de crédito). Exportarlas y decidir antes de revertir.', v;
  end if;
end;
$$;

-- Triggers de H
drop trigger if exists crm_invoices_fiscal_lock on public.crm_invoices;
drop trigger if exists crm_invoice_items_fiscal_lock on public.crm_invoice_items;
drop trigger if exists crm_payments_fiscal_lock on public.crm_payments;
drop trigger if exists crm_fiscal_issuances_identity on public.crm_fiscal_issuances;
drop trigger if exists crm_fiscal_issuances_register_folio on public.crm_fiscal_issuances;
drop trigger if exists issuers_guard_rut on fiscal.issuers;
drop trigger if exists issuers_identity_on_approve on fiscal.issuers;

-- Tablas nuevas de H (vacías o derivables, ver arriba)
drop table if exists fiscal.credit_notes;
drop table if exists fiscal.tributary_corrections;
drop table if exists fiscal.document_folios;
drop table if exists fiscal.identity_checks;

-- Funciones de H que no existían antes
drop function if exists public.crm_fiscal_draft_credit_note(uuid, uuid, uuid, integer, text, numeric, jsonb);
drop function if exists public.crm_fiscal_authorize_tributary_correction(uuid, uuid, uuid, text, text);
drop function if exists public.crm_fiscal_record_identity_check(uuid, uuid, text, jsonb);
drop function if exists fiscal.guard_issuer_identity_on_approve();
drop function if exists public.crm_fiscal_create_rut_share(uuid, text, uuid[], text, text);
drop function if exists fiscal.guard_credit_note();
drop function if exists fiscal.guard_fiscalized_sale();
drop function if exists fiscal.sale_is_fiscalized(uuid);
drop function if exists fiscal.register_issuance_folio();
drop function if exists fiscal.guard_issuance_identity();
drop function if exists fiscal.register_folio(text, integer, integer, uuid, text, uuid);

-- Funciones que H reemplazó: definición anterior exacta
-- crm_fiscal_emission_context(uuid, uuid): versión de G (20261104_fiscal_product_tax_category.sql)
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
      select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'unit_price', i.unit_price,
                                          'quantity', i.quantity, 'discount_pct', i.discount_pct,
                                          'category', fiscal.line_tax_category(p_business_id, p_sale_id, i.id))
                       order by i.sort_order nulls last, i.id)
        from public.crm_invoice_items i
       where i.invoice_id = p_sale_id), '[]'::jsonb),
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

-- crm_fiscal_connection_status(uuid): versión de G (20261104_fiscal_product_tax_category.sql)
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
    'sucursalCodigo', i.sucursal_codigo,
    'defaultTaxCategory', i.default_tax_category)
  from (select p_business_id as bid) b
  left join fiscal.business_credentials c on c.business_id = b.bid
  left join fiscal.issuers i on i.business_id = b.bid;
$$;
revoke all on function public.crm_fiscal_connection_status(uuid) from public, anon, authenticated;
grant execute on function public.crm_fiscal_connection_status(uuid) to service_role;

-- crm_fiscal_get_issuance(uuid, uuid): versión de E (20261102_fiscal_sii_status.sql)
create or replace function public.crm_fiscal_get_issuance(p_business_id uuid, p_sale_id uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
           'id', f.id, 'status', f.status, 'folio', f.folio, 'pdf_base64', f.pdf_base64,
           'has_xml', f.xml_base64 is not null, 'error_code', f.error_code,
           'sii_status', f.sii_status, 'sii_track_id', f.sii_track_id, 'sii_checked_at', f.sii_checked_at,
           'issued_at', f.issued_at, 'updated_at', f.updated_at)
    from public.crm_fiscal_issuances f
   where f.business_id = p_business_id and f.sale_id = p_sale_id and f.dte_type = 39;
$$;
revoke all on function public.crm_fiscal_get_issuance(uuid, uuid) from public, anon, authenticated;
grant execute on function public.crm_fiscal_get_issuance(uuid, uuid) to service_role;

-- crm_fiscal_finalize_from_receipt(uuid, uuid, text): versión de C (20261102_fiscal_provider_claim_guard.sql)
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
     and operation_id = p_operation_id and provider in ('siisolutions', 'dtecore') and status = 'sending';
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;
revoke all on function public.crm_fiscal_finalize_from_receipt(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.crm_fiscal_finalize_from_receipt(uuid, uuid, text) to service_role;

-- Funciones auxiliares (después de las tablas que las usan)
drop function if exists fiscal.identity_block_reason(uuid);
drop function if exists fiscal.credential_fp(uuid);
drop function if exists fiscal.guard_issuer_rut();
drop function if exists fiscal.is_walinka_admin(uuid);
drop function if exists fiscal.xml_rut_emisor(text);

-- Columnas, índices y restricciones de H
alter table public.crm_fiscal_issuances drop constraint if exists crm_fiscal_issuances_document_key;
alter table public.crm_fiscal_issuances drop constraint if exists crm_fiscal_issuances_issuer_rut_check;
drop index if exists public.crm_fiscal_issuances_sale_idx;
alter table public.crm_fiscal_issuances drop column if exists issuer_rut;
drop index if exists fiscal.issuers_rut_unshared_uq;
alter table fiscal.issuers drop column if exists rut_share_group;
drop table if exists fiscal.rut_share_groups;
alter table fiscal.dte39_emission_control drop column if exists identity_contract_verified;
drop function if exists fiscal.normalize_rut(text);

-- Acciones de auditoría: versión de G
alter table fiscal.admin_audit drop constraint if exists admin_audit_action_check;
do $$
declare v_new boolean;
begin
  select exists (select 1 from fiscal.admin_audit where action in ('identity_checked', 'rut_share_created',
    'tributary_correction_authorized', 'tributary_correction_change', 'credit_note_drafted')) into v_new;
  execute 'alter table fiscal.admin_audit add constraint admin_audit_action_check'
       || ' check (action in (''reconcile_attempt'', ''reconcile_result'', ''owner_changed'', ''credentials_saved'','
       || ' ''credentials_removed'', ''application_submitted'', ''application_approved'','
       || ' ''application_rejected'', ''application_suspended'', ''tax_default_set'', ''tax_product_set''))'
       || case when v_new then ' not valid' else '' end;
end;
$$;

commit;
