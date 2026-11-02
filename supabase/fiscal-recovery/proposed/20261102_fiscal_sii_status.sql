-- E — Estado tributario separado de la emisión, inmutabilidad del documento emitido y
--     bloqueo de emisión retroactiva en la base. PROPUESTA: NO APLICADA EN PRODUCCIÓN.
--
-- Depende de: P0, A, B, C, D (ver F4). Va después de D.
--
-- Qué separa:
--   crm_fiscal_issuances.status      -> lo que hizo el PROVEEDOR: pending/sending/unknown/issued/failed/cancelled.
--                                       'issued' = folio asignado + XML firmado + PDF guardados.
--   crm_fiscal_issuances.sii_status  -> lo que dice el SII de ese documento:
--       unverified                (por defecto: nadie lo ha consultado)
--       received                  (REC: recibido por el SII, sin resultado)
--       accepted                  (aceptado)
--       accepted_with_objections  (aceptado con reparos)
--       rejected                  (rechazado)
--   Solo un documento 'issued' (o 'cancelled') puede tener sii_status distinto de unverified.
--
-- No toca filas existentes salvo el valor por defecto de las columnas nuevas. La 51106 queda
-- 'unverified' hasta que alguien registre su aceptación con crm_fiscal_record_sii_status.

begin;

alter table public.crm_fiscal_issuances
  add column if not exists sii_status text not null default 'unverified',
  add column if not exists sii_track_id text,
  add column if not exists sii_status_detail text,
  add column if not exists sii_status_source text,
  add column if not exists sii_checked_at timestamptz,
  add column if not exists issued_at timestamptz;

alter table public.crm_fiscal_issuances drop constraint if exists crm_fiscal_issuances_sii_status_check;
alter table public.crm_fiscal_issuances add constraint crm_fiscal_issuances_sii_status_check check (
  sii_status in ('unverified', 'received', 'accepted', 'accepted_with_objections', 'rejected')
  and (sii_status = 'unverified' or status in ('issued', 'cancelled'))
  and (sii_status_source is null or sii_status_source in ('portal_manual', 'provider_api', 'sii_api'))
  and (sii_track_id is null or sii_track_id ~ '^[0-9]{1,20}$')
);

-- Historial solo-anexar de cambios de estado SII (quién, cuándo, de dónde salió).
create table if not exists fiscal.crm_fiscal_sii_status_events (
  id bigint generated always as identity primary key,
  issuance_id uuid not null references public.crm_fiscal_issuances(id),
  business_id uuid not null,
  folio integer not null,
  from_status text not null,
  to_status text not null,
  track_id text,
  source text not null check (source in ('portal_manual', 'provider_api', 'sii_api')),
  detail text,
  actor_user_id uuid,
  created_at timestamptz not null default now()
);
alter table fiscal.crm_fiscal_sii_status_events enable row level security;
revoke all on fiscal.crm_fiscal_sii_status_events from public, anon, authenticated;
grant select, insert on fiscal.crm_fiscal_sii_status_events to service_role;

create or replace function fiscal.sii_events_append_only()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  raise exception 'FISCAL_APPEND_ONLY' using errcode = 'P0001';
end;
$$;
drop trigger if exists crm_fiscal_sii_status_events_append_only on fiscal.crm_fiscal_sii_status_events;
create trigger crm_fiscal_sii_status_events_append_only
  before update or delete on fiscal.crm_fiscal_sii_status_events
  for each row execute function fiscal.sii_events_append_only();

-- ---------------------------------------------------------------------------
-- Inmutabilidad del documento emitido. Una fila 'issued' conserva para siempre venta, negocio,
-- operación, folio, XML y PDF. Solo puede pasar a 'cancelled' (nota de crédito). El estado SII sí
-- puede cambiar. issued_at se fija al entrar en 'issued'.
-- ---------------------------------------------------------------------------
create or replace function fiscal.guard_issued_document()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'UPDATE' and old.status in ('issued', 'cancelled') then
    if new.business_id is distinct from old.business_id or new.sale_id is distinct from old.sale_id
       or new.operation_id is distinct from old.operation_id or new.dte_type is distinct from old.dte_type
       or new.folio is distinct from old.folio or new.xml_base64 is distinct from old.xml_base64
       or new.pdf_base64 is distinct from old.pdf_base64
       or new.issued_at is distinct from old.issued_at then
      raise exception 'FISCAL_ISSUED_DOCUMENT_IMMUTABLE' using errcode = 'P0001';
    end if;
    if not (new.status = old.status or (old.status = 'issued' and new.status = 'cancelled')) then
      raise exception 'FISCAL_ISSUED_DOCUMENT_IMMUTABLE' using errcode = 'P0001';
    end if;
  end if;
  if new.status = 'issued' and (tg_op = 'INSERT' or old.status <> 'issued') then
    new.issued_at := coalesce(new.issued_at, now());
  end if;
  return new;
end;
$$;
drop trigger if exists crm_fiscal_issuances_guard_issued on public.crm_fiscal_issuances;
create trigger crm_fiscal_issuances_guard_issued
  before insert or update on public.crm_fiscal_issuances
  for each row execute function fiscal.guard_issued_document();

-- ---------------------------------------------------------------------------
-- Sin emisión retroactiva: una fila nueva del ledger solo se crea para una venta pagada HOY
-- (hora de Santiago). Protege ventas históricas y ventas Point anteriores aunque algún camino
-- nuevo olvide la regla de la aplicación (lib/eligibility.mjs: SALE_NOT_SAME_DAY).
-- ---------------------------------------------------------------------------
create or replace function fiscal.guard_same_day_claim()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare v_paid timestamptz;
begin
  select i.paid_at into v_paid from public.crm_invoices i
   where i.id = new.sale_id and i.business_id = new.business_id;
  if v_paid is null
     or (v_paid at time zone 'America/Santiago')::date <> (now() at time zone 'America/Santiago')::date then
    raise exception 'FISCAL_SALE_NOT_SAME_DAY' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists crm_fiscal_issuances_same_day on public.crm_fiscal_issuances;
create trigger crm_fiscal_issuances_same_day
  before insert on public.crm_fiscal_issuances
  for each row execute function fiscal.guard_same_day_claim();

-- ---------------------------------------------------------------------------
-- Finalización con motivo. Misma semántica que la versión de C; agrega p_error_code para que un
-- 'unknown' guarde por qué quedó así (p. ej. PROVIDER_TIMEOUT, PROVIDER_OPERATION_ALREADY_EXISTS).
-- ---------------------------------------------------------------------------
drop function if exists public.crm_finalize_fiscal_issuance(uuid, uuid, text, text, integer, text, text);
create or replace function public.crm_finalize_fiscal_issuance(
  p_business_id uuid, p_sale_id uuid, p_operation_id text, p_status text,
  p_folio integer default null, p_xml_base64 text default null, p_pdf_base64 text default null,
  p_error_code text default null
) returns boolean language plpgsql security invoker set search_path = public as $$
declare v_count integer;
begin
  if p_status is null or p_status not in ('issued', 'unknown') or (p_folio is not null and p_folio <= 0)
     or (p_status = 'issued' and (p_folio is null or nullif(p_xml_base64, '') is null or nullif(p_pdf_base64, '') is null))
     or (p_error_code is not null and p_error_code !~ '^[A-Z0-9_]{1,64}$') then
    raise exception 'Invalid fiscal outcome';
  end if;
  update public.crm_fiscal_issuances
     set status = p_status,
         folio = p_folio,
         xml_base64 = case when p_status = 'issued' then p_xml_base64 else null end,
         pdf_base64 = case when p_status = 'issued' then p_pdf_base64 else null end,
         error_code = case when p_status = 'unknown' then p_error_code else null end,
         updated_at = now()
   where business_id = p_business_id and sale_id = p_sale_id and operation_id = p_operation_id
     and status = 'sending' and provider in ('siisolutions', 'dtecore') and dte_type = 39;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;
revoke all on function public.crm_finalize_fiscal_issuance(uuid, uuid, text, text, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.crm_finalize_fiscal_issuance(uuid, uuid, text, text, integer, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Registro del estado SII. Solo service_role (la Edge Function o un operador). Nunca cambia
-- status, folio, XML ni PDF. Un estado final (accepted, accepted_with_objections, rejected) no
-- vuelve a unverified/received. 'portal_manual' exige un actor con rol fiscal_owner o
-- fiscal_reconciler en el negocio.
-- ---------------------------------------------------------------------------
create or replace function public.crm_fiscal_record_sii_status(
  p_business_id uuid, p_sale_id uuid, p_sii_status text, p_source text,
  p_track_id text default null, p_detail text default null, p_actor_user_id uuid default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public, fiscal as $$
declare
  r public.crm_fiscal_issuances%rowtype;
begin
  if p_sii_status not in ('received', 'accepted', 'accepted_with_objections', 'rejected')
     or p_source not in ('portal_manual', 'provider_api', 'sii_api')
     or (p_track_id is not null and p_track_id !~ '^[0-9]{1,20}$')
     or length(coalesce(p_detail, '')) > 500 then
    raise exception 'FISCAL_SII_STATUS_INVALID' using errcode = 'P0001';
  end if;
  if p_source = 'portal_manual' and (p_actor_user_id is null
       or not (fiscal.has_role(p_business_id, p_actor_user_id, 'fiscal_owner')
               or fiscal.has_role(p_business_id, p_actor_user_id, 'fiscal_reconciler'))) then
    raise exception 'FISCAL_ROLE_REQUIRED' using errcode = 'P0001';
  end if;

  select * into r from public.crm_fiscal_issuances
   where business_id = p_business_id and sale_id = p_sale_id and dte_type = 39
   for update;
  if not found or r.status not in ('issued', 'cancelled') or r.folio is null then
    raise exception 'FISCAL_NOT_ISSUED' using errcode = 'P0001';
  end if;
  if r.sii_status in ('accepted', 'accepted_with_objections', 'rejected') and p_sii_status <> r.sii_status then
    raise exception 'FISCAL_SII_STATUS_FINAL' using errcode = 'P0001';
  end if;
  if r.sii_track_id is not null and p_track_id is not null and p_track_id <> r.sii_track_id then
    raise exception 'FISCAL_SII_TRACK_MISMATCH' using errcode = 'P0001';
  end if;

  update public.crm_fiscal_issuances
     set sii_status = p_sii_status,
         sii_track_id = coalesce(sii_track_id, p_track_id),
         sii_status_detail = p_detail,
         sii_status_source = p_source,
         sii_checked_at = now(),
         updated_at = now()
   where id = r.id;

  insert into fiscal.crm_fiscal_sii_status_events
    (issuance_id, business_id, folio, from_status, to_status, track_id, source, detail, actor_user_id)
  values (r.id, r.business_id, r.folio, r.sii_status, p_sii_status, coalesce(r.sii_track_id, p_track_id),
          p_source, p_detail, p_actor_user_id);

  return jsonb_build_object('folio', r.folio, 'sii_status', p_sii_status, 'previous', r.sii_status);
end;
$$;
revoke all on function public.crm_fiscal_record_sii_status(uuid, uuid, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.crm_fiscal_record_sii_status(uuid, uuid, text, text, text, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Lectura del ledger para estado, TPV y reimpresión: agrega estado SII, motivo y fechas.
-- El XML no se devuelve aquí (se descarga por api/fiscal/download); solo si existe.
-- ---------------------------------------------------------------------------
create or replace function public.crm_fiscal_get_issuance(p_business_id uuid, p_sale_id uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
           'id', f.id, 'status', f.status, 'folio', f.folio, 'pdf_base64', f.pdf_base64,
           'has_xml', f.xml_base64 is not null, 'error_code', f.error_code,
           'sii_status', f.sii_status, 'sii_track_id', f.sii_track_id, 'sii_checked_at', f.sii_checked_at,
           'issued_at', f.issued_at, 'updated_at', f.updated_at)
    from public.crm_fiscal_issuances f
   where f.business_id = p_business_id and f.sale_id = p_sale_id and f.dte_type = 39;
$$;
revoke all on function public.crm_fiscal_get_issuance(uuid, uuid) from public, anon, authenticated;
grant execute on function public.crm_fiscal_get_issuance(uuid, uuid) to service_role;

commit;
