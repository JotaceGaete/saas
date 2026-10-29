-- Defense-in-depth: never transition a DTE39 into submitting without
-- a verified, evidenced tax classification for EVERY immutable invoice line.
-- This migration does not enable any issuer or send any DTE.
create or replace function public.sii_pilot_begin_submission(p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
 v_op fiscal.operations%rowtype;
 v_issuer fiscal.issuers%rowtype;
 v_sale public.crm_invoices%rowtype;
 v_lines bigint;
 v_verified bigint;
begin
 if auth.role() is distinct from 'service_role' then
  raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';
 end if;
 select * into v_op from fiscal.operations where id=p_operation_id for update;
 if not found or v_op.business_id <> 'cda904a1-e331-4bd4-9f33-a6715687d3dd'::uuid
  or v_op.issuer_rut <> '77804207-K' or v_op.document_type <> 39 then
  raise exception 'PILOT_OPERATION_NOT_ALLOWED';
 end if;
 select * into v_issuer from fiscal.issuers where business_id=v_op.business_id;
 if not found or v_issuer.enabled is distinct from true or v_issuer.verified is distinct from true
  or v_issuer.issuer_rut <> v_op.issuer_rut or v_issuer.provider <> 'sii_solutions' then
  raise exception 'ISSUER_NOT_VERIFIED_OR_ENABLED';
 end if;
 select * into v_sale from public.crm_invoices where id=v_op.sale_id and business_id=v_op.business_id for update;
 if not found or v_sale.status <> 'pagada' or v_sale.paid_at is null or v_sale.total <= 0 then
  raise exception 'SALE_NOT_ELIGIBLE';
 end if;
 if v_op.status <> 'pending' then raise exception 'OPERATION_ALREADY_CLAIMED_OR_FINAL'; end if;
 select count(*) into v_lines from public.crm_invoice_items where invoice_id=v_sale.id;
 if v_lines=0 then raise exception 'SALE_WITHOUT_LINES'; end if;
 select count(*) into v_verified
 from public.crm_invoice_items i
 join fiscal.line_tax_verifications t
  on t.invoice_item_id=i.id and t.sale_id=v_sale.id and t.business_id=v_op.business_id
 where i.invoice_id=v_sale.id and t.verified is true
  and t.category in ('IVA_AFECTO_19','EXENTO')
  and length(trim(coalesce(t.evidence,'')))>=15;
 if v_verified<>v_lines then raise exception 'TAX_LINES_NOT_FULLY_VERIFIED'; end if;
 update fiscal.operations set status='submitting',updated_at=now()
 where id=v_op.id and status='pending' returning * into v_op;
 if not found then raise exception 'CLAIM_CONFLICT'; end if;
 return jsonb_build_object('operationId',v_op.id,'operationKey',v_op.operation_key,
  'status',v_op.status,'emissionAuthorized',true);
end $function$;
revoke all on function public.sii_pilot_begin_submission(uuid) from public, anon, authenticated;
grant execute on function public.sii_pilot_begin_submission(uuid) to service_role;
