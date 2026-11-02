-- Include tenant identity in the trusted fiscal issuer snapshot for cross-tenant dispatch validation.
create or replace function public.sii_pos_dte39_job_snapshot(p_job_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,fiscal as $$
declare v_job fiscal.pos_dte39_outbox%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
 select * into v_job from fiscal.pos_dte39_outbox where id=p_job_id;
 if not found then return null; end if;
 return jsonb_build_object(
  'job',jsonb_build_object('id',v_job.id,'business_id',v_job.business_id,'invoice_id',v_job.invoice_id,'operation_id',v_job.operation_id,'document_type',v_job.document_type,'state',v_job.state),
  'invoice',(select to_jsonb(i) from public.crm_invoices i where i.id=v_job.invoice_id and i.business_id=v_job.business_id),
  'business',(select jsonb_build_object('country_code',b.country_code) from public.wa_businesses b where b.id=v_job.business_id),
  'issuer',(select jsonb_build_object('business_id',s.business_id,'issuer_rut',s.issuer_rut,'enabled',s.enabled,'verified',s.verified) from fiscal.issuers s where s.business_id=v_job.business_id),
  'taxConfig',(select jsonb_build_object('default_is_exempt',t.default_is_exempt,'confirmed_by_owner',t.confirmed_by_owner) from fiscal.business_tax_defaults t where t.business_id=v_job.business_id),
  'items',coalesce((select jsonb_agg(jsonb_build_object('name',x.name,'description',x.description,'unit_price',x.unit_price,'quantity',x.quantity,'subtotal',x.subtotal) order by x.sort_order,x.id) from public.crm_invoice_items x where x.invoice_id=v_job.invoice_id),'[]'::jsonb),
  'payments',coalesce((select jsonb_agg(jsonb_build_object('payment_method',p.payment_method,'payment_status',p.payment_status,'amount',p.amount,'voided_at',p.voided_at) order by p.id) from public.crm_payments p where p.invoice_id=v_job.invoice_id and p.business_id=v_job.business_id),'[]'::jsonb)
 );
end; $$;
revoke all on function public.sii_pos_dte39_job_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.sii_pos_dte39_job_snapshot(uuid) to service_role;