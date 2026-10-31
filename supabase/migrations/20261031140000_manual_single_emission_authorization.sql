-- ============================================================================
-- Autorización de UN SOLO USO para una emisión manual real de boleta (DTE 39).
--
-- NO APLICAR A PRODUCCIÓN sin autorización expresa. No crea ventas ni emite.
--
-- Garantías:
--   - Cada autorización está atada a un negocio, una venta, un monto y un
--     vencimiento. Unique (business_id, sale_id): una sola autorización por venta.
--   - El consumo es atómico con el reclamo de la operación fiscal: si el reclamo
--     falla, la autorización NO se consume; si la autorización falla, NO hay
--     reclamo. Ambos ocurren en la misma transacción de la función.
--   - No toca fiscal.pos_dte39_outbox, fiscal.operations ni
--     crm_point_fiscal_outbox.
--   - Serialización por negocio con pg_advisory_xact_lock dentro de la misma
--     transacción, más rechazo de cualquier operación 'sending' o 'unknown'.
--   - crm_finalize_fiscal_issuance: cuerpo alineado con producción (provider y
--     dte_type). Producción ya conserva el folio en 'unknown'; el repo viejo no.
-- ============================================================================

create table if not exists public.manual_fiscal_authorizations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.wa_businesses(id),
  sale_id uuid not null,
  amount numeric(12,2) not null check (amount > 0),
  expires_at timestamptz not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  consumed_operation_id text,
  constraint manual_fiscal_auth_sale_fk foreign key (sale_id, business_id)
    references public.crm_invoices(id, business_id),
  constraint manual_fiscal_auth_one_per_sale unique (business_id, sale_id),
  constraint manual_fiscal_auth_expiry_after_create check (expires_at > created_at),
  constraint manual_fiscal_auth_consumed_consistent
    check ((consumed_at is null) = (consumed_operation_id is null))
);

alter table public.manual_fiscal_authorizations enable row level security;
revoke all on public.manual_fiscal_authorizations from public, anon, authenticated;
grant select, insert, update on public.manual_fiscal_authorizations to service_role;
comment on table public.manual_fiscal_authorizations is
  'Single-use authorization for one manual DTE 39 emission. Bound to business, sale, amount and expiry. Consumed atomically with the fiscal claim.';

-- Atomic: validates, claims the fiscal operation and consumes the authorization
-- in ONE transaction. Any failure raises and rolls everything back.
create or replace function public.crm_begin_manual_single_emission(
  p_authorization_id uuid, p_business_id uuid, p_sale_id uuid,
  p_amount numeric, p_operation_id text
) returns boolean language plpgsql security invoker set search_path = public as $$
declare
  v_auth public.manual_fiscal_authorizations%rowtype;
  v_invoice record;
begin
  if nullif(trim(coalesce(p_operation_id, '')), '') is null or p_amount is null or p_amount <= 0 then
    raise exception 'Invalid manual emission request';
  end if;

  -- Serialize all manual emissions for this business inside the transaction.
  -- Concurrent begins for the same business queue on this lock.
  perform pg_advisory_xact_lock(hashtextextended('manual_fiscal_emission:' || p_business_id::text, 0));
  -- Sequential rule enforced atomically: nothing may be in flight or unresolved.
  if exists (select 1 from public.crm_fiscal_issuances f
              where f.business_id = p_business_id and f.status in ('sending', 'unknown')) then
    raise exception 'Unresolved fiscal operation exists for this business';
  end if;

  select * into v_auth from public.manual_fiscal_authorizations
   where id = p_authorization_id and business_id = p_business_id and sale_id = p_sale_id
   for update;
  if not found then raise exception 'Authorization not found'; end if;
  if v_auth.consumed_at is not null then raise exception 'Authorization already consumed'; end if;
  if v_auth.expires_at <= now() then raise exception 'Authorization expired'; end if;
  if v_auth.amount <> p_amount then raise exception 'Authorization amount mismatch'; end if;

  select i.status, i.paid_at, i.total into v_invoice
    from public.crm_invoices i
   where i.id = p_sale_id and i.business_id = p_business_id
   for update;
  if not found or v_invoice.status <> 'pagada' or v_invoice.paid_at is null
     or v_invoice.total <> p_amount then
    raise exception 'Sale not eligible for manual emission';
  end if;

  if not public.crm_claim_fiscal_issuance(p_business_id, p_sale_id, p_operation_id, 39) then
    raise exception 'Fiscal operation already exists';
  end if;

  update public.manual_fiscal_authorizations
     set consumed_at = now(), consumed_operation_id = p_operation_id
   where id = p_authorization_id;
  return true;
end $$;

revoke all on function public.crm_begin_manual_single_emission(uuid,uuid,uuid,numeric,text)
  from public, anon, authenticated;
grant execute on function public.crm_begin_manual_single_emission(uuid,uuid,uuid,numeric,text)
  to service_role;

-- Corrección de folio: 'unknown' conserva el folio asignado (si lo hubo).
-- Solo 'issued' exige XML y PDF.
create or replace function public.crm_finalize_fiscal_issuance(
  p_business_id uuid, p_sale_id uuid, p_operation_id text,
  p_status text, p_folio integer default null,
  p_xml_base64 text default null, p_pdf_base64 text default null
) returns boolean language plpgsql security invoker set search_path = public as $$
declare v_count integer;
begin
  if p_status is null or p_status not in ('issued', 'unknown') then
    raise exception 'Invalid fiscal outcome';
  end if;
  if p_folio is not null and p_folio <= 0 then
    raise exception 'Invalid fiscal folio';
  end if;
  if p_status = 'issued' and (p_folio is null or
       nullif(p_xml_base64, '') is null or nullif(p_pdf_base64, '') is null) then
    raise exception 'Issued outcome requires folio, XML and PDF';
  end if;
  update public.crm_fiscal_issuances
  set status = p_status,
      folio = p_folio,
      xml_base64 = case when p_status = 'issued' then p_xml_base64 else null end,
      pdf_base64 = case when p_status = 'issued' then p_pdf_base64 else null end,
      updated_at = now()
  where business_id = p_business_id and sale_id = p_sale_id
    and operation_id = p_operation_id and status = 'sending'
    and provider = 'siisolutions' and dte_type = 39;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;
revoke all on function public.crm_finalize_fiscal_issuance(uuid,uuid,text,text,integer,text,text)
  from public, anon, authenticated;
grant execute on function public.crm_finalize_fiscal_issuance(uuid,uuid,text,text,integer,text,text)
  to service_role;
