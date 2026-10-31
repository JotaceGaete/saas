-- PROPUESTA F2.2 — NO APLICAR en producción sin autorización explícita.
-- Ubicación deliberadamente fuera de supabase/migrations para que ningún flujo la aplique por accidente.
--
-- Objetivo:
--   1. Impedir que una venta tenga un camino de emisión activo en otro pipeline (P1, P3, P4)
--      cuando se reclama emisión en el ledger único (crm_fiscal_issuances, P2).
--   2. Exigir, dentro del reclamo, las mismas condiciones que hoy solo se comprueban en la app:
--      negocio habilitado, emisión global habilitada, venta pagada y líneas con categoría tributaria verificada.
--   3. Guardar credenciales tributarias por comercio cifradas, accesibles solo con service_role.
--   4. Higiene: revocar privilegios sobrantes para anon.
--
-- Pruebas: supabase/functions/fiscal-emit/test/ (base de prueba local, nunca producción).

begin;

-- ---------------------------------------------------------------------------
-- 1. Conflicto entre pipelines para una venta.
--    Devuelve el pipeline que bloquea, o NULL si la venta no tiene camino activo.
--    Criterio conservador: cualquier fila no-terminal-de-no-emisión bloquea.
-- ---------------------------------------------------------------------------
create or replace function fiscal.sale_fiscal_conflict(p_business_id uuid, p_sale_id uuid)
returns text
language plpgsql
security invoker
set search_path = pg_catalog, public, fiscal
as $$
begin
  -- P1: piloto SII. Cualquier estado distinto de cancelado bloquea (incluye pending).
  if exists (select 1 from fiscal.operations o
              where o.business_id = p_business_id and o.sale_id = p_sale_id
                and o.document_type = 39 and o.status <> 'cancelled') then
    return 'P1_FISCAL_OPERATIONS';
  end if;
  -- P3: outbox POS DTE39. Cualquier estado distinto de skipped bloquea (pending, claimed, unknown, issued, failed).
  if exists (select 1 from fiscal.pos_dte39_outbox q
              where q.business_id = p_business_id and q.invoice_id = p_sale_id
                and q.state <> 'skipped') then
    return 'P3_POS_DTE39_OUTBOX';
  end if;
  -- P4: outbox Point. Cualquier fila bloquea: no hay estado terminal de no-emisión definido.
  if exists (select 1 from public.crm_point_fiscal_outbox p
              where p.business_id = p_business_id and p.sale_id = p_sale_id) then
    return 'P4_POINT_FISCAL_OUTBOX';
  end if;
  return null;
end;
$$;

revoke all on function fiscal.sale_fiscal_conflict(uuid, uuid) from public, anon, authenticated;
grant execute on function fiscal.sale_fiscal_conflict(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Verificación tributaria de líneas: cada línea de la venta debe tener categoría verificada
--    con la huella actual de la línea (mismo criterio que sii_pilot_begin_submission).
-- ---------------------------------------------------------------------------
create or replace function fiscal.sale_tax_lines_verified(p_business_id uuid, p_sale_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public, fiscal
as $$
  with lines as (
    select i.id, md5(jsonb_build_array(i.product_id, i.name, i.description, i.unit_price, i.quantity,
                       i.discount_pct, i.subtotal, i.sort_order, i.discount_type)::text) fp
      from public.crm_invoice_items i
     where i.invoice_id = p_sale_id
  )
  select exists (select 1 from lines)
     and not exists (
       select 1 from lines l
        where not exists (
          select 1 from fiscal.line_tax_verifications t
           where t.invoice_item_id = l.id and t.sale_id = p_sale_id and t.business_id = p_business_id
             and t.verified is true and t.category in ('IVA_AFECTO_19', 'EXENTO')
             and length(trim(coalesce(t.evidence, ''))) >= 15
             and t.line_fingerprint = l.fp));
$$;

revoke all on function fiscal.sale_tax_lines_verified(uuid, uuid) from public, anon, authenticated;
grant execute on function fiscal.sale_tax_lines_verified(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Reclamo único del ledger P2 con todas las guardas.
--    Mantiene la semántica previa (insert pending->sending o promover pending con la misma operación)
--    y añade: bloqueo por venta, habilitación, venta pagada, líneas verificadas y conflicto entre pipelines.
-- ---------------------------------------------------------------------------
create or replace function public.crm_claim_fiscal_issuance(
  p_business_id uuid, p_sale_id uuid, p_operation_id text, p_dte_type integer default 39
) returns boolean
language plpgsql
security invoker
set search_path = public, fiscal
as $$
declare
  v_id uuid;
  v_conflict text;
begin
  if p_dte_type is distinct from 39 or nullif(trim(p_operation_id), '') is null then
    raise exception 'Invalid fiscal issuance claim';
  end if;

  -- Lock por venta compartido con los pipelines P1/P3/P4 (ver sección 3c): serializa cualquier
  -- reclamo o transición fiscal de la misma venta, en cualquier pipeline, hasta fin de transacción.
  perform pg_advisory_xact_lock(hashtextextended('fiscal_sale:' || p_sale_id::text, 0));
  perform 1 from public.crm_invoices i
   where i.id = p_sale_id and i.business_id = p_business_id
   for update;
  if not found then
    raise exception 'Invalid fiscal issuance claim';
  end if;

  if not exists (select 1 from public.crm_invoices i
                  where i.id = p_sale_id and i.business_id = p_business_id
                    and i.status = 'pagada' and i.paid_at is not null and i.total > 0) then
    raise exception 'FISCAL_SALE_NOT_ELIGIBLE';
  end if;

  -- Ventas bloqueadas para emisión retroactiva automática (sección 3j).
  if exists (select 1 from fiscal.retroactive_emission_blocks b where b.sale_id = p_sale_id) then
    raise exception 'FISCAL_RETROACTIVE_BLOCKED';
  end if;

  if not exists (select 1 from fiscal.issuers s
                  where s.business_id = p_business_id and s.enabled and s.verified) then
    raise exception 'FISCAL_ISSUER_NOT_ENABLED';
  end if;

  if not exists (select 1 from fiscal.dte39_emission_control c
                  where c.singleton and c.enabled) then
    raise exception 'FISCAL_EMISSION_DISABLED';
  end if;

  if not fiscal.sale_tax_lines_verified(p_business_id, p_sale_id) then
    raise exception 'FISCAL_TAX_LINES_NOT_VERIFIED';
  end if;

  -- Medio de pago confirmado dentro de SQL (efectivo, o Point confirmado con monto exacto).
  perform fiscal.sale_payment_medio(p_business_id, p_sale_id);

  v_conflict := fiscal.sale_fiscal_conflict(p_business_id, p_sale_id);
  if v_conflict is not null then
    raise exception 'FISCAL_CROSS_PIPELINE_CONFLICT: %', v_conflict;
  end if;

  insert into public.crm_fiscal_issuances (business_id, sale_id, operation_id, dte_type, status)
  values (p_business_id, p_sale_id, p_operation_id, p_dte_type, 'sending')
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    update public.crm_fiscal_issuances
       set status = 'sending', updated_at = now()
     where business_id = p_business_id and sale_id = p_sale_id and dte_type = p_dte_type
       and operation_id = p_operation_id and status = 'pending'
    returning id into v_id;
  end if;

  return v_id is not null;
end;
$$;

revoke all on function public.crm_claim_fiscal_issuance(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.crm_claim_fiscal_issuance(uuid, uuid, text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 3b. Rechazo explícito del proveedor: sending -> failed. Única vía a failed sin reconciliación.
--     Solo desde 'sending'; nunca toca issued, unknown ni cancelled.
-- ---------------------------------------------------------------------------
create or replace function public.crm_fiscal_mark_failed(
  p_business_id uuid, p_sale_id uuid, p_operation_id text, p_error_code text
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare v_count integer;
begin
  if nullif(trim(coalesce(p_operation_id, '')), '') is null or nullif(trim(coalesce(p_error_code, '')), '') is null then
    raise exception 'Invalid fiscal failure';
  end if;
  update public.crm_fiscal_issuances
     set status = 'failed', error_code = p_error_code, updated_at = now()
   where business_id = p_business_id and sale_id = p_sale_id and operation_id = p_operation_id
     and dte_type = 39 and provider = 'siisolutions' and status = 'sending';
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function public.crm_fiscal_mark_failed(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.crm_fiscal_mark_failed(uuid, uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Credenciales tributarias por comercio, cifradas (AES-256-GCM, cifrado en la aplicación).
--    La base solo guarda ciphertext, IV y tag. La clave maestra vive en el entorno del servidor.
--    Sin privilegios para anon ni authenticated: el frontend nunca las lee.
-- ---------------------------------------------------------------------------
create table if not exists fiscal.business_credentials (
  business_id uuid primary key references public.wa_businesses(id) on delete restrict,
  provider text not null default 'dtecore' check (provider = 'dtecore'),
  key_version integer not null default 1 check (key_version > 0),
  ciphertext bytea not null check (octet_length(ciphertext) > 0),
  iv bytea not null check (octet_length(iv) = 12),
  auth_tag bytea not null check (octet_length(auth_tag) = 16),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table fiscal.business_credentials enable row level security;
revoke all on fiscal.business_credentials from public, anon, authenticated;
grant select, insert, update on fiscal.business_credentials to service_role;
comment on table fiscal.business_credentials is
  'Credenciales tributarias cifradas por comercio. Solo service_role. Nunca exponer al cliente.';

-- ---------------------------------------------------------------------------
-- 5. Higiene de privilegios.
-- ---------------------------------------------------------------------------
revoke execute on function fiscal.dte39_evidence_append_only() from public, anon, authenticated;
revoke select on public.crm_invoices from anon;

-- ---------------------------------------------------------------------------
-- 3c. Validación del medio de pago dentro de SQL (espejo de lib/eligibility.mjs).
--     Efectivo: todos los pagos recibidos y no anulados son 'cash' y suman el total.
--     Point: exactamente una operación processed + finalized + CLP + monto exacto, sin efectivo.
--     Devuelve 'EF' o 'PE'; si no, lanza FISCAL_*.
-- ---------------------------------------------------------------------------
create or replace function fiscal.sale_payment_medio(p_business_id uuid, p_sale_id uuid)
returns text
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, fiscal
as $$
declare
  v_total numeric;
  v_cash_n integer; v_cash_sum numeric;
  v_other_n integer;
  v_mp_n integer; v_mp_sum numeric;
  v_point_n integer; v_point_ok integer;
begin
  select i.total into v_total from public.crm_invoices i
   where i.id = p_sale_id and i.business_id = p_business_id;
  if v_total is null then raise exception 'FISCAL_SALE_NOT_ELIGIBLE'; end if;

  -- Pagos reales en producción (valores de crm_payments.payment_method):
  -- cash, card, debit_card, credit_card, bank_transfer, mercado_pago, other.
  -- Un cobro Point confirmado queda como payment_method = 'mercado_pago'.
  select count(*) filter (where p.payment_method = 'cash'),
         coalesce(sum(p.amount) filter (where p.payment_method = 'cash'), 0),
         count(*) filter (where p.payment_method is distinct from 'cash'),
         count(*) filter (where p.payment_method = 'mercado_pago'),
         coalesce(sum(p.amount) filter (where p.payment_method = 'mercado_pago'), 0)
    into v_cash_n, v_cash_sum, v_other_n, v_mp_n, v_mp_sum
    from public.crm_payments p
   where p.business_id = p_business_id and p.invoice_id = p_sale_id
     and p.payment_status = 'received' and p.voided_at is null;

  select count(*),
         count(*) filter (where o.mp_status = 'processed' and o.finalized_at is not null
                            and o.mp_order_id is not null and o.mp_payment_id is not null
                            and o.currency = 'CLP' and o.amount = v_total)
    into v_point_n, v_point_ok
    from public.crm_pos_point_operations o
   where o.business_id = p_business_id and o.crm_invoice_id = p_sale_id;

  if v_cash_n > 0 and (v_other_n > 0 or v_point_n > 0) then
    raise exception 'FISCAL_MIXED_PAYMENTS';
  end if;
  if v_cash_n > 0 then
    if v_cash_sum <> v_total then raise exception 'FISCAL_PAYMENT_AMOUNT_MISMATCH'; end if;
    return 'EF';
  end if;
  if v_point_n > 0 then
    if v_point_n <> 1 or v_point_ok <> 1 then raise exception 'FISCAL_POINT_NOT_CONFIRMED'; end if;
    -- Todo pago no-efectivo debe ser de Mercado Pago, y debe existir el pago Point con monto exacto.
    if v_other_n <> v_mp_n then raise exception 'FISCAL_UNSUPPORTED_PAYMENT_METHOD'; end if;
    if v_mp_n <> 1 or v_mp_sum <> v_total then raise exception 'FISCAL_PAYMENT_AMOUNT_MISMATCH'; end if;
    return 'PE';
  end if;
  raise exception 'FISCAL_NO_CONFIRMED_PAYMENT';
end;
$$;

revoke all on function fiscal.sale_payment_medio(uuid, uuid) from public, anon, authenticated;
grant execute on function fiscal.sale_payment_medio(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3c-bis. Guardas cruzadas en el lado de P1, P3 y P4.
--     Antes, solo P2 consultaba a los demás pipelines. Ahora cualquier escritura activa en
--     P1/P3/P4 comprueba si ya existe una fila P2 para la venta, bajo el mismo lock por venta
--     que usa crm_claim_fiscal_issuance. Así no hay carrera entre pipelines.
-- ---------------------------------------------------------------------------
create or replace function fiscal.guard_cross_pipeline_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fiscal
as $$
declare
  v_business uuid;
  v_sale uuid;
  v_active boolean;
begin
  if tg_table_schema = 'fiscal' and tg_table_name = 'pos_dte39_outbox' then
    v_business := new.business_id; v_sale := new.invoice_id; v_active := new.state <> 'skipped';
  elsif tg_table_schema = 'fiscal' and tg_table_name = 'operations' then
    v_business := new.business_id; v_sale := new.sale_id; v_active := new.status <> 'cancelled';
  elsif tg_table_name = 'crm_point_fiscal_outbox' then
    v_business := new.business_id; v_sale := new.sale_id;
    v_active := new.status in ('pending', 'processing', 'prepared');
  else
    raise exception 'unexpected guard table %.%', tg_table_schema, tg_table_name;
  end if;

  if not v_active then return new; end if;

  perform pg_advisory_xact_lock(hashtextextended('fiscal_sale:' || v_sale::text, 0));
  if exists (select 1 from public.crm_fiscal_issuances f
              where f.business_id = v_business and f.sale_id = v_sale and f.dte_type = 39) then
    raise exception 'FISCAL_CROSS_PIPELINE_CONFLICT: P2_CRM_FISCAL_ISSUANCES';
  end if;
  return new;
end;
$$;

revoke all on function fiscal.guard_cross_pipeline_write() from public, anon, authenticated;

drop trigger if exists fiscal_p3_cross_pipeline_guard on fiscal.pos_dte39_outbox;
create trigger fiscal_p3_cross_pipeline_guard
  before insert or update of state, business_id, invoice_id on fiscal.pos_dte39_outbox
  for each row execute function fiscal.guard_cross_pipeline_write();

drop trigger if exists fiscal_p1_cross_pipeline_guard on fiscal.operations;
create trigger fiscal_p1_cross_pipeline_guard
  before insert or update of status, business_id, sale_id on fiscal.operations
  for each row execute function fiscal.guard_cross_pipeline_write();

drop trigger if exists fiscal_p4_cross_pipeline_guard on public.crm_point_fiscal_outbox;
create trigger fiscal_p4_cross_pipeline_guard
  before insert or update of status, business_id, sale_id on public.crm_point_fiscal_outbox
  for each row execute function fiscal.guard_cross_pipeline_write();

-- ---------------------------------------------------------------------------
-- 3d. Lecturas para el emisor (solo service_role). Una sola RPC devuelve todo el contexto fiscal
--     de la venta, para que el almacén de Postgres y el de supabase-js lean exactamente lo mismo.
--     Nunca devuelve credenciales.
-- ---------------------------------------------------------------------------
create or replace function public.crm_fiscal_emission_context(p_business_id uuid, p_sale_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, fiscal
as $$
  select jsonb_build_object(
    'issuer', (select jsonb_build_object('issuer_rut', s.issuer_rut, 'enabled', s.enabled, 'verified', s.verified)
                 from fiscal.issuers s where s.business_id = p_business_id),
    'emission_enabled', exists (select 1 from fiscal.dte39_emission_control c where c.singleton and c.enabled),
    'tax_lines_verified', fiscal.sale_tax_lines_verified(p_business_id, p_sale_id),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'unit_price', x.unit_price,
                                          'quantity', x.quantity, 'discount_pct', x.discount_pct,
                                          'category', x.category) order by x.sort_order nulls last, x.id)
        from (select i.id, i.name, i.unit_price, i.quantity, i.discount_pct, i.sort_order,
                     (select v.category from fiscal.line_tax_verifications v
                       where v.invoice_item_id = i.id and v.verified is true
                       order by v.created_at desc limit 1) as category
                from public.crm_invoice_items i
               where i.invoice_id = p_sale_id) x), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('method', p.payment_method, 'amount', p.amount,
                                          'status', p.payment_status, 'voided', p.voided_at is not null))
        from public.crm_payments p
       where p.business_id = p_business_id and p.invoice_id = p_sale_id), '[]'::jsonb),
    'point_ops', coalesce((
      select jsonb_agg(jsonb_build_object('mp_status', o.mp_status, 'mp_order_id', o.mp_order_id,
                                          'mp_payment_id', o.mp_payment_id, 'finalized_at', o.finalized_at,
                                          'currency', o.currency, 'amount', o.amount))
        from public.crm_pos_point_operations o
       where o.business_id = p_business_id and o.crm_invoice_id = p_sale_id), '[]'::jsonb)
  );
$$;

revoke all on function public.crm_fiscal_emission_context(uuid, uuid) from public, anon, authenticated;
grant execute on function public.crm_fiscal_emission_context(uuid, uuid) to service_role;

-- Credenciales: se devuelven en base64 para que cualquier cliente las decodifique igual.
-- Solo service_role. El frontend nunca llama a esta función.
create or replace function public.crm_fiscal_get_credentials(p_business_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, fiscal
as $$
  select jsonb_build_object(
    'provider', c.provider, 'key_version', c.key_version,
    'ciphertext', encode(c.ciphertext, 'base64'),
    'iv', encode(c.iv, 'base64'), 'auth_tag', encode(c.auth_tag, 'base64'))
  from fiscal.business_credentials c where c.business_id = p_business_id;
$$;

revoke all on function public.crm_fiscal_get_credentials(uuid) from public, anon, authenticated;
grant execute on function public.crm_fiscal_get_credentials(uuid) to service_role;

-- Lectura de la fila de ledger de una venta (para estado y reimpresión).
create or replace function public.crm_fiscal_get_issuance(p_business_id uuid, p_sale_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object('id', f.id, 'status', f.status, 'folio', f.folio, 'pdf_base64', f.pdf_base64)
    from public.crm_fiscal_issuances f
   where f.business_id = p_business_id and f.sale_id = p_sale_id and f.dte_type = 39;
$$;

revoke all on function public.crm_fiscal_get_issuance(uuid, uuid) from public, anon, authenticated;
grant execute on function public.crm_fiscal_get_issuance(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3e. Evidencia de reconciliación del ledger P2 (solo-anexar). Cada resolución manual de un
--     'unknown' deja una fila con quién, cuándo, qué consultó y el resultado. Guarda hashes del
--     XML y PDF, no el contenido. No hay UPDATE ni DELETE (trigger de solo-anexar ya existente).
-- ---------------------------------------------------------------------------
create table if not exists fiscal.crm_fiscal_reconciliation_evidence (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.wa_businesses(id) on delete restrict,
  sale_id uuid not null,
  operation_id text not null,
  outcome text not null check (outcome in ('issued', 'failed')),
  folio integer check (folio is null or folio > 0),
  xml_sha256 text check (xml_sha256 is null or xml_sha256 ~ '^[0-9a-f]{64}$'),
  pdf_sha256 text check (pdf_sha256 is null or pdf_sha256 ~ '^[0-9a-f]{64}$'),
  reviewer text not null check (length(btrim(reviewer)) >= 3),
  reason text not null check (length(btrim(reason)) >= 10),
  evidence_reference text not null check (length(btrim(evidence_reference)) >= 3),
  provider_status text not null check (provider_status in ('found', 'not_found')),
  checked_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint recon_evidence_sale_fk foreign key (sale_id, business_id)
    references public.crm_invoices(id, business_id),
  constraint recon_evidence_consistent check (
    (outcome = 'issued' and folio is not null and xml_sha256 is not null and pdf_sha256 is not null
       and provider_status = 'found')
    or (outcome = 'failed' and folio is null and xml_sha256 is null and pdf_sha256 is null
       and provider_status = 'not_found')
  )
);

create index if not exists recon_evidence_sale_idx on fiscal.crm_fiscal_reconciliation_evidence (business_id, sale_id);

alter table fiscal.crm_fiscal_reconciliation_evidence enable row level security;
revoke all on fiscal.crm_fiscal_reconciliation_evidence from public, anon, authenticated;
grant select, insert on fiscal.crm_fiscal_reconciliation_evidence to service_role;

drop trigger if exists crm_recon_evidence_append_only on fiscal.crm_fiscal_reconciliation_evidence;
create trigger crm_recon_evidence_append_only
  before update or delete on fiscal.crm_fiscal_reconciliation_evidence
  for each row execute function fiscal.dte39_evidence_append_only();

-- Resolución manual de un 'unknown' con evidencia. Atómica: evidencia + cambio de estado.
-- outcome 'issued' exige folio, XML y PDF encontrados en el portal (provider_status = found).
-- outcome 'failed' exige que el portal no lo encontró (provider_status = not_found).
-- No llama al proveedor: es solo registro de una verificación hecha por una persona.
create or replace function public.crm_fiscal_reconcile_with_evidence(
  p_business_id uuid, p_sale_id uuid, p_operation_id text, p_outcome text,
  p_folio integer, p_xml_base64 text, p_pdf_base64 text,
  p_reviewer text, p_reason text, p_evidence_reference text,
  p_provider_status text, p_checked_at timestamptz
) returns boolean
language plpgsql
security invoker
set search_path = public, fiscal
as $$
declare
  v_row public.crm_fiscal_issuances%rowtype;
  v_issued boolean := p_outcome = 'issued';
begin
  if p_outcome is null or p_outcome not in ('issued', 'failed') then
    raise exception 'Invalid fiscal reconciliation outcome';
  end if;
  if v_issued then
    if p_folio is null or p_folio <= 0
       or nullif(btrim(coalesce(p_xml_base64, '')), '') is null
       or nullif(btrim(coalesce(p_pdf_base64, '')), '') is null
       or p_provider_status is distinct from 'found' then
      raise exception 'Invalid fiscal reconciliation evidence';
    end if;
  else
    if p_folio is not null or p_provider_status is distinct from 'not_found' then
      raise exception 'Invalid fiscal reconciliation evidence';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('fiscal_sale:' || p_sale_id::text, 0));
  select * into v_row from public.crm_fiscal_issuances
   where business_id = p_business_id and sale_id = p_sale_id and dte_type = 39
   for update;
  if not found or v_row.status <> 'unknown' or v_row.operation_id <> p_operation_id
     or v_row.provider <> 'siisolutions' then
    raise exception 'FISCAL_NOT_RECONCILABLE';
  end if;

  insert into fiscal.crm_fiscal_reconciliation_evidence (
    business_id, sale_id, operation_id, outcome, folio, xml_sha256, pdf_sha256,
    reviewer, reason, evidence_reference, provider_status, checked_at)
  values (
    p_business_id, p_sale_id, p_operation_id, p_outcome,
    case when v_issued then p_folio end,
    case when v_issued then encode(sha256(decode(p_xml_base64, 'base64')), 'hex') end,
    case when v_issued then encode(sha256(decode(p_pdf_base64, 'base64')), 'hex') end,
    p_reviewer, p_reason, p_evidence_reference, p_provider_status, p_checked_at);

  if v_issued then
    update public.crm_fiscal_issuances
       set status = 'issued', folio = p_folio, xml_base64 = p_xml_base64, pdf_base64 = p_pdf_base64,
           error_code = null, updated_at = now()
     where id = v_row.id;
  else
    update public.crm_fiscal_issuances
       set status = 'failed', folio = null, xml_base64 = null, pdf_base64 = null,
           error_code = 'RECONCILED_NOT_FOUND', updated_at = now()
     where id = v_row.id;
  end if;
  return true;
end;
$$;

revoke all on function public.crm_fiscal_reconcile_with_evidence(uuid, uuid, text, text, integer, text, text, text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.crm_fiscal_reconcile_with_evidence(uuid, uuid, text, text, integer, text, text, text, text, text, text, timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3f. Roles fiscales por negocio. El dueño de wa_businesses ya no basta por sí solo:
--     la acción exige además una fila activa con un rol fiscal. Se siembra 'fiscal_owner' para
--     los dueños actuales, así que el alcance de hoy no cambia; cualquier otro rol hay que concederlo.
-- ---------------------------------------------------------------------------
create table if not exists fiscal.business_fiscal_roles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.wa_businesses(id) on delete restrict,
  user_id uuid not null,
  role text not null check (role in ('fiscal_owner', 'fiscal_operator', 'fiscal_viewer')),
  granted_by uuid,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index if not exists business_fiscal_roles_active_idx
  on fiscal.business_fiscal_roles (business_id, user_id, role) where revoked_at is null;

alter table fiscal.business_fiscal_roles enable row level security;
revoke all on fiscal.business_fiscal_roles from public, anon, authenticated;
grant select, insert, update on fiscal.business_fiscal_roles to service_role;

insert into fiscal.business_fiscal_roles (business_id, user_id, role)
select b.id, b.user_id, 'fiscal_owner' from public.wa_businesses b where b.user_id is not null
on conflict do nothing;

-- Rol efectivo de un usuario sobre un negocio. El permiso sale SOLO de fiscal.business_fiscal_roles
-- (fila activa) y del negocio activo. wa_businesses.user_id no concede permisos por sí mismo: el
-- dueño tiene su propia fila 'fiscal_owner' (sembrada abajo y por trigger en cada alta).
-- Devuelve el rol de mayor privilegio o NULL.
create or replace function fiscal.actor_role(p_business_id uuid, p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, fiscal
as $$
  select r.role
    from fiscal.business_fiscal_roles r
    join public.wa_businesses b on b.id = r.business_id
   where r.business_id = p_business_id and r.user_id = p_user_id and r.revoked_at is null
     and b.is_active is not false
   order by case r.role when 'fiscal_owner' then 1 when 'fiscal_operator' then 2 when 'fiscal_viewer' then 3 else 4 end
   limit 1;
$$;

-- Negocios nuevos: el dueño recibe fiscal_owner al crearse. Sin esto, un alta posterior a esta
-- migración quedaría sin ningún rol fiscal. (Cambios de dueño NO revocan roles: decisión pendiente.)
create or replace function fiscal.seed_owner_role()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fiscal
as $$
begin
  if new.user_id is not null then
    insert into fiscal.business_fiscal_roles (business_id, user_id, role)
    values (new.id, new.user_id, 'fiscal_owner')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists wa_businesses_seed_fiscal_owner on public.wa_businesses;
create trigger wa_businesses_seed_fiscal_owner
  after insert on public.wa_businesses
  for each row execute function fiscal.seed_owner_role();

revoke all on function fiscal.actor_role(uuid, uuid) from public, anon, authenticated;
grant execute on function fiscal.actor_role(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3g. Write-ahead de la respuesta del proveedor (solo-anexar). Se guarda ANTES de finalizar.
--     Si la finalización falla, la respuesta queda y la recuperación finaliza desde aquí,
--     sin volver a llamar al proveedor.
-- ---------------------------------------------------------------------------
create table if not exists fiscal.crm_fiscal_provider_receipts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.wa_businesses(id) on delete restrict,
  sale_id uuid not null,
  operation_id text not null,
  folio integer not null check (folio > 0),
  xml_base64 text not null,
  pdf_base64 text not null,
  xml_sha256 text not null check (xml_sha256 ~ '^[0-9a-f]{64}$'),
  pdf_sha256 text not null check (pdf_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  constraint receipts_sale_fk foreign key (sale_id, business_id)
    references public.crm_invoices(id, business_id),
  constraint receipts_one_per_operation unique (business_id, sale_id, operation_id)
);

alter table fiscal.crm_fiscal_provider_receipts enable row level security;
revoke all on fiscal.crm_fiscal_provider_receipts from public, anon, authenticated;
grant select, insert on fiscal.crm_fiscal_provider_receipts to service_role;

drop trigger if exists crm_provider_receipts_append_only on fiscal.crm_fiscal_provider_receipts;
create trigger crm_provider_receipts_append_only
  before update or delete on fiscal.crm_fiscal_provider_receipts
  for each row execute function fiscal.dte39_evidence_append_only();

create or replace function public.crm_fiscal_store_receipt(
  p_business_id uuid, p_sale_id uuid, p_operation_id text,
  p_folio integer, p_xml_base64 text, p_pdf_base64 text
) returns boolean
language plpgsql
security invoker
set search_path = public, fiscal
as $$
declare
  v_status text;
  v_xml text := encode(sha256(decode(p_xml_base64, 'base64')), 'hex');
  v_pdf text := encode(sha256(decode(p_pdf_base64, 'base64')), 'hex');
  v_existing fiscal.crm_fiscal_provider_receipts%rowtype;
  v_inserted integer;
begin
  if p_folio is null or p_folio <= 0 or nullif(btrim(coalesce(p_operation_id, '')), '') is null then
    raise exception 'Invalid fiscal receipt';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('fiscal_sale:' || p_sale_id::text, 0));
  select f.status into v_status from public.crm_fiscal_issuances f
   where f.business_id = p_business_id and f.sale_id = p_sale_id and f.dte_type = 39
     and f.operation_id = p_operation_id and f.provider = 'siisolutions'
   for update;
  if v_status is distinct from 'sending' then raise exception 'FISCAL_NOT_SENDING'; end if;

  insert into fiscal.crm_fiscal_provider_receipts
    (business_id, sale_id, operation_id, folio, xml_base64, pdf_base64, xml_sha256, pdf_sha256)
  values (p_business_id, p_sale_id, p_operation_id, p_folio, p_xml_base64, p_pdf_base64, v_xml, v_pdf)
  on conflict (business_id, sale_id, operation_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    select * into v_existing from fiscal.crm_fiscal_provider_receipts
     where business_id = p_business_id and sale_id = p_sale_id and operation_id = p_operation_id;
    if v_existing.folio <> p_folio or v_existing.xml_sha256 <> v_xml or v_existing.pdf_sha256 <> v_pdf then
      raise exception 'FISCAL_RECEIPT_CONFLICT';
    end if;
  end if;
  return true;
end;
$$;

revoke all on function public.crm_fiscal_store_receipt(uuid, uuid, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.crm_fiscal_store_receipt(uuid, uuid, text, integer, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3h. Recuperación de 'sending'. NUNCA llama al proveedor ni reemite.
--     - Con recibo: sending -> issued desde el recibo (el documento ya lo emitió el proveedor).
--     - Sin recibo y vencida: sending -> unknown. Solo reconciliación manual decide después.
-- ---------------------------------------------------------------------------
create or replace function public.crm_fiscal_list_stale_sending(p_before timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path = public, fiscal
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'business_id', f.business_id, 'sale_id', f.sale_id,
           'operation_id', f.operation_id, 'has_receipt', exists (
             select 1 from fiscal.crm_fiscal_provider_receipts r
              where r.business_id = f.business_id and r.sale_id = f.sale_id and r.operation_id = f.operation_id)
         ) order by f.updated_at), '[]'::jsonb)
    from public.crm_fiscal_issuances f
   where f.status = 'sending' and f.dte_type = 39 and f.provider = 'siisolutions'
     and f.updated_at < p_before;
$$;

revoke all on function public.crm_fiscal_list_stale_sending(timestamptz) from public, anon, authenticated;
grant execute on function public.crm_fiscal_list_stale_sending(timestamptz) to service_role;

create or replace function public.crm_fiscal_finalize_from_receipt(
  p_business_id uuid, p_sale_id uuid, p_operation_id text
) returns boolean
language plpgsql
security invoker
set search_path = public, fiscal
as $$
declare
  v_r fiscal.crm_fiscal_provider_receipts%rowtype;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('fiscal_sale:' || p_sale_id::text, 0));
  select * into v_r from fiscal.crm_fiscal_provider_receipts
   where business_id = p_business_id and sale_id = p_sale_id and operation_id = p_operation_id;
  if not found then return false; end if;
  update public.crm_fiscal_issuances
     set status = 'issued', folio = v_r.folio, xml_base64 = v_r.xml_base64, pdf_base64 = v_r.pdf_base64,
         error_code = null, updated_at = now()
   where business_id = p_business_id and sale_id = p_sale_id and dte_type = 39
     and operation_id = p_operation_id and provider = 'siisolutions' and status = 'sending';
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function public.crm_fiscal_finalize_from_receipt(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.crm_fiscal_finalize_from_receipt(uuid, uuid, text) to service_role;

create or replace function public.crm_fiscal_mark_stale_unknown(
  p_business_id uuid, p_sale_id uuid, p_operation_id text, p_before timestamptz
) returns boolean
language plpgsql
security invoker
set search_path = public, fiscal
as $$
declare v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('fiscal_sale:' || p_sale_id::text, 0));
  -- Nunca si existe recibo: en ese caso hay que finalizar desde el recibo.
  if exists (select 1 from fiscal.crm_fiscal_provider_receipts
              where business_id = p_business_id and sale_id = p_sale_id and operation_id = p_operation_id) then
    return false;
  end if;
  update public.crm_fiscal_issuances
     set status = 'unknown', error_code = 'STALE_SENDING', updated_at = now()
   where business_id = p_business_id and sale_id = p_sale_id and dte_type = 39
     and operation_id = p_operation_id and provider = 'siisolutions'
     and status = 'sending' and updated_at < p_before;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function public.crm_fiscal_mark_stale_unknown(uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.crm_fiscal_mark_stale_unknown(uuid, uuid, text, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 3i. Wrapper público del rol efectivo. PostgREST solo expone el esquema public, así que
--     supabase-js no puede llamar a fiscal.actor_role directamente.
-- ---------------------------------------------------------------------------
create or replace function public.crm_fiscal_actor_role(p_business_id uuid, p_user_id uuid)
returns text
language sql
stable
security invoker
set search_path = public, fiscal
as $$
  select fiscal.actor_role(p_business_id, p_user_id);
$$;

revoke all on function public.crm_fiscal_actor_role(uuid, uuid) from public, anon, authenticated;
grant execute on function public.crm_fiscal_actor_role(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3j. Revisión de seguridad (PR #108):
--     - Rol administrativo fiscal_reconciler, separado de cajero (fiscal_operator).
--     - Cambio de dueño: revoca TODOS los roles del dueño anterior en ese negocio y lo audita.
--     - Auditoría administrativa solo-anexar.
--     - Bloqueo de emisión retroactiva automática para cuatro ventas Point antiguas.
-- ---------------------------------------------------------------------------
alter table fiscal.business_fiscal_roles drop constraint if exists business_fiscal_roles_role_check;
alter table fiscal.business_fiscal_roles add constraint business_fiscal_roles_role_check
  check (role in ('fiscal_owner', 'fiscal_operator', 'fiscal_viewer', 'fiscal_reconciler'));

create or replace function fiscal.has_role(p_business_id uuid, p_user_id uuid, p_role text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, fiscal
as $$
  select exists (
    select 1 from fiscal.business_fiscal_roles r
      join public.wa_businesses b on b.id = r.business_id
     where r.business_id = p_business_id and r.user_id = p_user_id and r.role = p_role
       and r.revoked_at is null and b.is_active is not false
  );
$$;

revoke all on function fiscal.has_role(uuid, uuid, text) from public, anon, authenticated;
grant execute on function fiscal.has_role(uuid, uuid, text) to service_role;

create or replace function public.crm_fiscal_has_role(p_business_id uuid, p_user_id uuid, p_role text)
returns boolean
language sql
stable
security invoker
set search_path = public, fiscal
as $$
  select fiscal.has_role(p_business_id, p_user_id, p_role);
$$;

revoke all on function public.crm_fiscal_has_role(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.crm_fiscal_has_role(uuid, uuid, text) to service_role;

create table if not exists fiscal.admin_audit (
  id bigserial primary key,
  business_id uuid not null,
  sale_id uuid,
  actor_user_id uuid,
  action text not null check (action in ('reconcile_attempt', 'reconcile_result', 'owner_changed')),
  outcome text not null check (length(outcome) between 1 and 80),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table fiscal.admin_audit enable row level security;
revoke all on fiscal.admin_audit from public, anon, authenticated;
grant select, insert on fiscal.admin_audit to service_role;
grant usage, select on sequence fiscal.admin_audit_id_seq to service_role;

drop trigger if exists admin_audit_append_only on fiscal.admin_audit;
create trigger admin_audit_append_only
  before update or delete on fiscal.admin_audit
  for each row execute function fiscal.dte39_evidence_append_only();

create or replace function public.crm_fiscal_audit_append(
  p_business_id uuid, p_sale_id uuid, p_actor_user_id uuid,
  p_action text, p_outcome text, p_detail jsonb
) returns boolean
language plpgsql
security invoker
set search_path = public, fiscal
as $$
begin
  if p_business_id is null or p_action is null or p_outcome is null then
    raise exception 'Invalid fiscal audit entry';
  end if;
  insert into fiscal.admin_audit (business_id, sale_id, actor_user_id, action, outcome, detail)
  values (p_business_id, p_sale_id, p_actor_user_id, p_action, p_outcome, coalesce(p_detail, '{}'::jsonb));
  return true;
end;
$$;

revoke all on function public.crm_fiscal_audit_append(uuid, uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.crm_fiscal_audit_append(uuid, uuid, uuid, text, text, jsonb) to service_role;

-- Cambio de dueño: el dueño anterior pierde TODOS sus roles fiscales en ese negocio (sin herencia).
-- Queda registrado en fiscal.admin_audit. El nuevo dueño recibe fiscal_owner.
create or replace function fiscal.handle_owner_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fiscal
as $$
declare
  v_revoked integer;
begin
  update fiscal.business_fiscal_roles
     set revoked_at = now()
   where business_id = new.id and user_id = old.user_id and revoked_at is null;
  get diagnostics v_revoked = row_count;

  insert into fiscal.admin_audit (business_id, sale_id, actor_user_id, action, outcome, detail)
  values (new.id, null, null, 'owner_changed', 'previous_owner_revoked',
          jsonb_build_object('previous_user_id', old.user_id, 'new_user_id', new.user_id, 'revoked_rows', v_revoked));

  if new.user_id is not null then
    insert into fiscal.business_fiscal_roles (business_id, user_id, role)
    values (new.id, new.user_id, 'fiscal_owner')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists wa_businesses_owner_change on public.wa_businesses;
create trigger wa_businesses_owner_change
  after update of user_id on public.wa_businesses
  for each row
  when (old.user_id is distinct from new.user_id)
  execute function fiscal.handle_owner_change();

-- Ventas Point antiguas: emisión retroactiva automática bloqueada (ver crm_claim_fiscal_issuance).
create table if not exists fiscal.retroactive_emission_blocks (
  sale_id uuid primary key,
  reason text not null check (length(btrim(reason)) >= 10),
  created_at timestamptz not null default now()
);

alter table fiscal.retroactive_emission_blocks enable row level security;
revoke all on fiscal.retroactive_emission_blocks from public, anon, authenticated;
grant select, insert, delete on fiscal.retroactive_emission_blocks to service_role;

insert into fiscal.retroactive_emission_blocks (sale_id, reason) values
  ('8d40285b-4d52-41fa-ab7a-90870ca150dd', 'Point antigua (2026-10-07): emisión retroactiva automática bloqueada'),
  ('df077a1b-7cdc-4825-8750-6a5a991a3095', 'Point antigua (2026-10-07): emisión retroactiva automática bloqueada'),
  ('ef2746fd-ca30-4ebc-86c6-4b8442e5fb84', 'Point antigua (2026-10-24): emisión retroactiva automática bloqueada'),
  ('661c88a9-9731-46f8-a685-4e112290a98e', 'Point antigua (2026-10-24): emisión retroactiva automática bloqueada')
on conflict do nothing;

commit;
