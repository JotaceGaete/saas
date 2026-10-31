-- Run ONLY in the disposable CI database, after fixture + migration.
do $$
declare
  business_a uuid := '11111111-1111-4111-8111-111111111111';
  business_b uuid := '22222222-2222-4222-8222-222222222222';
  sale_a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  claimed boolean;
begin
  if has_table_privilege('anon','public.crm_fiscal_issuances','select')
     or has_table_privilege('authenticated','public.crm_fiscal_issuances','select') then
    raise exception 'Fiscal ledger exposed to browser roles';
  end if;
  if has_function_privilege('anon','public.crm_claim_fiscal_issuance(uuid,uuid,text,integer)','execute')
     or has_function_privilege('authenticated','public.crm_claim_fiscal_issuance(uuid,uuid,text,integer)','execute') then
    raise exception 'Fiscal claim exposed to browser roles';
  end if;
  begin
    perform public.crm_claim_fiscal_issuance(business_b,sale_a,'wrong-business',39);
    raise exception 'Cross-tenant claim was accepted';
  exception when raise_exception then
    if sqlerrm = 'Cross-tenant claim was accepted' then raise; end if;
  end;
  begin
    perform public.crm_claim_fiscal_issuance(business_a,sale_a,'invalid-dte',null);
    raise exception 'Null DTE was accepted';
  exception when raise_exception then
    if sqlerrm = 'Null DTE was accepted' then raise; end if;
  end;
  claimed := public.crm_claim_fiscal_issuance(business_a,sale_a,'operation-1',39);
  if claimed is distinct from true then raise exception 'Initial claim failed'; end if;
  claimed := public.crm_claim_fiscal_issuance(business_a,sale_a,'operation-1',39);
  if claimed is distinct from false then raise exception 'Duplicate claim accepted'; end if;
  begin
    perform public.crm_finalize_fiscal_issuance(business_a,sale_a,'operation-1',null,null,null,null);
    raise exception 'Null final state accepted';
  exception when raise_exception then
    if sqlerrm = 'Null final state accepted' then raise; end if;
  end;
  begin
    perform public.crm_finalize_fiscal_issuance(business_a,sale_a,'operation-1','issued',123,'xml',null);
    raise exception 'Missing PDF accepted';
  exception when raise_exception then
    if sqlerrm = 'Missing PDF accepted' then raise; end if;
  end;
  if public.crm_finalize_fiscal_issuance(business_a,sale_a,'operation-1','unknown',null,null,null) is distinct from true then
    raise exception 'Unknown finalization failed';
  end if;
  if public.crm_finalize_fiscal_issuance(business_a,sale_a,'operation-1','issued',123,'xml','pdf') is distinct from false then
    raise exception 'Unknown state was overwritten';
  end if;
  if public.crm_claim_fiscal_issuance(business_a,sale_a,'operation-1',39) is distinct from false then
    raise exception 'Unknown operation was reissued';
  end if;
end $$;
