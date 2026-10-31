create or replace function public.sii_pilot_preflight_sale(p_business_id uuid,p_sale_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_sale public.crm_invoices%rowtype; v_item record; v_pay record;
 v_sum numeric:=0; v_paid numeric:=0; v_items int:=0; v_payments int:=0;
 v_reason text:=null; v_issuer fiscal.issuers%rowtype;
begin
 if p_business_id <> 'cda904a1-e331-4bd4-9f33-a6715687d3dd'::uuid then
  raise exception 'PILOT_ONLY' using errcode='P0001';
 end if;
 select * into v_sale from public.crm_invoices where id=p_sale_id and business_id=p_business_id;
 if not found then raise exception 'SALE_NOT_FOUND' using errcode='P0001'; end if;
 select * into v_issuer from fiscal.issuers where business_id=p_business_id;
 if not found or v_issuer.issuer_rut <> '77804207-K' or v_issuer.provider <> 'sii_solutions' then
  raise exception 'ISSUER_NOT_REGISTERED' using errcode='P0001';
 end if;
 if v_sale.status <> 'pagada' or v_sale.paid_at is null or v_sale.total <= 0
    or v_sale.total <> trunc(v_sale.total) then v_reason:='SALE_NOT_SETTLED'; end if;
 if coalesce(v_sale.discount_amount,-1) <> 0 then v_reason:='DOCUMENT_DISCOUNT_NOT_SUPPORTED'; end if;
 for v_item in select * from public.crm_invoice_items where invoice_id=p_sale_id order by id loop
  v_items:=v_items+1;
  if nullif(trim(v_item.name),'') is null or v_item.quantity<=0 or
    v_item.unit_price<0 or v_item.unit_price<>trunc(v_item.unit_price) or
    v_item.subtotal<>v_item.quantity*v_item.unit_price or
    coalesce(v_item.discount_pct,-1)<>0 then v_reason:='INVALID_ITEM_OR_DISCOUNT'; end if;
  v_sum:=v_sum+coalesce(v_item.subtotal,0);
 end loop;
 if v_items=0 or v_sum<>v_sale.total then v_reason:='ITEM_TOTAL_MISMATCH'; end if;
 for v_pay in select * from public.crm_payments where invoice_id=p_sale_id order by id loop
  v_payments:=v_payments+1;
  if v_pay.business_id<>p_business_id or v_pay.payment_status<>'received'
    or v_pay.voided_at is not null or v_pay.payment_method<>'cash'
    or v_pay.amount<=0 or v_pay.amount<>trunc(v_pay.amount) then v_reason:='INVALID_CASH_PAYMENT'; end if;
  v_paid:=v_paid+coalesce(v_pay.amount,0);
 end loop;
 if v_payments=0 or v_paid<>v_sale.total then v_reason:='PAYMENT_TOTAL_MISMATCH'; end if;
 -- Tax verification is deliberately not inferred from product descriptions or CRM fields.
 return jsonb_build_object('eligible',false,'saleChecksPassed',v_reason is null,
   'reason',coalesce(v_reason,'TAX_MAPPING_NOT_VERIFIED'),
   'saleTotal',v_sale.total,'itemCount',v_items,'paymentCount',v_payments,
   'issuerVerified',v_issuer.verified,'issuerEnabled',v_issuer.enabled,
   'emissionEnabled',false);
end $$;
revoke all on function public.sii_pilot_preflight_sale(uuid,uuid) from public,anon,authenticated;
grant execute on function public.sii_pilot_preflight_sale(uuid,uuid) to service_role;