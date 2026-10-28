-- PROPOSAL ONLY: not applied to any database.
-- Execute on an isolated test database after reviewing existing business ID types.
-- A private schema avoids exposing fiscal records through the Supabase Data API.
begin;
create schema if not exists fiscal;
revoke all on schema fiscal from public, anon, authenticated;
create table if not exists fiscal.issuance_operations (
  id bigint generated always as identity primary key,
  business_id text not null check (length(business_id) between 1 and 128),
  sale_id text not null check (length(sale_id) between 1 and 128),
  issuer_rut text not null check (issuer_rut ~ '^[0-9]{1,8}-[0-9K]$'),
  document_type smallint not null check (document_type = 39),
  folio bigint check (folio > 0),
  status text not null default 'draft' check (status in
    ('draft','reserved','signed','submitting','submitted','accepted','rejected','unknown','cancelled')),
  track_id text,
  payload_sha256 text check (payload_sha256 is null or payload_sha256 ~ '^[a-f0-9]{64}$'),
  version bigint not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fiscal_sale_once unique (business_id, sale_id, document_type),
  constraint fiscal_issuer_folio_once unique (issuer_rut, document_type, folio),
  constraint fiscal_folio_required check (
    (status in ('draft','cancelled') and (folio is null or folio > 0))
    or (status not in ('draft','cancelled') and folio is not null)
  ),
  constraint fiscal_track_required check (status not in ('submitted','accepted','rejected') or track_id is not null)
);
create index if not exists fiscal_issuance_pending_idx
  on fiscal.issuance_operations (status, updated_at)
  where status in ('submitting','submitted','unknown');
alter table fiscal.issuance_operations enable row level security;
revoke all on fiscal.issuance_operations from public, anon, authenticated;
revoke all on all sequences in schema fiscal from public, anon, authenticated;
comment on table fiscal.issuance_operations is
 'SII pilot; server-only. DB uniqueness prevents duplicate folios/sales, but transition enforcement and atomic allocation require a reviewed transactional backend.';
commit;
