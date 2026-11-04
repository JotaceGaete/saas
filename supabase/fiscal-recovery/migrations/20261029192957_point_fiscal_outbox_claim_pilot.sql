-- Pilot-only worker coordination. Not deployed automatically.
-- One worker claims a pending item atomically; no external calls in SQL.
create or replace function public.crm_claim_point_fiscal_pilot(p_limit integer default 5)
returns table(id uuid,point_operation_id uuid,business_id uuid,sale_id uuid,attempts integer)
language plpgsql security definer set search_path = ''
as $$
begin
 if auth.role() is distinct from 'service_role' then
   raise exception 'SERVICE_ROLE_REQUIRED';
 end if;
 if p_limit is null or p_limit < 1 or p_limit > 20 then
   raise exception 'INVALID_LIMIT';
 end if;
 return query
 with candidates as (
  select q.id from public.crm_point_fiscal_outbox q
  where q.status='pending'
    and q.business_id='cda904a1-e331-4bd4-9f33-a6715687d3dd'::uuid
  order by q.created_at,q.id
  for update skip locked
  limit p_limit
 ), claimed as (
  update public.crm_point_fiscal_outbox q
  set status='processing',attempts=q.attempts+1,updated_at=now()
  from candidates c where q.id=c.id
  returning q.id,q.point_operation_id,q.business_id,q.sale_id,q.attempts
 )
 select c.id,c.point_operation_id,c.business_id,c.sale_id,c.attempts from claimed c;
end;
$$;
revoke all on function public.crm_claim_point_fiscal_pilot(integer) from public,anon,authenticated;
grant execute on function public.crm_claim_point_fiscal_pilot(integer) to service_role;

-- A worker may only complete a task it has claimed. Does not emit DTE.
create or replace function public.crm_complete_point_fiscal_pilot(
 p_id uuid,p_status text,p_error_code text default null)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_rows integer;
begin
 if auth.role() is distinct from 'service_role' then
   raise exception 'SERVICE_ROLE_REQUIRED';
 end if;
 if p_status not in ('prepared','blocked') then
   raise exception 'INVALID_STATUS';
 end if;
 update public.crm_point_fiscal_outbox q
 set status=p_status,last_error_code=case when p_status='blocked'
   then left(coalesce(p_error_code,'RECONCILIATION_REQUIRED'),120) else null end,
   updated_at=now()
 where q.id=p_id and q.status='processing'
   and q.business_id='cda904a1-e331-4bd4-9f33-a6715687d3dd'::uuid;
 get diagnostics v_rows=row_count;
 return v_rows=1;
end;
$$;
revoke all on function public.crm_complete_point_fiscal_pilot(uuid,text,text) from public,anon,authenticated;
grant execute on function public.crm_complete_point_fiscal_pilot(uuid,text,text) to service_role;
-- Processing tasks are intentionally not auto-requeued: operator review first.
