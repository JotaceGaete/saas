-- Harden fiscal pending registration. Apply separately after review; no provider calls.
-- The database gate supplements, but does not replace, live MP verification in the sweeper.
create or replace function public.crm_fiscal_register_pending(
  p_business_id uuid, p_sale_id uuid, p_operation_id text, p_dte_type integer default 39
) returns boolean language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  if p_dte_type is distinct from 39
     or nullif(trim(p_operation_id), '') is null
     or not exists (
       select 1 from public.crm_invoices i
       where i.id = p_sale_id and i.business_id = p_business_id
         and i.status = 'pagada' and i.total > 0
     )
     or not exists (
       select 1 from public.crm_pos_point_operations o
       where o.business_id = p_business_id and o.crm_invoice_id = p_sale_id
         and o.mp_status = 'processed' and o.mp_order_id is not null
         and o.finalized_at is not null and o.currency = 'CLP'
     )
     or (select count(*) from public.crm_pos_point_operations o
         where o.business_id = p_business_id and o.crm_invoice_id = p_sale_id) <> 1
  then
    raise exception 'Invalid fiscal Point pending registration';
  end if;
  insert into public.crm_fiscal_issuances (business_id, sale_id, operation_id, dte_type, status)
  values (p_business_id, p_sale_id, p_operation_id, p_dte_type, 'pending')
  on conflict do nothing returning id into v_id;
  return v_id is not null;
end;
$$;
revoke all on function public.crm_fiscal_register_pending(uuid,uuid,text,integer) from public, anon, authenticated;
grant execute on function public.crm_fiscal_register_pending(uuid,uuid,text,integer) to service_role;
