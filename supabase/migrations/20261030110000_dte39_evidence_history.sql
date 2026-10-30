-- Read-only audit lookup for authorized fiscal operators.
create or replace function public.sii_pos_dte39_evidence_history(p_job_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,fiscal as $$
declare v_result jsonb;
begin
 if auth.role() is distinct from 'service_role' then
   raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',e.id,'operationId',e.operation_id,'reviewer',e.reviewer,
  'checkedAt',e.checked_at,'providerStatus',e.provider_status,
  'providerFolio',e.provider_folio,'evidenceReference',e.evidence_reference,
  'createdAt',e.created_at) order by e.created_at,e.id),'[]'::jsonb)
 into v_result from fiscal.dte39_reconciliation_evidence e
 where e.job_id=p_job_id;
 return v_result;
end; $$;
revoke all on function public.sii_pos_dte39_evidence_history(uuid) from public,anon,authenticated;
grant execute on function public.sii_pos_dte39_evidence_history(uuid) to service_role;