-- DTE39 TPV outbox: durable, private, and inert until a reviewed worker exists.
-- No provider calls, no fiscal issuance, no Point integration.
create schema if not exists fiscal;
create table if not exists fiscal.pos_dte39_outbox (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  invoice_id uuid not null,
  document_type smallint not null default 39 check (document_type = 39),
  operation_id text not null,
  state text not null default 'pending'
    check (state in ('pending','claimed','unknown','issued','failed','skipped')),
  folio bigint,
  provider_response jsonb,
  last_error text,
  attempts integer not null default 0 check (attempts >= 0),
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_dte39_outbox_invoice_unique unique (business_id, invoice_id, document_type),
  constraint pos_dte39_outbox_operation_unique unique (operation_id)
);
create index if not exists pos_dte39_outbox_pending_idx
  on fiscal.pos_dte39_outbox(created_at) where state = 'pending';
revoke all on fiscal.pos_dte39_outbox from public, anon, authenticated;
alter table fiscal.pos_dte39_outbox enable row level security;

create or replace function fiscal.enqueue_paid_pos_dte39()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, fiscal
as $$
begin
  -- The fiscal worker will separately validate issuer, provider, tax lines and
  -- payment provenance; queued does NOT mean eligible or issued.
  if new.source = 'pos' and new.status = 'pagada' and new.paid_at is not null
     and exists (
       select 1 from public.wa_businesses b
       where b.id = new.business_id and b.country_code = 'CL'
     )
  then
    insert into fiscal.pos_dte39_outbox(business_id,invoice_id,operation_id)
    values(new.business_id,new.id,'WALINKA-DTE39-' || new.id::text)
    on conflict (business_id,invoice_id,document_type) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function fiscal.enqueue_paid_pos_dte39() from public, anon, authenticated;
drop trigger if exists crm_invoice_paid_pos_dte39_enqueue on public.crm_invoices;
create trigger crm_invoice_paid_pos_dte39_enqueue
  after insert or update of status, paid_at on public.crm_invoices
  for each row execute function fiscal.enqueue_paid_pos_dte39();
