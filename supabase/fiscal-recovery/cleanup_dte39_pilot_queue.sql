-- LIMPIEZA DE COLA DTE39: 17 operaciones de prueba (pending -> skipped)
-- ESTADO: REVISADO, NO EJECUTADO. Requiere autorización explícita.
-- No borra filas. No toca ventas, pagos, crm_invoices, la boleta 51106,
-- las 2 operaciones pendientes de fiscal.operations, evidencias ni configuración.
--
-- Baseline verificado en solo lectura el 2026-10-31:
--   outbox: 17 pending (attempts=0, sin claimed_at, last_error, provider_response, folio)
--   crm_fiscal_issuances: 1 (51106, issued, XML 8108, PDF 8740)
--   fiscal.operations: 2 pending | crm_point_fiscal_outbox: 0
--   dte39_reconciliation_evidence: 0 | manual_fiscal_authorizations: 1
--   dte39_emission_control.enabled = false
--
-- CONCURRENCIA:
--   * SELECT ... FOR UPDATE bloquea las 17 filas durante la transacción. Un worker que
--     intente reclamarlas usa SKIP LOCKED o espera; no puede cambiarlas a mitad de la limpieza.
--   * lock_timeout corta si no obtiene un lock en 5 s: aborta en vez de esperar.
--   * El UPDATE repite las condiciones de estado: si algo cambió, afecta 0 o <17 filas y aborta.
--   * Los triggers de encolado automático están deshabilitados (migración disable_fiscal_enqueue_triggers),
--     así que ninguna venta nueva entra a la cola durante la limpieza.
--   * Los controles fiscales se acotan a las ventas auditadas y a la 51106, para no abortar
--     por operaciones ajenas a esta limpieza.
--
-- EJECUCIÓN: una sola sentencia transaccional. Si cualquier comprobación falla, el error
-- revierte todo. Verificar que la respuesta NO contenga "ABORT" ni "GUARD" antes de dar por hecho.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

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
  v_locked integer;
  v_n integer;
  v_ops_pending integer;
  v_51106 integer;
  v_enabled boolean;
begin
  -- 0. Lista exacta de 17 IDs únicos.
  if cardinality(v_ids) <> 17 or (select count(distinct x) from unnest(v_ids) x) <> 17 then
    raise exception 'ABORT: la lista de IDs no tiene 17 elementos únicos';
  end if;

  -- 1. Bloquear las 17 filas y comprobar que siguen en el estado auditado.
  perform 1 from fiscal.pos_dte39_outbox o
  where o.id = any(v_ids)
    and o.state = 'pending' and o.attempts = 0 and o.claimed_at is null
    and o.last_error is null and o.provider_response is null
    and o.folio is null and o.document_type = 39
  for update;

  select count(*), array_agg(o.invoice_id) into v_locked, v_inv_ids
  from fiscal.pos_dte39_outbox o
  where o.id = any(v_ids)
    and o.state = 'pending' and o.attempts = 0 and o.claimed_at is null
    and o.last_error is null and o.provider_response is null
    and o.folio is null and o.document_type = 39;
  if v_locked <> 17 then
    raise exception 'ABORT: condición cambiada; % de 17 filas siguen en estado auditado', v_locked;
  end if;

  -- 2. Sin emisión ni evidencia fiscal para esas ventas (acotado a la lista).
  select count(*) into v_n from public.crm_fiscal_issuances where sale_id = any(v_inv_ids);
  if v_n <> 0 then raise exception 'ABORT: existe crm_fiscal_issuances para una venta de la lista'; end if;
  select count(*) into v_n from fiscal.operations where sale_id = any(v_inv_ids);
  if v_n <> 0 then raise exception 'ABORT: existe fiscal.operations para una venta de la lista'; end if;
  select count(*) into v_n from public.crm_point_fiscal_outbox
    where to_jsonb(crm_point_fiscal_outbox) ? 'invoice_id'
      and (to_jsonb(crm_point_fiscal_outbox)->>'invoice_id')::uuid = any(v_inv_ids);
  if v_n <> 0 then raise exception 'ABORT: existe crm_point_fiscal_outbox para una venta de la lista'; end if;

  -- 3. Las 2 operaciones pendientes del piloto siguen intactas (no se tocan).
  select count(*) into v_ops_pending from fiscal.operations where status = 'pending';
  if v_ops_pending <> 2 then
    raise exception 'ABORT: fiscal.operations pendientes cambiaron (ahora %)', v_ops_pending;
  end if;

  -- 4. La boleta 51106 sigue íntegra.
  select count(*) into v_51106 from public.crm_fiscal_issuances
  where folio = 51106 and status = 'issued' and dte_type = 39
    and xml_base64 is not null and pdf_base64 is not null;
  if v_51106 <> 1 then raise exception 'ABORT: la boleta 51106 no está en el estado esperado'; end if;

  -- 5. Emisión deshabilitada.
  select enabled into v_enabled from fiscal.dte39_emission_control limit 1;
  if v_enabled is distinct from false then raise exception 'ABORT: emisión DTE39 habilitada'; end if;

  -- 6. Exclusión trazable pending -> skipped. Sin DELETE.
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
-- a) select state, count(*) from fiscal.pos_dte39_outbox group by state;   -- skipped 17; pending = pendientes nuevos (esperado 0)
-- b) select count(*) from fiscal.pos_dte39_outbox where last_error like 'EXCLUIDA_COLA_PRUEBA_2026-10-31%';  -- 17
-- c) select folio, status, length(xml_base64), length(pdf_base64) from public.crm_fiscal_issuances;  -- 51106 | issued | 8108 | 8740
-- d) select count(*) from fiscal.operations where status='pending';  -- 2
-- e) select enabled from fiscal.dte39_emission_control;  -- false

-- REVERSIÓN (solo si se pide; antes de que ningún worker reclame filas):
-- update fiscal.pos_dte39_outbox set state='pending', last_error=null, updated_at=now()
--  where last_error like 'EXCLUIDA_COLA_PRUEBA_2026-10-31%';
