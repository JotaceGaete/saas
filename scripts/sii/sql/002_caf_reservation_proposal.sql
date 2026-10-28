-- PROPOSAL ONLY: execute after 001 and integration review on isolated database.
-- Server-only atomic reservation, using CAF ranges registered after external
-- signature verification. This SQL DOES NOT verify CAF signatures.
begin;
create table if not exists fiscal.caf_ranges (
  id bigint generated always as identity primary key,
  issuer_rut text not null check (issuer_rut ~ '^[0-9]{1,8}-[0-9K]$'),
  document_type smallint not null check (document_type = 39),
  first_folio bigint not null check (first_folio > 0),
  last_folio bigint not null check (last_folio >= first_folio),
  next_folio bigint not null check (next_folio > 0),
  caf_sha256 text not null unique check (caf_sha256 ~ '^[a-f0-9]{64}$'),
  verified_at timestamptz not null,
  active boolean not null default false,
  check (next_folio >= first_folio and next_folio <= last_folio + 1),
  unique (issuer_rut, document_type, first_folio, last_folio)
);
alter table fiscal.caf_ranges enable row level security;
revoke all on fiscal.caf_ranges from public, anon, authenticated;
revoke all on all sequences in schema fiscal from public, anon, authenticated;

-- Prevent overlapping CAF ranges for the same issuer and document type.
create extension if not exists btree_gist;
alter table fiscal.caf_ranges
  add constraint fiscal_caf_no_overlap
  exclude using gist (
    issuer_rut with =,
    document_type with =,
    int8range(first_folio, last_folio, '[]') with &&
  );

-- Run this transaction only from trusted backend using a DB role with
-- appropriate privileges, after authenticating the tenant and checking issuer
-- ownership. Client-supplied business_id/issuer_rut must never be trusted.
-- Application must issue BEGIN; SELECT ... FOR UPDATE; UPDATE; COMMIT.
-- PostgreSQL function is intentionally not SECURITY DEFINER.
create or replace function fiscal.reserve_boleta39(
  p_business_id text, p_sale_id text, p_issuer_rut text
) returns table(operation_id bigint, reserved_folio bigint, operation_version bigint)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_op fiscal.issuance_operations%rowtype;
  v_caf fiscal.caf_ranges%rowtype;
begin
  if p_business_id is null or p_sale_id is null or p_issuer_rut is null then
    raise exception 'Missing fiscal identifiers';
  end if;
  -- Insert-if-absent; the unique business/sale/type key serializes retries.
  insert into fiscal.issuance_operations(business_id,sale_id,issuer_rut,document_type)
  values (p_business_id,p_sale_id,p_issuer_rut,39)
  on conflict (business_id,sale_id,document_type) do nothing;

  select * into v_op from fiscal.issuance_operations
  where business_id=p_business_id and sale_id=p_sale_id and document_type=39
  for update;
  if not found then raise exception 'Fiscal operation unavailable'; end if;
  if v_op.issuer_rut <> p_issuer_rut then raise exception 'Issuer mismatch'; end if;

  -- Idempotent retry: return existing reserved folio, never allocate another.
  if v_op.folio is not null then
    if v_op.status='cancelled' then raise exception 'Cancelled operation cannot be retried'; end if;
    return query select v_op.id, v_op.folio, v_op.version;
    return;
  end if;
  if v_op.status <> 'draft' then raise exception 'Operation is not a draft'; end if;

  select * into v_caf from fiscal.caf_ranges
  where issuer_rut=p_issuer_rut and document_type=39
    and active and next_folio <= last_folio
  order by first_folio, id
  for update skip locked
  limit 1;
  if not found then
    -- A locked, otherwise eligible CAF must not be reported as exhausted.
    -- This diagnostic is advisory under concurrency; caller retries only
    -- SQLSTATE PZ101 and rechecks idempotency on each attempt.
    if exists (
      select 1 from fiscal.caf_ranges
      where issuer_rut=p_issuer_rut and document_type=39
        and active and next_folio <= last_folio
    ) then
      raise exception using
        errcode='PZ101',
        message='CAF range temporarily locked';
    end if;
    raise exception using
      errcode='P0001',
      message='No active CAF folios available';
  end if;

  update fiscal.caf_ranges set next_folio=next_folio+1 where id=v_caf.id;
  update fiscal.issuance_operations
    set folio=v_caf.next_folio, status='reserved', version=version+1, updated_at=now()
    where id=v_op.id;
  return query select v_op.id, v_caf.next_folio, v_op.version+1;
end;
$$;
revoke all on function fiscal.reserve_boleta39(text,text,text) from public, anon, authenticated;
commit;
