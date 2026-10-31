-- Preserve a DTE Core folio when the document remains unreconciled.
-- Only service_role may execute these RPCs; this migration never emits DTEs.
create or replace function public.crm_finalize_fiscal_issuance(
  p_business_id uuid, p_sale_id uuid, p_operation_id text,
  p_status text, p_folio integer default null,
  p_xml_base64 text default null, p_pdf_base64 text default null
) returns boolean language plpgsql security invoker set search_path = public as $$
declare v_count integer;
begin
  if p_status is null or p_status not in ('issued', 'unknown')
     or (p_folio is not null and p_folio <= 0)
     or (p_status = 'issued' and (p_folio is null or
         nullif(p_xml_base64, '') is null or nullif(p_pdf_base64, '') is null)) then
    raise exception 'Invalid fiscal outcome';
  end if;
  update public.crm_fiscal_issuances
     set status = p_status, folio = p_folio,
         xml_base64 = case when p_status = 'issued' then p_xml_base64 else null end,
         pdf_base64 = case when p_status = 'issued' then p_pdf_base64 else null end,
         updated_at = now()
   where business_id = p_business_id and sale_id = p_sale_id
     and operation_id = p_operation_id and status = 'sending'
     and provider = 'siisolutions' and dte_type = 39;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;
revoke all on function public.crm_finalize_fiscal_issuance(uuid,uuid,text,text,integer,text,text) from public, anon, authenticated;
grant execute on function public.crm_finalize_fiscal_issuance(uuid,uuid,text,text,integer,text,text) to service_role;

-- A verified original document cannot replace an already-known folio.
create or replace function public.crm_reconcile_fiscal_issuance(
  p_business_id uuid, p_sale_id uuid, p_operation_id text,
  p_folio integer, p_xml_base64 text, p_pdf_base64 text
) returns boolean language plpgsql security invoker set search_path = public as $$
declare v_count integer;
begin
  if p_business_id is null or p_sale_id is null or
     nullif(trim(p_operation_id), '') is null or
     p_folio is null or p_folio <= 0 or
     nullif(trim(p_xml_base64), '') is null or
     nullif(trim(p_pdf_base64), '') is null then
    raise exception 'Invalid original fiscal document';
  end if;
  update public.crm_fiscal_issuances
     set status = 'issued', folio = p_folio,
         xml_base64 = p_xml_base64, pdf_base64 = p_pdf_base64,
         error_code = null, updated_at = now()
   where business_id = p_business_id and sale_id = p_sale_id
     and operation_id = p_operation_id and dte_type = 39
     and provider = 'siisolutions' and status = 'unknown'
     and (folio is null or folio = p_folio);
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;
revoke all on function public.crm_reconcile_fiscal_issuance(uuid,uuid,text,integer,text,text) from public, anon, authenticated;
grant execute on function public.crm_reconcile_fiscal_issuance(uuid,uuid,text,integer,text,text) to service_role;
