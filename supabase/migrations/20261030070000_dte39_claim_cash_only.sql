-- Defense in depth: even with global authorization, never claim card vouchers
-- or invoices lacking a verified issuer. Cash-only until voucher rules are approved.
create or replace function public.sii_pos_dte39_claim_next()
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,fiscal as $$
declare j fiscal.pos_dte39_outbox%rowtype;
begin
 if auth.role() is distinct from 'service_role' then
   raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';
 end if;
 if not exists(select 1 from fiscal.dte39_emission_control
   where singleton=true and enabled=true and payment_voucher_policy_approved=true)
 then return null; end if;
 select o.* into j from fiscal.pos_dte39_outbox o
 join public.crm_invoices i on i.id=o.invoice_id and i.business_id=o.business_id
 join public.wa_businesses b on b.id=o.business_id and b.country_code='CL'
 join fiscal.issuers s on s.business_id=o.business_id and s.enabled=true and s.verified=true
 join fiscal.business_tax_defaults t on t.business_id=o.business_id
   and t.confirmed_by_owner=true and t.default_is_exempt=false
 where o.state='pending' and o.document_type=39
   and i.source='pos' and i.status='pagada' and i.paid_at is not null
   and exists(select 1 from public.crm_payments p
     where p.invoice_id=i.id and p.business_id=i.business_id
       and p.payment_method='cash' and p.payment_status='received' and p.voided_at is null)
   and not exists(select 1 from public.crm_payments p
     where p.invoice_id=i.id and p.business_id=i.business_id
       and (p.payment_method is distinct from 'cash'
         or p.payment_status is distinct from 'received' or p.voided_at is not null))
 order by o.created_at,o.id for update of o skip locked limit 1;
 if not found then return null; end if;
 update fiscal.pos_dte39_outbox set state='claimed',attempts=attempts+1,
   claimed_at=clock_timestamp(),updated_at=clock_timestamp() where id=j.id;
 return jsonb_build_object('jobId',j.id,'businessId',j.business_id,
   'invoiceId',j.invoice_id,'operationId',j.operation_id,'documentType',j.document_type);
end; $$;
revoke all on function public.sii_pos_dte39_claim_next() from public,anon,authenticated;
grant execute on function public.sii_pos_dte39_claim_next() to service_role;