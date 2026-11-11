-- Explicit fiscal authorization gate: queue may accumulate, but no claim is allowed
-- until a reviewed payment/voucher policy is enabled by an administrator.
create table if not exists fiscal.dte39_emission_control (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  payment_voucher_policy_approved boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table fiscal.dte39_emission_control enable row level security;
revoke all on fiscal.dte39_emission_control from public, anon, authenticated;
insert into fiscal.dte39_emission_control(singleton,enabled,payment_voucher_policy_approved)
values(true,false,false) on conflict(singleton) do nothing;

create or replace function public.sii_pos_dte39_claim_next()
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, fiscal
as $$
declare v_job fiscal.pos_dte39_outbox%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from fiscal.dte39_emission_control
    where singleton=true and enabled=true and payment_voucher_policy_approved=true
  ) then return null; end if;
  select * into v_job from fiscal.pos_dte39_outbox
    where state='pending' order by created_at,id
    for update skip locked limit 1;
  if not found then return null; end if;
  update fiscal.pos_dte39_outbox
    set state='claimed',attempts=attempts+1,
        claimed_at=clock_timestamp(),updated_at=clock_timestamp()
    where id=v_job.id;
  return jsonb_build_object('jobId',v_job.id,'businessId',v_job.business_id,
    'invoiceId',v_job.invoice_id,'operationId',v_job.operation_id,'documentType',v_job.document_type);
end;
$$;
revoke all on function public.sii_pos_dte39_claim_next() from public,anon,authenticated;
grant execute on function public.sii_pos_dte39_claim_next() to service_role;
