create or replace function public.sii_pilot_record_provider_result(
 p_operation_id uuid, p_result text, p_folio bigint default null,
 p_provider_response_id text default null, p_error_code text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_op fiscal.operations%rowtype; v_issuer fiscal.issuers%rowtype;
begin
 if p_result not in ('submitted','unknown','accepted','rejected') then
  raise exception 'INVALID_RESULT' using errcode='P0001';
 end if;
 select * into v_op from fiscal.operations where id=p_operation_id for update;
 if not found or v_op.business_id <> 'cda904a1-e331-4bd4-9f33-a6715687d3dd'::uuid
   or v_op.issuer_rut <> '77804207-K' or v_op.document_type <> 39 then
  raise exception 'OPERATION_NOT_ALLOWED' using errcode='P0001';
 end if;
 select * into v_issuer from fiscal.issuers where business_id=v_op.business_id;
 if not found or v_issuer.issuer_rut <> v_op.issuer_rut then
  raise exception 'ISSUER_MISMATCH' using errcode='P0001';
 end if;
 if v_op.status = 'pending' then
  raise exception 'NOT_SENT_CANNOT_RECORD_PROVIDER_RESULT' using errcode='P0001';
 end if;
 if v_op.status in ('accepted','rejected','cancelled') and v_op.status <> p_result then
  raise exception 'FINAL_STATE_IMMUTABLE' using errcode='P0001';
 end if;
 if v_op.folio is not null and p_folio is not null and v_op.folio <> p_folio then
  raise exception 'FOLIO_IMMUTABLE' using errcode='P0001';
 end if;
 if p_folio is not null and p_folio <= 0 then
  raise exception 'INVALID_FOLIO' using errcode='P0001';
 end if;
 if v_op.status = 'unknown' and p_result = 'submitted' then
  raise exception 'UNKNOWN_REQUIRES_RECONCILIATION' using errcode='P0001';
 end if;
 update fiscal.operations set
 status=p_result, folio=coalesce(v_op.folio,p_folio),
 provider_response_id=coalesce(nullif(p_provider_response_id,''),v_op.provider_response_id),
 error_code=nullif(p_error_code,''),updated_at=now()
 where id=p_operation_id returning * into v_op;
 return jsonb_build_object('operationId',v_op.id,'status',v_op.status,'folio',v_op.folio);
end $$;
revoke all on function public.sii_pilot_record_provider_result(uuid,text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.sii_pilot_record_provider_result(uuid,text,bigint,text,text) to service_role;