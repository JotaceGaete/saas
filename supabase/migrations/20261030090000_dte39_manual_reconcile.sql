create or replace function public.sii_pos_dte39_reconcile(p_job_id uuid,p_resolution text,p_folio bigint default null,p_evidence jsonb default null)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,fiscal as $$
declare v_count integer;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
 if p_resolution not in ('issued','skipped') then raise exception 'INVALID_RECONCILIATION_RESOLUTION'; end if;
 if p_resolution='issued' and (p_folio is null or p_folio<=0) then raise exception 'FOLIO_REQUIRED'; end if;
 if p_resolution='skipped' and p_folio is not null then raise exception 'FOLIO_NOT_ALLOWED'; end if;
 if p_evidence is null or jsonb_typeof(p_evidence)<>'object' or length(coalesce(p_evidence->>'reference',''))<8 then raise exception 'RECONCILIATION_EVIDENCE_REQUIRED'; end if;
 update fiscal.pos_dte39_outbox set state=p_resolution,folio=p_folio,
 provider_response=jsonb_build_object('reconciliation',p_evidence),last_error=null,updated_at=clock_timestamp()
 where id=p_job_id and state='unknown';
 get diagnostics v_count=row_count;
 return v_count=1;
end; $$;
revoke all on function public.sii_pos_dte39_reconcile(uuid,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.sii_pos_dte39_reconcile(uuid,text,bigint,jsonb) to service_role;