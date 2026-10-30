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

-- Deliberately no trigger here. The current POS sale RPC is also used by
-- Mercado Pago Point; a generic crm_invoices trigger would enqueue Point sales.
-- A separate, verified payment-provenance gate must be integrated before
-- enqueueing fiscal work. This migration cannot emit or enqueue any DTE.
