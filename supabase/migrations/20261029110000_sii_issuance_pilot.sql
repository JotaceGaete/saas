-- Pilot fiscal issuance ledger. No automatic emission is enabled.
create table if not exists public.crm_fiscal_issuances (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null, -- FK pending confirmation of canonical business table
  sale_id uuid not null,
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
