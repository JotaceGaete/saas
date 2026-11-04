create or replace function public.sii_pilot_fiscal_status(p_business_id uuid,p_sale_id uuid)
returns jsonb language plpgsql security definer
set search_path = '' as $$
declare v_issuer fiscal.issuers%rowtype; v_operation fiscal.operations%rowtype;
begin
 if p_business_id <> 'cda904a1-e331-4bd4-9f33-a6715687d3dd'::uuid then
   return jsonb_build_object('issuerRegistered',false,'issuerVerified',false,'issuerEnabled',false,'operationStatus',null);
 end if;
 select * into v_issuer from fiscal.issuers where business_id=p_business_id;
 select * into v_operation from fiscal.operations where business_id=p_business_id and sale_id=p_sale_id and document_type=39;
 return jsonb_build_object('issuerRegistered',found or v_issuer.business_id is not null,
   'issuerVerified',coalesce(v_issuer.verified,false),'issuerEnabled',coalesce(v_issuer.enabled,false),
   'issuerRutMatches',coalesce(v_issuer.issuer_rut='77804207-K',false),
   'operationStatus',v_operation.status,'folio',v_operation.folio);
end $$;
revoke all on function public.sii_pilot_fiscal_status(uuid,uuid) from public,anon,authenticated;
grant execute on function public.sii_pilot_fiscal_status(uuid,uuid) to service_role;