-- OFFLINE DESIGN DRAFT ONLY. Do not apply to any database.
-- Companion to sii-pilot-documents-DRAFT.sql; not an approved migration.
-- The database owner/superuser can still alter this structure: "append-only"
-- means ordinary application roles cannot update or delete audit rows.
create table if not exists public.sii_pilot_document_events (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.sii_pilot_documents(id) on delete restrict,
  business_id uuid not null,
  previous_status text not null,
  next_status text not null,
  actor_id text not null check (length(btrim(actor_id)) > 0),
  occurred_at timestamptz not null default now(),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint sii_pilot_event_status_changed check (previous_status <> next_status),
  constraint sii_pilot_event_known_status check (
    previous_status in ('draft','pending_signature','signed','submitted','accepted','rejected','voided_folio')
    and next_status in ('draft','pending_signature','signed','submitted','accepted','rejected','voided_folio')
  ),
  constraint sii_pilot_event_transition_allowed check (
    (previous_status='draft' and next_status='pending_signature') or
    (previous_status='pending_signature' and next_status in ('draft','signed')) or
    (previous_status='signed' and next_status='submitted') or
    (previous_status='submitted' and next_status in ('accepted','rejected'))
  )
);
create index if not exists sii_pilot_events_document_time
  on public.sii_pilot_document_events(document_id,occurred_at,id);
create index if not exists sii_pilot_events_business_time
  on public.sii_pilot_document_events(business_id,occurred_at);
alter table public.sii_pilot_document_events enable row level security;
revoke all on public.sii_pilot_document_events from anon, authenticated;
-- No client-facing RLS policies, grants, or direct mutation endpoints.
-- A future trusted backend transaction must lock the document, verify tenant,
-- authorization, previous status, evidence, and append exactly one event
-- atomically with the status change. This draft does NOT enforce that atomicity.
create or replace function public.sii_pilot_reject_event_mutation()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  raise exception 'SII_PILOT_AUDIT_APPEND_ONLY';
end;
$$;
drop trigger if exists sii_pilot_events_no_update_delete on public.sii_pilot_document_events;
create trigger sii_pilot_events_no_update_delete
before update or delete on public.sii_pilot_document_events
for each row execute function public.sii_pilot_reject_event_mutation();
revoke all on function public.sii_pilot_reject_event_mutation() from public, anon, authenticated;
-- Review before deployment: prevent spoofed inserts, require document/business
-- matching, consider a private schema and privileged append-only RPC, audit
-- transitions within a single DB transaction, test under RLS.
