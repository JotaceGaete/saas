-- Private queue worker claims: no provider call and no automatic enqueuing.
create or replace function public.sii_pos_dte39_claim_next()
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, fiscal
as $$
declare
  v_job fiscal.pos_dte39_outbox%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  select * into v_job from fiscal.pos_dte39_outbox
   where state = 'pending'
   order by created_at, id
   for update skip locked limit 1;
  if not found then return null; end if;
  update fiscal.pos_dte39_outbox
    set state = 'claimed', attempts = attempts + 1,
        claimed_at = clock_timestamp(), updated_at = clock_timestamp()
    where id = v_job.id;
  return jsonb_build_object(
    'jobId', v_job.id, 'businessId', v_job.business_id,
    'invoiceId', v_job.invoice_id, 'operationId', v_job.operation_id,
    'documentType', v_job.document_type
  );
end;
$$;
revoke all on function public.sii_pos_dte39_claim_next() from public, anon, authenticated;
grant execute on function public.sii_pos_dte39_claim_next() to service_role;

create or replace function public.sii_pos_dte39_finish(
  p_job_id uuid, p_state text, p_folio bigint default null,
  p_response jsonb default null, p_error text default null
) returns boolean language plpgsql security definer
set search_path = pg_catalog, public, fiscal
as $$
declare v_count integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_state not in ('issued','unknown','failed','skipped')
    or (p_state = 'issued' and (p_folio is null or p_folio <= 0))
    or (p_state <> 'issued' and p_folio is not null) then
    raise exception 'INVALID_FISCAL_RESULT';
  end if;
  update fiscal.pos_dte39_outbox
     set state = p_state, folio = p_folio,
         provider_response = p_response, last_error = left(p_error,1000),
         updated_at = clock_timestamp()
   where id = p_job_id and state = 'claimed';
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;
revoke all on function public.sii_pos_dte39_finish(uuid,text,bigint,jsonb,text) from public, anon, authenticated;
grant execute on function public.sii_pos_dte39_finish(uuid,text,bigint,jsonb,text) to service_role;
