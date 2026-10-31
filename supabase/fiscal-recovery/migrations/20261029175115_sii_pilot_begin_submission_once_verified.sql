create or replace function public.sii_pilot_begin_submission(p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_op fiscal.operations%rowtype; v_issuer fiscal.issuers%rowtype; v_sale public.crm_invoices%rowtype;
begin
 select * into v_op from fiscal.operations where id=p_operation_id for update;
 if not found or v_op.business_id <> 'cda904a1-e331-4bd4-9f33-a6715687d3dd'::uuid
   or v_op.issuer_rut <> '77804207-K' or v_op.document_type <> 39 then
   raise exception 'PILOT_OPERATION_NOT_ALLOWED' using errcode='P0001';
 end if;
 select * into v_issuer from fiscal.issuers where business_id=v_op.business_id;
 if not found or not v_issuer.enabled or not v_issuer.verified
   or v_issuer.issuer_rut <> v_op.issuer_rut or v_issuer.provider <> 'sii_solutions' then
   raise exception 'ISSUER_NOT_VERIFIED_OR_ENABLED' using errcode='P0001';
 end if;
 select * into v_sale from public.crm_invoices where id=v_op.sale_id and business_id=v_op.business_id;
 if not found or v_sale.status <> 'pagada' or v_sale.paid_at is null or v_sale.total <= 0 then
   raise exception 'SALE_NOT_ELIGIBLE' using errcode='P0001';
 end if;
 if v_op.status <> 'pending' then
   raise exception 'OPERATION_ALREADY_CLAIMED_OR_FINAL' using errcode='P0001';
 end if;
 update fiscal.operations set status='submitting',updated_at=now()
 where id=v_op.id and status='pending' returning * into v_op;
 if not found then raise exception 'CLAIM_CONFLICT' using errcode='P0001'; end if;
 return jsonb_build_object('operationId',v_op.id,'operationKey',v_op.operation_key,
 'status',v_op.status,'emissionAuthorized',true);
end $$;
revoke all on function public.sii_pilot_begin_submission(uuid) from public,anon,authenticated;
grant execute on function public.sii_pilot_begin_submission(uuid) to service_role;