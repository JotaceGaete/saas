-- CERTIFICATION PILOT ONLY. Apply only in isolated PostgreSQL test database
-- after reviewing 001 and 002, role grants, identity types and CAF verification.
begin;
-- A signed artifact is immutable by design; DB must reject overwrites.
create table if not exists fiscal.signed_documents (
  operation_id bigint primary key references fiscal.issuance_operations(id) on delete restrict,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  xml_bytes bytea not null check (octet_length(xml_bytes) between 1 and 10485760),
  created_at timestamptz not null default now(),
  constraint signed_document_hash_matches check (
    encode(extensions.digest(xml_bytes,'sha256'),'hex') = sha256
  )
);
-- pgcrypto location is project-specific; DO NOT execute before checking where
-- digest() is installed. This migration assumes extensions.digest.
alter table fiscal.signed_documents enable row level security;
revoke all on fiscal.signed_documents from public, anon, authenticated;
-- WARNING: Trigger also blocks maintenance updates; use a separately reviewed recovery procedure.
-- Disallow mutation even by the privileged application role; use insert-only.
create or replace function fiscal.prevent_signed_document_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
 raise exception 'Signed fiscal artifacts are immutable';
end;
$;
drop trigger if exists fiscal_signed_documents_immutable on fiscal.signed_documents;
create trigger fiscal_signed_documents_immutable
 before update or delete on fiscal.signed_documents
 for each row execute function fiscal.prevent_signed_document_mutation();

-- CRITICAL: revoke direct UPDATE on issuance_operations from the application role
-- after introducing a dedicated restricted execution role. SECURITY INVOKER
-- alone does NOT enforce that callers use CAS instead of direct UPDATE.
-- State transitions are CAS; return false if another worker won.
-- Caller must check true before any SII transmission.
create or replace function fiscal.cas_issuance_state(
 p_operation_id bigint, p_expected text, p_next text, p_track_id text default null
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_rows int;
begin
 if p_next not in ('signed','submitting','submitted','unknown','accepted','rejected') then
  raise exception 'Unsupported fiscal state transition';
 end if;
 if not (
  (p_expected='reserved' and p_next='signed')
  or (p_expected='signed' and p_next='submitting')
  or (p_expected='submitting' and p_next in ('submitted','unknown'))
  or (p_expected='unknown' and p_next in ('submitted','accepted','rejected'))
  or (p_expected='submitted' and p_next in ('unknown','accepted','rejected'))
 ) then raise exception 'Illegal fiscal state transition'; end if;
 if p_next in ('submitted','accepted','rejected') and p_track_id is null then
  raise exception 'Track ID required';
 end if;
 if p_next not in ('submitted','accepted','rejected') and p_track_id is not null then
  raise exception 'Unexpected Track ID';
 end if;
 update fiscal.issuance_operations
 set status=p_next,
     track_id=coalesce(p_track_id,track_id),
     version=version+1,
     updated_at=now()
 where id=p_operation_id and status=p_expected
   and (p_track_id is null or track_id is null or track_id=p_track_id)
   and (p_next<>'signed' or exists
       (select 1 from fiscal.signed_documents where operation_id=p_operation_id));
 get diagnostics v_rows=row_count;
 return v_rows=1;
end;
$;
revoke all on function fiscal.cas_issuance_state(bigint,text,text,text) from public, anon, authenticated;
commit;
