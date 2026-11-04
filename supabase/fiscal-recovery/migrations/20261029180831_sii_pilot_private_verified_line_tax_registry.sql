create table if not exists fiscal.line_tax_verifications (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null,
 sale_id uuid not null,
 invoice_item_id uuid not null,
 category text not null check (category in ('IVA_AFECTO_19','EXENTO','NO_CLASIFICADO')),
 verified boolean not null default false,
 evidence text,
 verified_at timestamptz,
 created_at timestamptz not null default now(),
 unique(business_id,sale_id,invoice_item_id),
 check (not verified or (category <> 'NO_CLASIFICADO' and nullif(trim(evidence),'') is not null and verified_at is not null))
);
alter table fiscal.line_tax_verifications enable row level security;
revoke all on fiscal.line_tax_verifications from public,anon,authenticated;
grant select,insert,update on fiscal.line_tax_verifications to service_role;
create or replace function public.sii_pilot_tax_mapping_status(p_business_id uuid,p_sale_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_items int; v_verified int; v_unsupported int;
begin
 if p_business_id <> 'cda904a1-e331-4bd4-9f33-a6715687d3dd'::uuid then
  raise exception 'PILOT_ONLY' using errcode='P0001';
 end if;
 if not exists (select 1 from public.crm_invoices where id=p_sale_id and business_id=p_business_id)
 then raise exception 'SALE_NOT_FOUND' using errcode='P0001'; end if;
 select count(*) into v_items from public.crm_invoice_items where invoice_id=p_sale_id;
 select count(*),count(*) filter (where m.category<>'IVA_AFECTO_19')
 into v_verified,v_unsupported
 from public.crm_invoice_items i
 join fiscal.line_tax_verifications m on m.invoice_item_id=i.id and m.sale_id=p_sale_id
 and m.business_id=p_business_id and m.verified=true
 where i.invoice_id=p_sale_id;
 return jsonb_build_object('itemCount',v_items,'verifiedItemCount',v_verified,
 'allAffected19Verified',v_items>0 and v_items=v_verified and v_unsupported=0,
 'emissionEnabled',false);
end $$;
revoke all on function public.sii_pilot_tax_mapping_status(uuid,uuid) from public,anon,authenticated;
grant execute on function public.sii_pilot_tax_mapping_status(uuid,uuid) to service_role;