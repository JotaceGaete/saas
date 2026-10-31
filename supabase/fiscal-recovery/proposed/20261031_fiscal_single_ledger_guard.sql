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

  -- Serializa cualquier reclamo concurrente sobre la misma venta hasta fin de transacción.
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

commit;
