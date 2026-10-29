-- DESIGN DRAFT ONLY. Do not apply to Supabase or production.
-- Requires review against existing business/tenant keys and migration naming.
-- No direct grants or policies: intentionally deny all client access.
create table if not exists public.sii_pilot_documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  issuer_rut text not null,
  document_type integer not null check (document_type in (33,39,41,56,61)),
  folio bigint,
  issued_on date,
  gross_amount bigint check (gross_amount is null or gross_amount >= 0),
  exempt_amount bigint check (exempt_amount is null or exempt_amount >= 0),
  status text not null default 'draft' check (status in
    ('draft','pending_signature','signed','submitted','accepted','rejected','voided_folio')),
  sii_track_id text,
  source_sale_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sii_pilot_amounts_consistent check (
    gross_amount is null or exempt_amount is null or exempt_amount <= gross_amount
  ),
  constraint sii_pilot_folio_required check (
    status not in ('signed','submitted','accepted','rejected','voided_folio')
    or (folio is not null and folio > 0 and issued_on is not null)
  ),
  constraint sii_pilot_no_amount_on_void check (
    status <> 'voided_folio' or (gross_amount is null and exempt_amount is null)
  )
);
create unique index if not exists sii_pilot_unique_folio
 on public.sii_pilot_documents(issuer_rut,document_type,folio)
 where folio is not null;
create index if not exists sii_pilot_by_business_date
 on public.sii_pilot_documents(business_id,issued_on,document_type);
alter table public.sii_pilot_documents enable row level security;
revoke all on public.sii_pilot_documents from anon, authenticated;
-- No client policy. Backend write API must enforce tenant membership and
-- legal issuer authorization; service_role must never reach the browser.
-- Future review: tenant FK, immutable audit events, accepted-state transitions,
-- SII evidence, reconciliation and exact date of folio use.
