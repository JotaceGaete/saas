create or replace function public.sii_pilot_verify_line_tax(p_business_id uuid,p_sale_id uuid,p_invoice_item_id uuid,p_category text,p_evidence text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_sale record; v_item record;
begin
 if p_business_id is distinct from 'cda904a1-e331-4bd4-9f33-a6715687d3dd'::uuid then raise exception 'PILOT_ONLY'; end if;
 if p_category is null or p_category not in ('IVA_AFECTO_19','EXENTO') or length(trim(coalesce(p_evidence,'')))<15 or length(p_evidence)>1500
 then raise exception 'EXPLICIT_TAX_EVIDENCE_REQUIRED'; end if;
 select s.id,s.status,s.paid_at,s.total into v_sale from public.crm_invoices s
 where s.id=p_sale_id and s.business_id=p_business_id for update;
 if not found or v_sale.status is distinct from 'pagada' or v_sale.paid_at is null or coalesce(v_sale.total,0)<=0
 then raise exception 'SALE_NOT_SETTLED'; end if;
 select i.id into v_item from public.crm_invoice_items i
 where i.id=p_invoice_item_id and i.invoice_id=p_sale_id for update;
 if not found then raise exception 'SALE_LINE_NOT_FOUND'; end if;
 if exists(select 1 from fiscal.operations o where o.sale_id=p_sale_id
 and o.business_id=p_business_id and o.status not in ('pending','cancelled'))
 then raise exception 'FISCAL_OPERATION_ALREADY_STARTED'; end if;
 insert into fiscal.line_tax_verifications(business_id,sale_id,invoice_item_id,category,verified,evidence,verified_at)
 values(p_business_id,p_sale_id,p_invoice_item_id,p_category,true,trim(p_evidence),now())
 on conflict (business_id,sale_id,invoice_item_id) do update
 set category=excluded.category,verified=true,evidence=excluded.evidence,verified_at=now();
 return jsonb_build_object('verified',true,'itemId',p_invoice_item_id,'category',p_category,'emissionEnabled',false);
end $$;
revoke all on function public.sii_pilot_verify_line_tax(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.sii_pilot_verify_line_tax(uuid,uuid,uuid,text,text) to service_role;