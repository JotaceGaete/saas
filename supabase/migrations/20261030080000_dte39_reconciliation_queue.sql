-- Manual reconciliation view: no automatic retry of uncertain emissions.
create or replace function public.sii_pos_dte39_reconciliation_queue(p_limit integer default 50)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,fiscal as $$
declare v_rows jsonb;
begin
 if auth.role() is distinct from 'service_role' then
   raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';
 end if;
 if p_limit is null or p_limit<1 or p_limit>100 then
   raise exception 'INVALID_LIMIT';
 end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at),'[]'::jsonb)
 into v_rows from (
  select id,invoice_id,business_id,operation_id,state,attempts,claimed_at,
    created_at,updated_at,last_error
  from fiscal.pos_dte39_outbox
  where state='unknown' or (state='claimed' and claimed_at<now()-interval '20 minutes')
  order by created_at,id limit p_limit
 ) q;
 return v_rows;
end; $$;
revoke all on function public.sii_pos_dte39_reconciliation_queue(integer) from public,anon,authenticated;
grant execute on function public.sii_pos_dte39_reconciliation_queue(integer) to service_role;