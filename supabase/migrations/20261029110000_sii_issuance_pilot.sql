-- Pilot fiscal issuance ledger. No automatic emission is enabled.
-- Composite invoice key prevents cross-business fiscal ledger rows even from
-- privileged writers that bypass application validation.
create unique index if not exists crm_invoices_id_business_fiscal_key
  on public.crm_invoices (id, business_id);
create table if not exists public.crm_fiscal_issuances (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.wa_businesses(id),
  sale_id uuid not null,
  constraint crm_fiscal_sale_business_fk foreign key (sale_id, business_id)
    references public.crm_invoices(id, business_id),
  provider text not null default 'siisolutions' check (provider = 'siisolutions'),
  dte_type integer not null default 39 check (dte_type = 39),
  operation_id text not null,
  status text not null default 'pending' check (status in ('pending','sending','unknown','issued','failed','cancelled')),
  folio integer,
  xml_base64 text,
  pdf_base64 text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, sale_id, dte_type),
  unique (business_id, operation_id, dte_type)
);
create index if not exists crm_fiscal_issuances_status_idx on public.crm_fiscal_issuances (business_id, status, created_at);
alter table public.crm_fiscal_issuances enable row level security;
-- Intentionally no client policies: all writes require trusted backend.
revoke all on public.crm_fiscal_issuances from anon, authenticated;
comment on table public.crm_fiscal_issuances is 'Server-only issuance ledger. Unknown means reconciliation required before any retry; never automatically reissue.';

-- Atomic claim: only a newly inserted pending operation may transition to sending.
-- Existing operations, including unknown, must never be resent automatically.
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
  on conflict (business_id, sale_id, dte_type) do nothing
  returning id into v_id;
  return v_id is not null;
end;
$$;
revoke all on function public.crm_claim_fiscal_issuance(uuid,uuid,text,integer) from public, anon, authenticated;
grant execute on function public.crm_claim_fiscal_issuance(uuid,uuid,text,integer) to service_role;

create or replace function public.crm_finalize_fiscal_issuance(
  p_business_id uuid, p_sale_id uuid, p_operation_id text,
  p_status text, p_folio integer default null,
  p_xml_base64 text default null, p_pdf_base64 text default null
) returns boolean language plpgsql security invoker set search_path = public as $$
declare v_count integer;
begin
  if p_status is null or p_status not in ('issued', 'unknown') or
     (p_status = 'issued' and (p_folio is null or p_folio <= 0 or
       nullif(p_xml_base64, '') is null or nullif(p_pdf_base64, '') is null)) then
    raise exception 'Invalid fiscal outcome';
  end if;
  update public.crm_fiscal_issuances
  set status = p_status, folio = case when p_status = 'issued' then p_folio else null end,
      xml_base64 = case when p_status = 'issued' then p_xml_base64 else null end,
      pdf_base64 = case when p_status = 'issued' then p_pdf_base64 else null end,
      updated_at = now()
  where business_id = p_business_id and sale_id = p_sale_id
    and operation_id = p_operation_id and status = 'sending';
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;
revoke all on function public.crm_finalize_fiscal_issuance(uuid,uuid,text,text,integer,text,text) from public, anon, authenticated;
grant execute on function public.crm_finalize_fiscal_issuance(uuid,uuid,text,text,integer,text,text) to service_role;
