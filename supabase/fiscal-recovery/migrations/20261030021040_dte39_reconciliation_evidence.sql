-- Immutable evidence ledger for manual DTE39 reconciliation.
-- Recording evidence never changes the outbox state or issues a fiscal document.
create table if not exists fiscal.dte39_reconciliation_evidence (
 id uuid primary key default gen_random_uuid(),
 job_id uuid not null references fiscal.pos_dte39_outbox(id),
 operation_id text not null,
 reviewer text not null,
 checked_at timestamptz not null,
 provider_status text not null check (provider_status in ('issued','not_found','uncertain')),
 provider_folio bigint check (provider_folio is null or provider_folio>0),
 evidence_reference text not null,
 created_at timestamptz not null default now(),
 check (length(trim(reviewer))>0 and length(trim(evidence_reference))>0),
 check (provider_status<>'issued' or provider_folio is not null)
);
alter table fiscal.dte39_reconciliation_evidence enable row level security;
revoke all on fiscal.dte39_reconciliation_evidence from public,anon,authenticated;
create or replace function fiscal.dte39_evidence_append_only()
returns trigger language plpgsql set search_path=pg_catalog,fiscal as $$
begin raise exception 'FISCAL_EVIDENCE_IMMUTABLE'; end; $$;
drop trigger if exists dte39_evidence_append_only on fiscal.dte39_reconciliation_evidence;
create trigger dte39_evidence_append_only before update or delete
on fiscal.dte39_reconciliation_evidence for each row
execute function fiscal.dte39_evidence_append_only();
create or replace function public.sii_pos_dte39_record_evidence(
 p_job_id uuid,p_operation_id text,p_reviewer text,p_checked_at timestamptz,
 p_status text,p_folio bigint,p_reference text)
returns uuid language plpgsql security definer
set search_path=pg_catalog,public,fiscal as $$
declare v_job fiscal.pos_dte39_outbox%rowtype; v_id uuid;
begin
 if auth.role() is distinct from 'service_role' then
  raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
 select * into v_job from fiscal.pos_dte39_outbox where id=p_job_id for update;
 if not found or v_job.state not in ('unknown','claimed') then
  raise exception 'RECONCILIATION_STATE_REQUIRED'; end if;
 if p_operation_id is distinct from v_job.operation_id then
  raise exception 'OPERATION_EVIDENCE_MISMATCH'; end if;
 if p_reviewer is null or length(trim(p_reviewer))=0
    or p_reference is null or length(trim(p_reference))=0
    or p_checked_at is null or p_checked_at>now()
    or p_status not in ('issued','not_found','uncertain')
    or (p_status='issued' and (p_folio is null or p_folio<=0))
    or (p_status<>'issued' and p_folio is not null) then
  raise exception 'INVALID_RECONCILIATION_EVIDENCE'; end if;
 insert into fiscal.dte39_reconciliation_evidence
 (job_id,operation_id,reviewer,checked_at,provider_status,provider_folio,evidence_reference)
 values(p_job_id,p_operation_id,p_reviewer,p_checked_at,p_status,p_folio,p_reference)
 returning id into v_id;
 return v_id;
end; $$;
revoke all on function public.sii_pos_dte39_record_evidence(uuid,text,text,timestamptz,text,bigint,text)
 from public,anon,authenticated;
grant execute on function public.sii_pos_dte39_record_evidence(uuid,text,text,timestamptz,text,bigint,text)
 to service_role;