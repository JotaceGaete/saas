create or replace function public.sii_pilot_claim_operation(p_business_id uuid,p_sale_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_issuer fiscal.issuers%rowtype; v_sale public.crm_invoices%rowtype; v_op fiscal.operations%rowtype;
begin
 if p_business_id is distinct from 'cda904a1-e331-4bd4-9f33-a6715687d3dd'::uuid then
   raise exception 'PILOT_BUSINESS_NOT_ALLOWED' using errcode='P0001';
 end if;
 select * into v_issuer from fiscal.issuers where business_id=p_business_id for update;
 if not found or v_issuer.issuer_rut <> '77804207-K' or v_issuer.provider <> 'sii_solutions' then
   raise exception 'ISSUER_NOT_CONFIGURED' using errcode='P0001';
 end if;
 select * into v_sale from public.crm_invoices where id=p_sale_id and business_id=p_business_id for share;
 if not found or v_sale.status <> 'pagada' or v_sale.paid_at is null or v_sale.total <= 0 then
   raise exception 'SALE_NOT_ELIGIBLE' using errcode='P0001';
 end if;
 insert into fiscal.operations(business_id,sale_id,issuer_rut,document_type,operation_key,status,snapshot)
 values(p_business_id,p_sale_id,v_issuer.issuer_rut,39,p_business_id::text||':'||p_sale_id::text||':39','pending',
 jsonb_build_object('sale_id',v_sale.id,'business_id',v_sale.business_id,'total',v_sale.total,'paid_at',v_sale.paid_at,'sale_status',v_sale.status))
 on conflict (business_id,sale_id,document_type) do nothing;
 select * into v_op from fiscal.operations where business_id=p_business_id and sale_id=p_sale_id and document_type=39;
 return jsonb_build_object('operationId',v_op.id,'operationKey',v_op.operation_key,'status',v_op.status,'folio',v_op.folio,'emissionEnabled',false,'issuerVerified',v_issuer.verified,'issuerEnabled',v_issuer.enabled);
end $$;
revoke all on function public.sii_pilot_claim_operation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.sii_pilot_claim_operation(uuid,uuid) to service_role;