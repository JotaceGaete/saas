-- Manual-only transition after the original provider document has been
-- independently retrieved and verified by a trusted backend operator.
-- Never calls the provider or sends another DTE.
create or replace function public.crm_reconcile_fiscal_issuance(
  p_business_id uuid, p_sale_id uuid, p_operation_id text,
  p_folio integer, p_xml_base64 text, p_pdf_base64 text
) returns boolean
language plpgsql security invoker set search_path = public as $$
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
  set status = 'issued',
      folio = p_folio,
      xml_base64 = p_xml_base64,
      pdf_base64 = p_pdf_base64,
      error_code = null,
      updated_at = now()
  where business_id = p_business_id
    and sale_id = p_sale_id
    and operation_id = p_operation_id
    and dte_type = 39
    and provider = 'siisolutions'
    and status = 'unknown';
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;
revoke all on function public.crm_reconcile_fiscal_issuance(uuid,uuid,text,integer,text,text)
  from public, anon, authenticated;
grant execute on function public.crm_reconcile_fiscal_issuance(uuid,uuid,text,integer,text,text)
  to service_role;
