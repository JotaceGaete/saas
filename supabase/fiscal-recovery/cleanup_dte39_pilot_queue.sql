-- LIMPIEZA DE COLA DTE39: 17 operaciones de prueba (pending -> skipped)
-- NO EJECUTAR sin autorización explícita. No borra filas. No toca ventas, pagos,
-- crm_invoices, crm_fiscal_issuances (incluida la boleta 51106), fiscal.operations
-- (2 pending, intactas), evidencias ni configuración de emisión.
--
-- Baseline verificado en solo lectura el 2026-10-31:
--   outbox: 17 pending (todas attempts=0, sin claimed_at, last_error, provider_response, folio)
--   crm_fiscal_issuances: 1 (51106, issued, folio 51106, XML 8108, PDF 8740)
--   fiscal.operations: 2 pending | crm_point_fiscal_outbox: 0
--   dte39_reconciliation_evidence: 0 | manual_fiscal_authorizations: 1
--   dte39_emission_control.enabled = false

begin;

do $$
declare
  v_ids uuid[] := array[
    'bd897340-213b-4f83-9ab3-a7ea34df30be','8e038a4e-8e9d-4d95-8c97-8be6369c8836',
    'fa389c50-9d63-474c-95df-6b389ac55634','037f3854-4756-4000-9597-d7c3ff2a302d',
    '49c8704e-35e4-4af0-b417-ac61ae5ee674','28d4b859-99f5-4540-bc56-96c29cd4d36e',
    'ece853f1-cf25-4b7b-88ce-be834a7d74bd','723cb4bb-438f-4fd2-918c-e2182714eed2',
    '39cc59c8-8108-4903-95d3-bcdf4beedca1','7cd7452c-dc4d-425f-bc32-8e952d1d4ecc',
    'f86b4f8a-91eb-46a0-8dd4-36dfd22c5330','30965698-bcd0-4a60-a12c-7e83c44baa5b',
    'd86e910a-f717-4058-a9bf-a606dc0433a0','cb187707-fda0-40d2-a7af-1fd97f011450',
    '5029d9e4-79af-4733-840c-a9bc754d1c2c','e6d56561-448f-4507-b43a-8b964fd3c7d2',
    'a97cd9d3-500d-4443-af9f-5b2a0ac5741f'];
  v_inv_ids uuid[];
  v_n integer;
  v_issuances integer; v_ops integer; v_point integer; v_evidence integer; v_manual integer;
  v_51106 integer; v_enabled boolean;
begin
  -- 0. Recuento exacto de IDs auditados.
  if cardinality(v_ids) <> 17 or (select count(distinct x) from unnest(v_ids) x) <> 17 then
    raise exception 'ABORT: la lista de IDs no tiene 17 elementos únicos';
  end if;

  -- 1. Las 17 filas siguen exactamente en el estado auditado.
  select count(*) into v_n
  from fiscal.pos_dte39_outbox o
  where o.id = any(v_ids) and o.state = 'pending' and o.attempts = 0
    and o.claimed_at is null and o.last_error is null and o.provider_response is null
    and o.folio is null and o.document_type = 39;
  if v_n <> 17 then
    raise exception 'ABORT: condición cambiada; % de 17 filas siguen en estado auditado', v_n;
  end if;

  select array_agg(invoice_id) into v_inv_ids
  from fiscal.pos_dte39_outbox where id = any(v_ids);

  -- 2. Sin emisión ni evidencia fiscal para esas ventas.
  select count(*) into v_n from public.crm_fiscal_issuances where sale_id = any(v_inv_ids);
  if v_n <> 0 then raise exception 'ABORT: existe crm_fiscal_issuances para una venta de la lista'; end if;
  select count(*) into v_n from fiscal.operations where sale_id = any(v_inv_ids);
  if v_n <> 0 then raise exception 'ABORT: existe fiscal.operations para una venta de la lista'; end if;

  -- 3. Conteos globales sin cambios respecto al baseline.
  select count(*) into v_issuances from public.crm_fiscal_issuances;
  select count(*) into v_ops from fiscal.operations;
  select count(*) into v_point from public.crm_point_fiscal_outbox;
  select count(*) into v_evidence from fiscal.dte39_reconciliation_evidence;
  select count(*) into v_manual from public.manual_fiscal_authorizations;
  if v_issuances <> 1 or v_ops <> 2 or v_point <> 0 or v_evidence <> 0 or v_manual <> 1 then
    raise exception 'ABORT: conteos fiscales cambiaron (iss=%, ops=%, point=%, evid=%, manual=%)',
      v_issuances, v_ops, v_point, v_evidence, v_manual;
  end if;

  -- 4. 51106 intacta y emisión deshabilitada.
  select count(*) into v_51106 from public.crm_fiscal_issuances
  where folio = 51106 and status = 'issued' and dte_type = 39
    and xml_base64 is not null and pdf_base64 is not null;
  if v_51106 <> 1 then raise exception 'ABORT: la boleta 51106 no está en el estado esperado'; end if;
  select enabled into v_enabled from fiscal.dte39_emission_control limit 1;
  if v_enabled is distinct from false then raise exception 'ABORT: emisión DTE39 habilitada'; end if;

  -- 5. Exclusión trazable (pending -> skipped). Sin DELETE.
  update fiscal.pos_dte39_outbox
  set state = 'skipped',
      last_error = 'EXCLUIDA_COLA_PRUEBA_2026-10-31: operación de prueba previa al piloto; sin emisión ni evidencia fiscal. Exclusión autorizada por el titular.',
      updated_at = now()
  where id = any(v_ids) and state = 'pending' and attempts = 0 and claimed_at is null
    and last_error is null and provider_response is null and folio is null;
  get diagnostics v_n = row_count;
  if v_n <> 17 then
    raise exception 'ABORT: el UPDATE afectó % filas, se esperaban 17', v_n;
  end if;
end $$;

commit;

-- VERIFICACIONES POSTERIORES (solo lectura)
-- a) select state, count(*) from fiscal.pos_dte39_outbox group by state;   -- pending 0 (si no hay nuevas), skipped 17
-- b) select count(*) from fiscal.pos_dte39_outbox where last_error like 'EXCLUIDA_COLA_PRUEBA_2026-10-31%';  -- 17
-- c) select folio, status, length(xml_base64), length(pdf_base64) from public.crm_fiscal_issuances;  -- 51106 | issued | 8108 | 8740
-- d) select count(*) from fiscal.operations where status='pending';  -- 2
-- e) select enabled from fiscal.dte39_emission_control;  -- false

-- REVERSIÓN (solo si se pide; ejecutar antes de que ningún worker reclame filas):
-- update fiscal.pos_dte39_outbox set state='pending', last_error=null, updated_at=now()
--  where last_error like 'EXCLUIDA_COLA_PRUEBA_2026-10-31%';
