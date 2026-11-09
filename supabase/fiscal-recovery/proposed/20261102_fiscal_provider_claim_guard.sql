-- Proveedor canónico y reclamo con credenciales bajo un mismo candado.
--
-- 1. Identificador canónico: 'dtecore' en emisores (fiscal.issuers), credenciales
--    (fiscal.business_credentials) y emisiones nuevas (public.crm_fiscal_issuances).
--    Los valores históricos del piloto se conservan y no se reescriben:
--      'siisolutions'  -> ledger del piloto ('sii_solutions' en el emisor).
--    Las funciones de recuperación y reconciliación aceptan ambos valores, así que el histórico
--    sigue siendo recuperable sin migrar datos. Ningún valor histórico se convierte en 'dtecore'.
--
-- 2. Reclamo atómico: public.crm_fiscal_claim_with_credentials lee las credenciales y reclama la
--    venta (pending -> sending) en UNA transacción, bajo el mismo candado que conectar, reemplazar
--    y desconectar ('fiscal_connection:<negocio>'). Así una emisión nunca usa credenciales que
--    cambian durante su preparación. Orden de candados: conexión -> venta (sin ciclos).
--
-- 3. Liberación: public.crm_fiscal_release_claim devuelve sending -> pending SOLO para fallos
--    anteriores a la llamada al proveedor (p. ej. credenciales que no se pueden descifrar).
--
-- Aplicar SOLO en walinka_test. Después de 20261101_fiscal_connection.sql.

begin;

-- 1a. Restricciones de proveedor del ledger: solo se amplían, no cambia ninguna fila.
alter table public.crm_fiscal_issuances drop constraint if exists crm_fiscal_issuances_provider_check;
alter table public.crm_fiscal_issuances add constraint crm_fiscal_issuances_provider_check
  check (provider in ('siisolutions', 'dtecore'));

-- 1b. Mapeo de proveedor del emisor al valor que se escribe en el ledger de emisiones nuevas.
create or replace function fiscal.ledger_provider(p_issuer_provider text)
returns text
language sql
immutable
as $$
  select case p_issuer_provider
           when 'dtecore' then 'dtecore'
           when 'sii_solutions' then 'siisolutions'
         end
$$;
-- Ajuste previo a producción (2026-11-04): sin ejecución pública.
revoke all on function fiscal.ledger_provider(text) from public, anon, authenticated;
grant execute on function fiscal.ledger_provider(text) to service_role;

-- 1c. Funciones de recuperación y reconciliación: aceptan el histórico y el canónico.
--     Generadas desde 20261031_fiscal_single_ledger_guard.sql; solo cambia el filtro de proveedor.
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
     and dte_type = 39 and provider in ('siisolutions', 'dtecore') and status = 'sending';
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

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
     or v_row.provider not in ('siisolutions', 'dtecore') then
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
     and f.operation_id = p_operation_id and f.provider in ('siisolutions', 'dtecore')
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
   where f.status = 'sending' and f.dte_type = 39 and f.provider in ('siisolutions', 'dtecore')
     and f.updated_at < p_before;
$$;

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
     and operation_id = p_operation_id and provider in ('siisolutions', 'dtecore')
     and status = 'sending' and updated_at < p_before;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;
-- 1d. Finalización y reconciliación del piloto: mismas funciones de supabase/fiscal-recovery/migrations,
--     con el filtro de proveedor ampliado (histórico + canónico).
create or replace function public.crm_finalize_fiscal_issuance(p_business_id uuid,p_sale_id uuid,p_operation_id text,p_status text,p_folio integer default null,p_xml_base64 text default null,p_pdf_base64 text default null) returns boolean language plpgsql security invoker set search_path=public as $$ declare v_count integer; begin if p_status is null or p_status not in ('issued','unknown') or (p_folio is not null and p_folio<=0) or (p_status='issued' and (p_folio is null or nullif(p_xml_base64,'') is null or nullif(p_pdf_base64,'') is null)) then raise exception 'Invalid fiscal outcome'; end if; update public.crm_fiscal_issuances set status=p_status,folio=p_folio,xml_base64=case when p_status='issued' then p_xml_base64 else null end,pdf_base64=case when p_status='issued' then p_pdf_base64 else null end,updated_at=now() where business_id=p_business_id and sale_id=p_sale_id and operation_id=p_operation_id and status='sending' and provider in ('siisolutions', 'dtecore') and dte_type=39; get diagnostics v_count=row_count; return v_count=1; end; $$; revoke all on function public.crm_finalize_fiscal_issuance(uuid,uuid,text,text,integer,text,text) from public,anon,authenticated; grant execute on function public.crm_finalize_fiscal_issuance(uuid,uuid,text,text,integer,text,text) to service_role;

create or replace function public.crm_reconcile_fiscal_issuance(p_business_id uuid,p_sale_id uuid,p_operation_id text,p_folio integer,p_xml_base64 text,p_pdf_base64 text) returns boolean language plpgsql security invoker set search_path=public as $$ declare v_count integer; begin if p_business_id is null or p_sale_id is null or nullif(trim(p_operation_id),'') is null or p_folio is null or p_folio<=0 or nullif(trim(p_xml_base64),'') is null or nullif(trim(p_pdf_base64),'') is null then raise exception 'Invalid original fiscal document'; end if; update public.crm_fiscal_issuances set status='issued',folio=p_folio,xml_base64=p_xml_base64,pdf_base64=p_pdf_base64,error_code=null,updated_at=now() where business_id=p_business_id and sale_id=p_sale_id and operation_id=p_operation_id and dte_type=39 and provider in ('siisolutions', 'dtecore') and status='unknown' and (folio is null or folio=p_folio); get diagnostics v_count=row_count; return v_count=1; end; $$; revoke all on function public.crm_reconcile_fiscal_issuance(uuid,uuid,text,integer,text,text) from public,anon,authenticated; grant execute on function public.crm_reconcile_fiscal_issuance(uuid,uuid,text,integer,text,text) to service_role;

-- 2. Reclamo con credenciales. Todo ocurre dentro de la misma transacción y bajo el candado de conexión.
create or replace function public.crm_fiscal_claim_with_credentials(
  p_business_id uuid, p_sale_id uuid, p_operation_id text
) returns jsonb
language plpgsql
security invoker
set search_path = public, fiscal
as $$
declare
  v_cred fiscal.business_credentials%rowtype;
  v_issuer_provider text;
begin
  if p_business_id is null or p_sale_id is null or nullif(trim(coalesce(p_operation_id, '')), '') is null then
    raise exception 'Invalid fiscal issuance claim';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('fiscal_connection:' || p_business_id::text, 0));

  select * into v_cred from fiscal.business_credentials c where c.business_id = p_business_id;
  if not found then
    raise exception 'FISCAL_CREDENTIALS_MISSING';
  end if;

  select i.provider into v_issuer_provider from fiscal.issuers i where i.business_id = p_business_id;
  if v_issuer_provider is null
     or fiscal.ledger_provider(v_issuer_provider) is null
     or v_issuer_provider <> v_cred.provider then
    raise exception 'FISCAL_PROVIDER_MISMATCH';
  end if;

  if not public.crm_claim_fiscal_issuance(p_business_id, p_sale_id, p_operation_id, 39) then
    return jsonb_build_object('claimed', false);
  end if;

  update public.crm_fiscal_issuances
     set provider = fiscal.ledger_provider(v_issuer_provider), updated_at = now()
   where business_id = p_business_id and sale_id = p_sale_id and dte_type = 39
     and operation_id = p_operation_id and status = 'sending';

  return jsonb_build_object('claimed', true, 'credentials', jsonb_build_object(
    'provider', v_cred.provider,
    'key_version', v_cred.key_version,
    'ciphertext', encode(v_cred.ciphertext, 'base64'),
    'iv', encode(v_cred.iv, 'base64'),
    'auth_tag', encode(v_cred.auth_tag, 'base64')));
end;
$$;

-- 3. Liberación de un reclamo SIN llamada al proveedor. Solo sending -> pending.
create or replace function public.crm_fiscal_release_claim(
  p_business_id uuid, p_sale_id uuid, p_operation_id text
) returns boolean
language plpgsql
security invoker
set search_path = public, fiscal
as $$
declare v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('fiscal_sale:' || p_sale_id::text, 0));
  update public.crm_fiscal_issuances
     set status = 'pending', updated_at = now()
   where business_id = p_business_id and sale_id = p_sale_id and dte_type = 39
     and operation_id = p_operation_id and status = 'sending';
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function public.crm_fiscal_claim_with_credentials(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.crm_fiscal_release_claim(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.crm_fiscal_claim_with_credentials(uuid, uuid, text) to service_role;
grant execute on function public.crm_fiscal_release_claim(uuid, uuid, text) to service_role;

commit;
