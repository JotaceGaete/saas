-- Defense-in-depth: never transition a DTE39 into submitting without
-- a verified, evidenced tax classification for EVERY immutable invoice line.
-- This migration does not enable any issuer or send any DTE.
alter table fiscal.line_tax_verifications add column if not exists line_fingerprint text;
-- Previous evidence has no fingerprint and must be explicitly reverified.

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
 -- Lock sale lines against edits while checking their fingerprints and claiming submission.
 perform 1 from public.crm_invoice_items where invoice_id=v_sale.id for share;
 select count(*) into v_lines from public.crm_invoice_items where invoice_id=v_sale.id;
 if v_lines=0 then raise exception 'SALE_WITHOUT_LINES'; end if;
 select count(*) into v_verified
 from public.crm_invoice_items i
 join fiscal.line_tax_verifications t
  on t.invoice_item_id=i.id and t.sale_id=v_sale.id and t.business_id=v_op.business_id
 where i.invoice_id=v_sale.id and t.verified is true
  and t.category in ('IVA_AFECTO_19','EXENTO')
  and length(trim(coalesce(t.evidence,'')))>=15
  and t.line_fingerprint = md5(jsonb_build_array(i.product_id,i.name,i.description,i.unit_price,i.quantity,i.discount_pct,i.subtotal,i.sort_order,i.discount_type)::text);
 if v_verified<>v_lines then raise exception 'TAX_LINES_NOT_FULLY_VERIFIED'; end if;
 update fiscal.operations set status='submitting',updated_at=now()
 where id=v_op.id and status='pending' returning * into v_op;
 if not found then raise exception 'CLAIM_CONFLICT'; end if;
 return jsonb_build_object('operationId',v_op.id,'operationKey',v_op.operation_key,
  'status',v_op.status,'emissionAuthorized',true);
end $function$;
revoke all on function public.sii_pilot_begin_submission(uuid) from public, anon, authenticated;
grant execute on function public.sii_pilot_begin_submission(uuid) to service_role;

-- A verified category applies to the exact invoiced line, not merely its UUID.
create or replace function public.sii_pilot_verify_line_tax(p_business_id uuid,p_sale_id uuid,p_invoice_item_id uuid,p_category text,p_evidence text)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_sale record; v_item public.crm_invoice_items%rowtype; v_fingerprint text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
 if p_business_id is distinct from 'cda904a1-e331-4bd4-9f33-a6715687d3dd'::uuid then raise exception 'PILOT_ONLY'; end if;
 if p_category is null or p_category not in ('IVA_AFECTO_19','EXENTO') or length(trim(coalesce(p_evidence,'')))<15 or length(p_evidence)>1500 then raise exception 'EXPLICIT_TAX_EVIDENCE_REQUIRED'; end if;
 select s.id,s.status,s.paid_at,s.total into v_sale from public.crm_invoices s where s.id=p_sale_id and s.business_id=p_business_id for update;
 if not found or v_sale.status is distinct from 'pagada' or v_sale.paid_at is null or coalesce(v_sale.total,0)<=0 then raise exception 'SALE_NOT_SETTLED'; end if;
 select * into v_item from public.crm_invoice_items i where i.id=p_invoice_item_id and i.invoice_id=p_sale_id for share;
 if not found then raise exception 'SALE_LINE_NOT_FOUND'; end if;
 if exists(select 1 from fiscal.operations o where o.sale_id=p_sale_id and o.business_id=p_business_id and o.status not in ('pending','cancelled')) then raise exception 'FISCAL_OPERATION_ALREADY_STARTED'; end if;
 v_fingerprint:=md5(jsonb_build_array(v_item.product_id,v_item.name,v_item.description,v_item.unit_price,v_item.quantity,v_item.discount_pct,v_item.subtotal,v_item.sort_order,v_item.discount_type)::text);
 insert into fiscal.line_tax_verifications(business_id,sale_id,invoice_item_id,category,verified,evidence,verified_at,line_fingerprint)
 values(p_business_id,p_sale_id,p_invoice_item_id,p_category,true,trim(p_evidence),now(),v_fingerprint)
 on conflict (business_id,sale_id,invoice_item_id) do update set category=excluded.category,verified=true,evidence=excluded.evidence,verified_at=now(),line_fingerprint=excluded.line_fingerprint;
 return jsonb_build_object('verified',true,'itemId',p_invoice_item_id,'category',p_category,'emissionEnabled',false);
end $function$;
revoke all on function public.sii_pilot_verify_line_tax(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.sii_pilot_verify_line_tax(uuid,uuid,uuid,text,text) to service_role;
