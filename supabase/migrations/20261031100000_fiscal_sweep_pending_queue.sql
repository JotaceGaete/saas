-- NOT APPLIED. Reviewed in PR only; applying to any database requires explicit approval.
-- Adds a server-only "pending" queue state for paid Point sales detected by the sweep.
-- A pending row never sends anything to the provider. Emission happens only through
-- the guarded claim below, which promotes pending -> sending atomically.
-- Unknown, sending, issued, failed and cancelled rows are never touched by the claim.

create or replace function public.crm_fiscal_register_pending(
  p_business_id uuid, p_sale_id uuid, p_operation_id text, p_dte_type integer default 39
) returns boolean language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  if p_dte_type is distinct from 39 or nullif(trim(p_operation_id), '') is null or
     not exists (select 1 from public.crm_invoices i where i.id = p_sale_id and i.business_id = p_business_id) then
    raise exception 'Invalid fiscal pending registration';
  end if;
  insert into public.crm_fiscal_issuances (business_id, sale_id, operation_id, dte_type, status)
  values (p_business_id, p_sale_id, p_operation_id, p_dte_type, 'pending')
  on conflict do nothing
  returning id into v_id;
  return v_id is not null;
end;
$$;
revoke all on function public.crm_fiscal_register_pending(uuid,uuid,text,integer) from public, anon, authenticated;
grant execute on function public.crm_fiscal_register_pending(uuid,uuid,text,integer) to service_role;

-- Replaces the claim: insert a new 'sending' row, or promote an existing 'pending' row
-- with the same operation. Any other existing state (sending, unknown, issued, failed,
-- cancelled, or a different operation) is rejected without modification.
create or replace function public.crm_claim_fiscal_issuance(
  p_business_id uuid, p_sale_id uuid, p_operation_id text, p_dte_type integer default 39
) returns boolean language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  if p_dte_type is distinct from 39 or nullif(trim(p_operation_id), '') is null or
     not exists (select 1 from public.crm_invoices i where i.id = p_sale_id and i.business_id = p_business_id) then
    raise exception 'Invalid fiscal issuance claim';
  end if;
  insert into public.crm_fiscal_issuances (business_id, sale_id, operation_id, dte_type, status)
  values (p_business_id, p_sale_id, p_operation_id, p_dte_type, 'sending')
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    update public.crm_fiscal_issuances
    set status = 'sending', updated_at = now()
    where business_id = p_business_id and sale_id = p_sale_id and dte_type = p_dte_type
      and operation_id = p_operation_id and status = 'pending'
    returning id into v_id;
  end if;
  return v_id is not null;
end;
$$;
revoke all on function public.crm_claim_fiscal_issuance(uuid,uuid,text,integer) from public, anon, authenticated;
grant execute on function public.crm_claim_fiscal_issuance(uuid,uuid,text,integer) to service_role;
