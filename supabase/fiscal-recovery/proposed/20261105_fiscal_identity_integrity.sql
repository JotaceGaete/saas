-- H — Identidad fiscal por comercio, integridad de folios, inmutabilidad de ventas fiscalizadas y
--     esquema de notas de crédito (DTE 61) sin emisión. PROPUESTA: NO APLICADA EN PRODUCCIÓN.
--     Depende de P0 y A–G (va después de G).
--
-- Hallazgos que corrige (auditoría 2026-11-05):
--   C1  Nada comprobaba que la API key de DTE Core correspondiera al RUT del comercio.
--   A1  Dos comercios independientes podían registrar el mismo RUT emisor.
--   A2  El ledger no guardaba el RUT emisor y no impedía folios repetidos del mismo emisor.
--   A3  No existía estructura para notas de crédito vinculadas al documento original.
--   A4  Una venta con boleta emitida podía modificarse (total, líneas, pagos, estado).
--
-- Qué hace:
--   1. RUT canónico: fiscal.normalize_rut() (sin puntos, sin ceros a la izquierda, dígito
--      verificador módulo 11 válido). Misma regla que lib/allowlist.mjs normalizeRut().
--      Antes de crear restricciones, revisa los datos existentes y ABORTA (sin cambiar nada) si
--      hay un RUT inválido o duplicado entre comercios.
--   2. A1 — Un RUT emisor pertenece a un solo comercio. Política de RUT compartido (explícita):
--        * Mismo RUT = mismo contribuyente. Solo se permite en varios comercios de Walinka cuando
--          (a) todos pertenecen a la MISMA cuenta dueña (wa_businesses.user_id), y (b) un
--          administrador de Walinka crea un grupo de RUT compartido con motivo y evidencia
--          (crm_fiscal_create_rut_share). Queda en fiscal.admin_audit.
--        * Comercios de dueños distintos nunca comparten RUT. Una disputa de titularidad se
--          resuelve fuera del sistema (soporte), no registrando el RUT de nuevo.
--        * Los folios son del RUT, no del comercio: los comercios de un grupo comparten el espacio
--          de folios (igual que en el SII: el CAF es del contribuyente).
--        * Cada comercio del grupo necesita sus propias credenciales y su propia verificación de
--          identidad.
--      Cambiar el RUT de un comercio con una emisión en curso (sending/unknown) está bloqueado.
--   3. A2 — crm_fiscal_issuances.issuer_rut: se fija al pasar a sending con el RUT del emisor
--      en ese momento y no cambia nunca más. Las filas existentes se completan con el
--      <RUTEmisor> del XML (si lo hay) o con el RUT del emisor. Registro permanente de folios
--      fiscal.document_folios con clave (issuer_rut, dte_type, folio): un folio no se repite
--      dentro del mismo emisor y tipo, pero dos contribuyentes distintos sí pueden usar el mismo
--      número. Un XML emitido cuyo <RUTEmisor> no es el del emisor no se acepta como issued.
--      La numeración interna de ventas (crm_invoices.invoice_number) no se toca.
--   4. C1 — Verificación de identidad credencial↔RUT (fiscal.identity_checks, solo inserción).
--      Cada verificación queda atada a la huella de la credencial vigente y al RUT esperado.
--      Cambiar la API key o el RUT la invalida sin que nadie tenga que acordarse. Ninguna fila
--      pasa a sending (ningún reclamo, ninguna llamada al proveedor) sin una verificación vigente
--      con resultado "match" y con un método aceptado en fiscal.dte39_emission_control
--      .identity_methods_accepted, que nace VACÍO: con esta migración la emisión queda
--      bloqueada para todos hasta decidir qué método se acepta (ver CONTRATO-DTECORE.md).
--   5. A4 — Ventas fiscalizadas inmutables en PostgreSQL. Si la venta tiene una fila fiscal en
--      sending, unknown, issued o cancelled, se rechazan cambios a: total, subtotal, descuento,
--      estado, fecha, pagado, origen y comercio de crm_invoices; cualquier alta, baja o cambio
--      de crm_invoice_items; y monto, medio, estado, anulación, moneda y venta de crm_payments.
--      Corrección legítima: un administrador autoriza la corrección de UNA venta dentro de UNA
--      transacción (crm_fiscal_authorize_tributary_correction) con motivo y evidencia; cada fila
--      cambiada queda en fiscal.admin_audit con valores antes/después. El documento emitido
--      (XML/PDF/folio) sigue siendo inmutable: corregir el documento tributario exige nota de
--      crédito.
--   6. A3 — fiscal.credit_notes: borradores de nota de crédito vinculados por clave foránea al
--      documento original (id, comercio, RUT emisor, folio). El paso a sending/issued está
--      BLOQUEADO en la base (FISCAL_CREDIT_NOTE_EMISSION_DISABLED) hasta verificar el contrato
--      de DTE Core y los requisitos tributarios.
--
-- No cambia: Mercado Pago Point, conector de impresión, numeración interna, interruptor global
-- (dte39_emission_control.enabled), triggers desactivados de P1/P3/P4.

begin;
set local lock_timeout = '5s';

-- 1. RUT canónico ----------------------------------------------------------------------------
create or replace function fiscal.normalize_rut(p_rut text)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v text;
  v_body text;
  v_dv text;
  v_sum integer := 0;
  v_mul integer := 2;
  v_r integer;
  i integer;
begin
  if p_rut is null then return null; end if;
  v := upper(regexp_replace(p_rut, '[.[:space:]]', '', 'g'));
  if v !~ '^[0-9]{1,8}-[0-9K]$' then return null; end if;
  v_body := ltrim(split_part(v, '-', 1), '0');
  v_dv := split_part(v, '-', 2);
  if v_body = '' then return null; end if;
  for i in reverse length(v_body)..1 loop
    v_sum := v_sum + substr(v_body, i, 1)::integer * v_mul;
    v_mul := case when v_mul = 7 then 2 else v_mul + 1 end;
  end loop;
  v_r := 11 - (v_sum % 11);
  if v_dv <> (case v_r when 11 then '0' when 10 then 'K' else v_r::text end) then
    return null;
  end if;
  return v_body || '-' || v_dv;
end;
$$;
comment on function fiscal.normalize_rut(text) is
  'RUT canónico 12345678-K (sin puntos ni ceros a la izquierda) o NULL si el formato o el dígito verificador no son válidos.';

-- <RUTEmisor> del XML de un DTE (base64). NULL si no se puede leer o no lo trae.
create or replace function fiscal.xml_rut_emisor(p_xml_base64 text)
returns text
language plpgsql
immutable
set search_path = pg_catalog, fiscal
as $$
declare v text;
begin
  if p_xml_base64 is null then return null; end if;
  v := substring(convert_from(decode(p_xml_base64, 'base64'), 'LATIN1')
                 from '<RUTEmisor>[[:space:]]*([0-9.]{1,12}-[0-9Kk])[[:space:]]*</RUTEmisor>');
  if v is null then return null; end if;
  return coalesce(fiscal.normalize_rut(v), upper(v));
exception when others then
  return null;
end;
$$;

-- 2. Revisión de datos existentes (aborta sin cambios si algo no cuadra) -------------------
do $$
declare v_bad integer; v_dup integer;
begin
  select count(*) into v_bad from fiscal.issuers where fiscal.normalize_rut(issuer_rut) is null;
  if v_bad > 0 then
    raise exception 'H_PRECHECK: % emisor(es) con RUT inválido (dígito verificador). Corregir antes de aplicar H.', v_bad;
  end if;
  select count(*) into v_dup from (
    select fiscal.normalize_rut(issuer_rut) from fiscal.issuers group by 1 having count(*) > 1) d;
  if v_dup > 0 then
    raise exception 'H_PRECHECK: % RUT emisor(es) repetidos entre comercios. Decidir caso a caso (grupo compartido o corrección) antes de aplicar H.', v_dup;
  end if;
end;
$$;

update fiscal.issuers set issuer_rut = fiscal.normalize_rut(issuer_rut)
 where issuer_rut is distinct from fiscal.normalize_rut(issuer_rut);

-- 3. A1 — Grupos de RUT compartido y unicidad -------------------------------------------------
create table if not exists fiscal.rut_share_groups (
  id uuid primary key default gen_random_uuid(),
  issuer_rut text not null unique check (issuer_rut ~ '^[0-9]{1,8}-[0-9K]$'),
  owner_user_id uuid not null,
  created_by uuid not null,
  reason text not null check (length(btrim(reason)) between 10 and 500),
  evidence_reference text not null check (length(btrim(evidence_reference)) between 8 and 300),
  created_at timestamptz not null default now()
);
alter table fiscal.rut_share_groups enable row level security;
comment on table fiscal.rut_share_groups is
  'RUT compartido entre comercios de una misma cuenta dueña. Solo lo crea un administrador de Walinka (crm_fiscal_create_rut_share).';

alter table fiscal.issuers add column if not exists rut_share_group uuid
  references fiscal.rut_share_groups(id) on delete restrict;

-- Red de seguridad declarativa para el caso común (sin grupo): dos comercios sin grupo nunca
-- comparten RUT, aun bajo concurrencia. El trigger cubre los casos con grupo.
create unique index if not exists issuers_rut_unshared_uq
  on fiscal.issuers (issuer_rut) where rut_share_group is null;

create or replace function fiscal.guard_issuer_rut()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fiscal
as $$
declare
  v_rut text := fiscal.normalize_rut(new.issuer_rut);
  v_group fiscal.rut_share_groups%rowtype;
  v_setup text := current_setting('fiscal.rut_share_setup', true);
begin
  if v_rut is null then
    raise exception 'FISCAL_ISSUER_RUT_INVALID' using errcode = 'P0001';
  end if;
  new.issuer_rut := v_rut;

  -- Upsert (INSERT ... ON CONFLICT DO UPDATE): si el comercio ya tiene fila, la revisión la hace
  -- el trigger de UPDATE con el grupo real de la fila.
  if tg_op = 'INSERT' and exists (select 1 from fiscal.issuers o where o.business_id = new.business_id) then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.issuer_rut is distinct from old.issuer_rut then
    if exists (select 1 from public.crm_fiscal_issuances f
                where f.business_id = new.business_id and f.status in ('sending', 'unknown')) then
      raise exception 'FISCAL_RUT_CHANGE_BLOCKED' using errcode = 'P0001';
    end if;
    -- Un grupo es de un RUT: al cambiar de RUT, el comercio sale del grupo.
    if new.rut_share_group is not distinct from old.rut_share_group then
      new.rut_share_group := null;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('fiscal_rut:' || v_rut, 0));

  if new.rut_share_group is not null then
    select * into v_group from fiscal.rut_share_groups g where g.id = new.rut_share_group;
    if not found or v_group.issuer_rut <> v_rut
       or not exists (select 1 from public.wa_businesses b
                       where b.id = new.business_id and b.user_id = v_group.owner_user_id) then
      raise exception 'FISCAL_RUT_SHARE_INVALID' using errcode = 'P0001';
    end if;
    -- Durante la creación del grupo (misma transacción del RPC de administrador) los demás
    -- miembros todavía no tienen el grupo asignado; el RPC verifica el resultado final.
    if v_setup is not null and v_setup = new.rut_share_group::text then
      return new;
    end if;
  end if;

  if exists (select 1 from fiscal.issuers o
              where o.issuer_rut = v_rut and o.business_id <> new.business_id
                and (new.rut_share_group is null or o.rut_share_group is distinct from new.rut_share_group)) then
    raise exception 'FISCAL_ISSUER_RUT_TAKEN' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists issuers_guard_rut on fiscal.issuers;
create trigger issuers_guard_rut
  before insert or update of issuer_rut, rut_share_group on fiscal.issuers
  for each row execute function fiscal.guard_issuer_rut();

-- 4. Auditoría: acciones nuevas ---------------------------------------------------------------
alter table fiscal.admin_audit drop constraint if exists admin_audit_action_check;
alter table fiscal.admin_audit add constraint admin_audit_action_check
  check (action in ('reconcile_attempt', 'reconcile_result', 'owner_changed', 'credentials_saved',
                    'credentials_removed', 'application_submitted', 'application_approved',
                    'application_rejected', 'application_suspended', 'tax_default_set', 'tax_product_set',
                    'identity_checked', 'rut_share_created', 'tributary_correction_authorized',
                    'tributary_correction_change', 'credit_note_drafted'));

create or replace function fiscal.is_walinka_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, auth
as $$
  select p_user_id is not null and exists (
    select 1 from auth.users u where u.id = p_user_id and u.raw_app_meta_data ->> 'role' = 'admin');
$$;

create or replace function public.crm_fiscal_create_rut_share(
  p_admin_user_id uuid, p_issuer_rut text, p_business_ids uuid[], p_reason text, p_evidence_reference text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, fiscal
as $$
declare
  v_rut text := fiscal.normalize_rut(p_issuer_rut);
  v_owner uuid;
  v_owners integer;
  v_group uuid;
  v_bid uuid;
begin
  if not fiscal.is_walinka_admin(p_admin_user_id) then
    raise exception 'FISCAL_REVIEWER_NOT_ADMIN';
  end if;
  if v_rut is null or p_business_ids is null or cardinality(p_business_ids) < 2
     or cardinality(p_business_ids) <> (select count(distinct x) from unnest(p_business_ids) x)
     or length(btrim(coalesce(p_reason, ''))) < 10 or length(btrim(coalesce(p_evidence_reference, ''))) < 8 then
    raise exception 'FISCAL_RUT_SHARE_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('fiscal_rut:' || v_rut, 0));

  select count(distinct b.user_id), min(b.user_id::text)::uuid into v_owners, v_owner
    from public.wa_businesses b where b.id = any(p_business_ids);
  if v_owners <> 1 or (select count(*) from public.wa_businesses b where b.id = any(p_business_ids))
                      <> cardinality(p_business_ids) then
    raise exception 'FISCAL_RUT_SHARE_DIFFERENT_OWNERS';
  end if;
  -- Ningún comercio FUERA de la lista puede tener ya este RUT.
  if exists (select 1 from fiscal.issuers i where i.issuer_rut = v_rut and not (i.business_id = any(p_business_ids))) then
    raise exception 'FISCAL_ISSUER_RUT_TAKEN';
  end if;
  -- Los comercios de la lista que ya tienen emisor deben tener este RUT.
  if exists (select 1 from fiscal.issuers i where i.business_id = any(p_business_ids) and i.issuer_rut <> v_rut) then
    raise exception 'FISCAL_RUT_SHARE_RUT_MISMATCH';
  end if;

  insert into fiscal.rut_share_groups (issuer_rut, owner_user_id, created_by, reason, evidence_reference)
  values (v_rut, v_owner, p_admin_user_id, btrim(p_reason), btrim(p_evidence_reference))
  returning id into v_group;

  perform set_config('fiscal.rut_share_setup', v_group::text, true);
  foreach v_bid in array p_business_ids loop
    insert into fiscal.issuers (business_id, issuer_rut, provider, enabled, verified, rut_share_group)
    values (v_bid, v_rut, 'dtecore', false, false, v_group)
    on conflict (business_id) do update set rut_share_group = v_group, updated_at = now();
  end loop;
  perform set_config('fiscal.rut_share_setup', '', true);

  if exists (select 1 from fiscal.issuers i where i.issuer_rut = v_rut and i.rut_share_group is distinct from v_group) then
    raise exception 'FISCAL_RUT_SHARE_INVALID';
  end if;

  foreach v_bid in array p_business_ids loop
    insert into fiscal.admin_audit (business_id, sale_id, actor_user_id, action, outcome, detail)
    values (v_bid, null, p_admin_user_id, 'rut_share_created', 'created',
            jsonb_build_object('group_id', v_group, 'issuer_rut', v_rut, 'businesses', to_jsonb(p_business_ids),
                               'reason', btrim(p_reason), 'evidence_reference', btrim(p_evidence_reference)));
  end loop;
  return v_group;
end;
$$;

-- 5. C1 — Verificación de identidad credencial↔RUT ------------------------------------------
alter table fiscal.dte39_emission_control
  add column if not exists identity_methods_accepted text[] not null default '{}';
alter table fiscal.dte39_emission_control drop constraint if exists dte39_emission_control_identity_methods_check;
alter table fiscal.dte39_emission_control add constraint dte39_emission_control_identity_methods_check
  check (identity_methods_accepted <@ array['provider_api', 'manual_admin']::text[]);
comment on column fiscal.dte39_emission_control.identity_methods_accepted is
  'Métodos de verificación credencial↔RUT que habilitan el paso a sending. Vacío = nadie emite. provider_api solo tras verificar el endpoint de identidad de DTE Core; manual_admin solo si Walinka lo decide expresamente.';

create table if not exists fiscal.identity_checks (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.wa_businesses(id) on delete restrict,
  provider text not null check (provider = 'dtecore'),
  key_version integer not null,
  credential_fp text not null check (credential_fp ~ '^[0-9a-f]{64}$'),
  expected_rut text not null check (expected_rut ~ '^[0-9]{1,8}-[0-9K]$'),
  observed_rut text check (observed_rut is null or length(observed_rut) <= 16),
  method text not null check (method in ('provider_api', 'manual_admin')),
  outcome text not null check (outcome in ('match', 'mismatch', 'unavailable')),
  actor_user_id uuid not null,
  evidence_reference text check (evidence_reference is null or length(evidence_reference) between 8 and 300),
  detail jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default clock_timestamp(),
  check ((outcome = 'unavailable') = (observed_rut is null)),
  check (method <> 'manual_admin' or evidence_reference is not null)
);
create index if not exists identity_checks_business_idx on fiscal.identity_checks (business_id, id desc);
alter table fiscal.identity_checks enable row level security;
drop trigger if exists identity_checks_append_only on fiscal.identity_checks;
create trigger identity_checks_append_only before update or delete on fiscal.identity_checks
  for each row execute function fiscal.dte39_evidence_append_only();

-- Huella de la credencial cifrada vigente (no revela la clave: es un hash del sobre cifrado).
create or replace function fiscal.credential_fp(p_business_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, fiscal
as $$
  select encode(sha256(c.ciphertext || c.iv || c.auth_tag || convert_to(c.provider || ':' || c.key_version::text, 'UTF8')), 'hex')
    from fiscal.business_credentials c where c.business_id = p_business_id;
$$;

-- Motivo por el que el comercio NO puede emitir por identidad, o NULL si puede.
create or replace function fiscal.identity_block_reason(p_business_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, fiscal
as $$
  select case
           when i.business_id is null then 'issuer_missing'
           when c.business_id is null then 'credentials_missing'
           when k.id is null then 'not_checked'
           when k.outcome <> 'match' then 'last_check_' || k.outcome
           when k.credential_fp <> fiscal.credential_fp(p_business_id) then 'credentials_changed'
           when k.expected_rut <> i.issuer_rut or k.observed_rut is distinct from i.issuer_rut then 'rut_changed'
           when not exists (select 1 from fiscal.dte39_emission_control ctl
                             where ctl.singleton and k.method = any(ctl.identity_methods_accepted)) then 'method_not_accepted'
           else null
         end
    from (select p_business_id as bid) b
    left join fiscal.issuers i on i.business_id = b.bid
    left join fiscal.business_credentials c on c.business_id = b.bid
    -- Una consulta "unavailable" (proveedor sin respuesta) no anula la última verificación concluyente.
    left join lateral (select * from fiscal.identity_checks x where x.business_id = b.bid
                          and x.outcome <> 'unavailable'
                        order by x.id desc limit 1) k on true;
$$;

create or replace function fiscal.identity_state(p_business_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, fiscal
as $$
  select jsonb_build_object(
    'verified', fiscal.identity_block_reason(p_business_id) is null,
    'block_reason', fiscal.identity_block_reason(p_business_id),
    'last_outcome', k.outcome, 'last_method', k.method, 'checked_at', k.checked_at)
    from (select p_business_id as bid) b
    left join lateral (select * from fiscal.identity_checks x where x.business_id = b.bid
                        order by x.id desc limit 1) k on true;
$$;

-- Registra una verificación. El resultado lo calcula la base comparando el RUT observado con el
-- RUT del emisor, bajo el mismo candado que guardar/cambiar/desconectar credenciales y reclamar.
--   provider_api: el servidor consultó un endpoint de identidad de solo lectura del proveedor
--                 (hoy NO verificado; fiscal-emit no lo usa). p_observed_rut = RUT informado.
--   manual_admin: un administrador de Walinka constató el RUT de la cuenta DTE Core dueña de la
--                 API key; exige evidencia. Solo habilita emisión si Walinka acepta ese método.
create or replace function public.crm_fiscal_record_identity_check(
  p_business_id uuid, p_actor_user_id uuid, p_method text, p_observed_rut text,
  p_evidence_reference text default null, p_detail jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, fiscal
as $$
declare
  v_issuer fiscal.issuers%rowtype;
  v_cred fiscal.business_credentials%rowtype;
  v_observed text;
  v_outcome text;
  v_evidence text := nullif(btrim(coalesce(p_evidence_reference, '')), '');
begin
  if p_business_id is null or p_actor_user_id is null or p_method not in ('provider_api', 'manual_admin')
     or (v_evidence is not null and length(v_evidence) not between 8 and 300)
     or (p_detail is not null and jsonb_typeof(p_detail) <> 'object') then
    raise exception 'FISCAL_IDENTITY_CHECK_INVALID';
  end if;
  if p_method = 'manual_admin' and (not fiscal.is_walinka_admin(p_actor_user_id) or v_evidence is null) then
    raise exception 'FISCAL_IDENTITY_CHECK_NOT_ADMIN';
  end if;
  if p_observed_rut is not null then
    v_observed := fiscal.normalize_rut(p_observed_rut);
    if v_observed is null then raise exception 'FISCAL_IDENTITY_CHECK_INVALID'; end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('fiscal_connection:' || p_business_id::text, 0));
  select * into v_issuer from fiscal.issuers where business_id = p_business_id;
  select * into v_cred from fiscal.business_credentials where business_id = p_business_id;
  if v_issuer.business_id is null or v_cred.business_id is null then
    raise exception 'FISCAL_CREDENTIALS_MISSING';
  end if;

  v_outcome := case when v_observed is null then 'unavailable'
                    when v_observed = v_issuer.issuer_rut then 'match' else 'mismatch' end;
  insert into fiscal.identity_checks (business_id, provider, key_version, credential_fp, expected_rut,
                                      observed_rut, method, outcome, actor_user_id, evidence_reference, detail)
  values (p_business_id, v_cred.provider, v_cred.key_version, fiscal.credential_fp(p_business_id),
          v_issuer.issuer_rut, v_observed, p_method, v_outcome, p_actor_user_id, v_evidence,
          coalesce(p_detail, '{}'::jsonb));
  insert into fiscal.admin_audit (business_id, sale_id, actor_user_id, action, outcome, detail)
  values (p_business_id, null, p_actor_user_id, 'identity_checked', v_outcome,
          jsonb_build_object('method', p_method, 'expected_rut', v_issuer.issuer_rut,
                             'observed_rut', v_observed, 'key_version', v_cred.key_version,
                             'evidence_reference', v_evidence));
  return jsonb_build_object('outcome', v_outcome, 'block_reason', fiscal.identity_block_reason(p_business_id));
end;
$$;

-- 6. A2 — RUT emisor permanente en cada documento y registro de folios ---------------------
alter table public.crm_fiscal_issuances add column if not exists issuer_rut text;

-- Completar filas existentes: issued/cancelled con el <RUTEmisor> del XML (es lo que dice el
-- documento) y, si no lo trae, con el RUT del emisor; sending/unknown con el RUT del emisor.
update public.crm_fiscal_issuances f
   set issuer_rut = coalesce(case when f.status in ('issued', 'cancelled') then fiscal.xml_rut_emisor(f.xml_base64) end,
                             (select s.issuer_rut from fiscal.issuers s where s.business_id = f.business_id))
 where f.issuer_rut is null and f.status in ('sending', 'unknown', 'issued', 'cancelled');

do $$
declare v_missing integer; v_diff integer;
begin
  select count(*) into v_missing from public.crm_fiscal_issuances
   where issuer_rut is null and status in ('sending', 'unknown', 'issued', 'cancelled');
  if v_missing > 0 then
    raise exception 'H_PRECHECK: % documento(s) fiscal(es) sin RUT emisor determinable. No se aplica H.', v_missing;
  end if;
  select count(*) into v_diff from public.crm_fiscal_issuances f join fiscal.issuers s on s.business_id = f.business_id
   where f.issuer_rut is distinct from s.issuer_rut and f.status in ('issued', 'cancelled');
  if v_diff > 0 then
    raise notice 'H: % documento(s) emitido(s) con un RUT distinto del emisor actual del comercio (se conserva el del XML).', v_diff;
  end if;
end;
$$;

alter table public.crm_fiscal_issuances drop constraint if exists crm_fiscal_issuances_issuer_rut_check;
alter table public.crm_fiscal_issuances add constraint crm_fiscal_issuances_issuer_rut_check
  check ((issuer_rut is null or issuer_rut ~ '^[0-9]{1,8}-[0-9K]$')
         and (issuer_rut is not null or status in ('pending', 'failed')));
-- Destino de la clave foránea de las notas de crédito (documento original exacto).
alter table public.crm_fiscal_issuances drop constraint if exists crm_fiscal_issuances_document_key;
alter table public.crm_fiscal_issuances add constraint crm_fiscal_issuances_document_key
  unique (id, business_id, issuer_rut, folio);

create table if not exists fiscal.document_folios (
  issuer_rut text not null check (issuer_rut ~ '^[0-9]{1,8}-[0-9K]$'),
  dte_type integer not null check (dte_type in (33, 34, 39, 41, 52, 56, 61)),
  folio integer not null check (folio > 0),
  business_id uuid not null,
  source_table text not null check (source_table in ('crm_fiscal_issuances', 'credit_notes', 'fiscal.operations')),
  source_id uuid not null,
  registered_at timestamptz not null default now(),
  primary key (issuer_rut, dte_type, folio),
  unique (source_table, source_id)
);
alter table fiscal.document_folios enable row level security;
drop trigger if exists document_folios_append_only on fiscal.document_folios;
create trigger document_folios_append_only before update or delete on fiscal.document_folios
  for each row execute function fiscal.dte39_evidence_append_only();
comment on table fiscal.document_folios is
  'Registro permanente de folios emitidos por (RUT emisor, tipo DTE, folio). Distintos contribuyentes pueden repetir el número; el mismo emisor y tipo, no.';

create or replace function fiscal.register_folio(
  p_issuer_rut text, p_dte_type integer, p_folio integer, p_business_id uuid, p_source text, p_source_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, fiscal
as $$
declare v_existing fiscal.document_folios%rowtype;
begin
  insert into fiscal.document_folios (issuer_rut, dte_type, folio, business_id, source_table, source_id)
  values (p_issuer_rut, p_dte_type, p_folio, p_business_id, p_source, p_source_id)
  on conflict do nothing;
  if found then return; end if;
  select * into v_existing from fiscal.document_folios
   where issuer_rut = p_issuer_rut and dte_type = p_dte_type and folio = p_folio;
  if not found or v_existing.source_table <> p_source or v_existing.source_id <> p_source_id then
    raise exception 'FISCAL_FOLIO_DUPLICATE' using errcode = 'P0001',
      detail = format('emisor %s tipo %s folio %s ya registrado', p_issuer_rut, p_dte_type, p_folio);
  end if;
end;
$$;

-- Folios ya existentes: documentos del ledger y del circuito heredado P1.
insert into fiscal.document_folios (issuer_rut, dte_type, folio, business_id, source_table, source_id)
select f.issuer_rut, f.dte_type, f.folio, f.business_id, 'crm_fiscal_issuances', f.id
  from public.crm_fiscal_issuances f
 where f.status in ('issued', 'cancelled') and f.folio is not null;
insert into fiscal.document_folios (issuer_rut, dte_type, folio, business_id, source_table, source_id)
select fiscal.normalize_rut(o.issuer_rut), o.document_type, o.folio, o.business_id, 'fiscal.operations', o.id
  from fiscal.operations o
 where o.folio is not null and fiscal.normalize_rut(o.issuer_rut) is not null
   and o.document_type in (33, 34, 39, 41, 52, 56, 61);
-- (Un choque entre ambos circuitos aborta la migración por la clave primaria.)

create or replace function fiscal.guard_issuance_identity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fiscal
as $$
declare
  v_rut text;
  v_reason text;
  v_xml_rut text;
begin
  if new.issuer_rut is not null then
    new.issuer_rut := coalesce(fiscal.normalize_rut(new.issuer_rut), new.issuer_rut);
  end if;
  if tg_op = 'UPDATE' and old.issuer_rut is not null and old.status <> 'pending'
     and new.issuer_rut is distinct from old.issuer_rut then
    raise exception 'FISCAL_ISSUER_RUT_IMMUTABLE' using errcode = 'P0001';
  end if;

  -- Paso a sending: el RUT del documento es el del emisor en este instante, y la identidad
  -- credencial↔RUT debe estar verificada. Sin esto no hay reclamo ni llamada al proveedor.
  if new.status = 'sending' and (tg_op = 'INSERT' or old.status <> 'sending') then
    select s.issuer_rut into v_rut from fiscal.issuers s where s.business_id = new.business_id;
    if v_rut is null then
      raise exception 'FISCAL_ISSUER_NOT_ENABLED' using errcode = 'P0001';
    end if;
    if tg_op = 'UPDATE' and old.issuer_rut is not null and old.issuer_rut <> v_rut then
      raise exception 'FISCAL_ISSUER_RUT_IMMUTABLE' using errcode = 'P0001';
    end if;
    new.issuer_rut := v_rut;
    v_reason := fiscal.identity_block_reason(new.business_id);
    if v_reason is not null then
      raise exception 'FISCAL_IDENTITY_NOT_VERIFIED: %', v_reason using errcode = 'P0001';
    end if;
  end if;

  if new.issuer_rut is null and new.status in ('unknown', 'issued', 'cancelled') then
    select s.issuer_rut into new.issuer_rut from fiscal.issuers s where s.business_id = new.business_id;
  end if;

  -- Un documento emitido debe declarar el mismo emisor que el ledger.
  if new.status = 'issued' and (tg_op = 'INSERT' or old.status <> 'issued') then
    v_xml_rut := fiscal.xml_rut_emisor(new.xml_base64);
    if v_xml_rut is not null and v_xml_rut is distinct from new.issuer_rut then
      raise exception 'FISCAL_DOCUMENT_ISSUER_MISMATCH' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_fiscal_issuances_identity on public.crm_fiscal_issuances;
create trigger crm_fiscal_issuances_identity
  before insert or update on public.crm_fiscal_issuances
  for each row execute function fiscal.guard_issuance_identity();

create or replace function fiscal.register_issuance_folio()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fiscal
as $$
begin
  if new.status in ('issued', 'cancelled') and new.folio is not null then
    perform fiscal.register_folio(new.issuer_rut, new.dte_type, new.folio, new.business_id,
                                  'crm_fiscal_issuances', new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists crm_fiscal_issuances_register_folio on public.crm_fiscal_issuances;
create trigger crm_fiscal_issuances_register_folio
  after insert or update of status, folio on public.crm_fiscal_issuances
  for each row execute function fiscal.register_issuance_folio();

-- Recuperación desde recibo (versión de C) + conflicto documental: si el recibo trae un folio ya
-- registrado para el emisor o un XML de otro emisor, la fila NO queda issued ni se queda en
-- sending para siempre (lo que detendría la recuperación de todos los comercios): pasa a unknown
-- con el código del conflicto y el folio como pista, para conciliación manual. Nunca se reemite.
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
  v_code text;
begin
  perform pg_advisory_xact_lock(hashtextextended('fiscal_sale:' || p_sale_id::text, 0));
  select * into v_r from fiscal.crm_fiscal_provider_receipts
   where business_id = p_business_id and sale_id = p_sale_id and operation_id = p_operation_id;
  if not found then return false; end if;
  begin
    update public.crm_fiscal_issuances
       set status = 'issued', folio = v_r.folio, xml_base64 = v_r.xml_base64, pdf_base64 = v_r.pdf_base64,
           error_code = null, updated_at = now()
     where business_id = p_business_id and sale_id = p_sale_id and dte_type = 39
       and operation_id = p_operation_id and provider in ('siisolutions', 'dtecore') and status = 'sending';
    get diagnostics v_count = row_count;
    return v_count = 1;
  exception when raise_exception then
    v_code := case when sqlerrm like 'FISCAL_FOLIO_DUPLICATE%' then 'FOLIO_DUPLICATE'
                   when sqlerrm like 'FISCAL_DOCUMENT_ISSUER_MISMATCH%' then 'DOCUMENT_ISSUER_MISMATCH' end;
    if v_code is null then raise; end if;
    update public.crm_fiscal_issuances
       set status = 'unknown', folio = v_r.folio, xml_base64 = null, pdf_base64 = null,
           error_code = v_code, updated_at = now()
     where business_id = p_business_id and sale_id = p_sale_id and dte_type = 39
       and operation_id = p_operation_id and status = 'sending';
    return false;
  end;
end;
$$;
revoke all on function public.crm_fiscal_finalize_from_receipt(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.crm_fiscal_finalize_from_receipt(uuid, uuid, text) to service_role;

-- 7. A4 — Ventas fiscalizadas inmutables ----------------------------------------------------
create table if not exists fiscal.tributary_corrections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  sale_id uuid not null,
  txid bigint not null default txid_current(),
  admin_user_id uuid not null,
  reason text not null check (length(btrim(reason)) between 10 and 500),
  evidence_reference text not null check (length(btrim(evidence_reference)) between 8 and 300),
  created_at timestamptz not null default now(),
  foreign key (sale_id, business_id) references public.crm_invoices(id, business_id)
);
create index if not exists tributary_corrections_sale_tx_idx on fiscal.tributary_corrections (sale_id, txid);
alter table fiscal.tributary_corrections enable row level security;
drop trigger if exists tributary_corrections_append_only on fiscal.tributary_corrections;
create trigger tributary_corrections_append_only before update or delete on fiscal.tributary_corrections
  for each row execute function fiscal.dte39_evidence_append_only();

create index if not exists crm_fiscal_issuances_sale_idx on public.crm_fiscal_issuances (sale_id);

create or replace function fiscal.sale_is_fiscalized(p_sale_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_sale_id is not null and exists (
    select 1 from public.crm_fiscal_issuances f
     where f.sale_id = p_sale_id and f.status in ('sending', 'unknown', 'issued', 'cancelled'));
$$;

-- Trigger genérico. TG_ARGV[0] = columna con el id de la venta; TG_ARGV[1..] = columnas con
-- contenido tributario. INSERT/DELETE siempre cuentan como cambio.
create or replace function fiscal.guard_fiscalized_sale()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fiscal
as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_cols text[] := '{}';
  v_sales uuid[];
  v_sale uuid;
  v_correction fiscal.tributary_corrections%rowtype;
  i integer;
begin
  if tg_op = 'UPDATE' then
    for i in 1 .. tg_nargs - 1 loop
      if (v_old -> tg_argv[i]) is distinct from (v_new -> tg_argv[i]) then
        v_cols := v_cols || tg_argv[i];
      end if;
    end loop;
    if cardinality(v_cols) = 0 then return new; end if;
  end if;

  v_sales := array_remove(array[(v_old ->> tg_argv[0])::uuid, (v_new ->> tg_argv[0])::uuid], null);
  foreach v_sale in array coalesce((select array_agg(distinct s) from unnest(v_sales) s), '{}'::uuid[]) loop
    if fiscal.sale_is_fiscalized(v_sale) then
      select * into v_correction from fiscal.tributary_corrections c
       where c.sale_id = v_sale and c.txid = txid_current()
       order by c.created_at desc limit 1;
      if not found then
        raise exception 'FISCAL_SALE_TRIBUTARY_LOCKED' using errcode = 'P0001',
          detail = format('%s %s sobre una venta con documento fiscal; use nota de crédito o una corrección autorizada',
                          tg_op, tg_table_name);
      end if;
      insert into fiscal.admin_audit (business_id, sale_id, actor_user_id, action, outcome, detail)
      values (v_correction.business_id, v_sale, v_correction.admin_user_id, 'tributary_correction_change',
              lower(tg_op),
              jsonb_build_object('correction_id', v_correction.id, 'table', tg_table_name, 'columns', to_jsonb(v_cols),
                                 'old', v_old, 'new', v_new));
    end if;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists crm_invoices_fiscal_lock on public.crm_invoices;
create trigger crm_invoices_fiscal_lock
  before update or delete on public.crm_invoices
  for each row execute function fiscal.guard_fiscalized_sale(
    'id', 'id', 'business_id', 'status', 'issue_date', 'subtotal', 'discount_amount', 'total', 'paid_at', 'source');

drop trigger if exists crm_invoice_items_fiscal_lock on public.crm_invoice_items;
create trigger crm_invoice_items_fiscal_lock
  before insert or update or delete on public.crm_invoice_items
  for each row execute function fiscal.guard_fiscalized_sale(
    'invoice_id', 'invoice_id', 'product_id', 'name', 'description', 'unit_price', 'quantity', 'discount_pct',
    'subtotal', 'sort_order', 'discount_type');

drop trigger if exists crm_payments_fiscal_lock on public.crm_payments;
create trigger crm_payments_fiscal_lock
  before insert or update or delete on public.crm_payments
  for each row execute function fiscal.guard_fiscalized_sale(
    'invoice_id', 'invoice_id', 'business_id', 'amount', 'payment_method', 'payment_status', 'voided_at', 'currency');

-- Autoriza corregir UNA venta fiscalizada dentro de la transacción actual. Uso (SQL, como
-- service_role o postgres):
--   begin;
--   select public.crm_fiscal_authorize_tributary_correction(<negocio>, <venta>, <admin>, '<motivo>', '<evidencia>');
--   update public.crm_invoices ... ;   -- cada fila cambiada queda en fiscal.admin_audit
--   commit;
-- No toca el documento emitido (XML/PDF/folio siguen inmutables).
create or replace function public.crm_fiscal_authorize_tributary_correction(
  p_business_id uuid, p_sale_id uuid, p_admin_user_id uuid, p_reason text, p_evidence_reference text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, fiscal
as $$
declare v_id uuid;
begin
  if not fiscal.is_walinka_admin(p_admin_user_id) then
    raise exception 'FISCAL_REVIEWER_NOT_ADMIN';
  end if;
  if p_business_id is null or p_sale_id is null
     or length(btrim(coalesce(p_reason, ''))) < 10 or length(btrim(coalesce(p_evidence_reference, ''))) < 8 then
    raise exception 'FISCAL_CORRECTION_INVALID';
  end if;
  if not exists (select 1 from public.crm_invoices i where i.id = p_sale_id and i.business_id = p_business_id) then
    raise exception 'FISCAL_CORRECTION_INVALID';
  end if;
  if not fiscal.sale_is_fiscalized(p_sale_id) then
    raise exception 'FISCAL_CORRECTION_NOT_NEEDED';
  end if;
  insert into fiscal.tributary_corrections (business_id, sale_id, admin_user_id, reason, evidence_reference)
  values (p_business_id, p_sale_id, p_admin_user_id, btrim(p_reason), btrim(p_evidence_reference))
  returning id into v_id;
  insert into fiscal.admin_audit (business_id, sale_id, actor_user_id, action, outcome, detail)
  values (p_business_id, p_sale_id, p_admin_user_id, 'tributary_correction_authorized', 'authorized',
          jsonb_build_object('correction_id', v_id, 'reason', btrim(p_reason),
                             'evidence_reference', btrim(p_evidence_reference)));
  return v_id;
end;
$$;

-- 8. A3 — Notas de crédito (DTE 61): solo borradores ------------------------------------------
create table if not exists fiscal.credit_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  original_issuance_id uuid not null,
  issuer_rut text not null check (issuer_rut ~ '^[0-9]{1,8}-[0-9K]$'),
  original_dte_type integer not null check (original_dte_type = 39),
  original_folio integer not null check (original_folio > 0),
  original_issued_at timestamptz not null,
  dte_type integer not null default 61 check (dte_type = 61),
  operation_id text not null check (length(operation_id) between 1 and 100),
  -- Códigos de referencia SII: 1 anula el documento, 2 corrige texto, 3 corrige montos.
  cod_ref smallint not null check (cod_ref in (1, 2, 3)),
  razon_ref text not null check (length(btrim(razon_ref)) between 1 and 90),
  amount_total numeric(14, 0) not null check (amount_total >= 0),
  lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'sending', 'unknown', 'issued', 'failed', 'cancelled')),
  folio integer check (folio is null or folio > 0),
  xml_base64 text,
  pdf_base64 text,
  error_code text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, operation_id),
  check ((cod_ref = 2) = (amount_total = 0)),
  foreign key (original_issuance_id, business_id, issuer_rut, original_folio)
    references public.crm_fiscal_issuances (id, business_id, issuer_rut, folio) on delete restrict
);
create index if not exists credit_notes_original_idx on fiscal.credit_notes (original_issuance_id);
alter table fiscal.credit_notes enable row level security;

create or replace function fiscal.guard_credit_note()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fiscal
as $$
begin
  -- Emisión real de DTE 61 deshabilitada hasta verificar contrato y requisitos tributarios.
  if new.status in ('sending', 'unknown', 'issued') then
    raise exception 'FISCAL_CREDIT_NOTE_EMISSION_DISABLED' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and (new.business_id, new.original_issuance_id, new.issuer_rut, new.original_folio,
                           new.dte_type, new.operation_id)
                          is distinct from (old.business_id, old.original_issuance_id, old.issuer_rut,
                                            old.original_folio, old.dte_type, old.operation_id) then
    raise exception 'FISCAL_CREDIT_NOTE_IMMUTABLE' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists credit_notes_guard on fiscal.credit_notes;
create trigger credit_notes_guard before insert or update on fiscal.credit_notes
  for each row execute function fiscal.guard_credit_note();

-- Borrador de nota de crédito para una boleta emitida del mismo comercio. Reglas:
--   - el documento original debe estar issued y pertenecer al comercio;
--   - la NC hereda el RUT emisor del original (la clave foránea lo exige);
--   - cod_ref 1 (anula): monto = total de la venta y no puede existir otra NC vigente;
--   - cod_ref 3 (corrige montos): 0 < monto <= saldo no acreditado;
--   - cod_ref 2 (corrige texto): monto 0.
--   Reglas tributarias a confirmar con contador/SII antes de emitir (ver docs/NOTA-CREDITO-DTE61.md).
create or replace function public.crm_fiscal_draft_credit_note(
  p_business_id uuid, p_sale_id uuid, p_actor_user_id uuid, p_cod_ref integer, p_razon_ref text,
  p_amount_total numeric, p_lines jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, fiscal
as $$
declare
  v_orig public.crm_fiscal_issuances%rowtype;
  v_total numeric;
  v_credited numeric;
  v_id uuid;
  v_seq integer;
begin
  if p_business_id is null or p_sale_id is null or p_actor_user_id is null or p_cod_ref not in (1, 2, 3)
     or p_amount_total is null or p_amount_total < 0 or p_amount_total <> trunc(p_amount_total)
     or length(btrim(coalesce(p_razon_ref, ''))) not between 1 and 90
     or p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'FISCAL_CREDIT_NOTE_INVALID';
  end if;
  if not (fiscal.has_role(p_business_id, p_actor_user_id, 'fiscal_owner')
          or fiscal.has_role(p_business_id, p_actor_user_id, 'fiscal_reconciler')) then
    raise exception 'FISCAL_FORBIDDEN';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('fiscal_sale:' || p_sale_id::text, 0));
  select * into v_orig from public.crm_fiscal_issuances f
   where f.business_id = p_business_id and f.sale_id = p_sale_id and f.dte_type = 39;
  if not found or v_orig.status <> 'issued' or v_orig.folio is null or v_orig.issuer_rut is null then
    raise exception 'FISCAL_CREDIT_NOTE_ORIGINAL_NOT_ISSUED';
  end if;
  select i.total into v_total from public.crm_invoices i where i.id = p_sale_id and i.business_id = p_business_id;
  select coalesce(sum(n.amount_total), 0) into v_credited from fiscal.credit_notes n
   where n.original_issuance_id = v_orig.id and n.status not in ('failed', 'cancelled');
  if p_cod_ref = 1 and (p_amount_total <> v_total or exists (
       select 1 from fiscal.credit_notes n where n.original_issuance_id = v_orig.id and n.status not in ('failed', 'cancelled'))) then
    raise exception 'FISCAL_CREDIT_NOTE_AMOUNT';
  end if;
  if p_cod_ref = 3 and (p_amount_total <= 0 or p_amount_total > v_total - v_credited) then
    raise exception 'FISCAL_CREDIT_NOTE_AMOUNT';
  end if;
  if p_cod_ref = 2 and p_amount_total <> 0 then
    raise exception 'FISCAL_CREDIT_NOTE_AMOUNT';
  end if;
  select count(*) + 1 into v_seq from fiscal.credit_notes n where n.original_issuance_id = v_orig.id;

  insert into fiscal.credit_notes (business_id, original_issuance_id, issuer_rut, original_dte_type, original_folio,
                                   original_issued_at, operation_id, cod_ref, razon_ref, amount_total, lines,
                                   status, created_by)
  values (p_business_id, v_orig.id, v_orig.issuer_rut, 39, v_orig.folio, coalesce(v_orig.issued_at, v_orig.updated_at),
          'WLK-NC-' || v_orig.id::text || '-' || v_seq::text, p_cod_ref, btrim(p_razon_ref), p_amount_total, p_lines,
          'draft', p_actor_user_id)
  returning id into v_id;
  insert into fiscal.admin_audit (business_id, sale_id, actor_user_id, action, outcome, detail)
  values (p_business_id, p_sale_id, p_actor_user_id, 'credit_note_drafted', 'draft',
          jsonb_build_object('credit_note_id', v_id, 'cod_ref', p_cod_ref, 'amount_total', p_amount_total,
                             'original_folio', v_orig.folio, 'issuer_rut', v_orig.issuer_rut));
  return v_id;
end;
$$;

-- 9. Contexto de emisión y estado de conexión con identidad ---------------------------------
create or replace function public.crm_fiscal_emission_context(p_business_id uuid, p_sale_id uuid)
returns jsonb
language sql
stable
set search_path = public, fiscal
as $$
  select jsonb_build_object(
    'issuer', (select jsonb_build_object(
                        'issuer_rut', s.issuer_rut, 'enabled', s.enabled, 'verified', s.verified,
                        'sucursal_nombre', s.sucursal_nombre, 'sucursal_codigo', s.sucursal_codigo,
                        'resolucion_numero', s.resolucion_numero, 'resolucion_fecha', s.resolucion_fecha,
                        'identity_verified', fiscal.identity_block_reason(p_business_id) is null,
                        'identity_block_reason', fiscal.identity_block_reason(p_business_id))
                 from fiscal.issuers s where s.business_id = p_business_id),
    'emission_enabled', exists (select 1 from fiscal.dte39_emission_control c where c.singleton and c.enabled),
    'tax_lines_verified', fiscal.sale_tax_lines_verified(p_business_id, p_sale_id),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'unit_price', i.unit_price,
                                          'quantity', i.quantity, 'discount_pct', i.discount_pct,
                                          'category', fiscal.line_tax_category(p_business_id, p_sale_id, i.id))
                       order by i.sort_order nulls last, i.id)
        from public.crm_invoice_items i
       where i.invoice_id = p_sale_id), '[]'::jsonb),
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

create or replace function public.crm_fiscal_connection_status(p_business_id uuid)
returns jsonb
language sql
stable
set search_path = public, fiscal
as $$
  select jsonb_build_object(
    'connected', c.business_id is not null,
    'issuerRut', i.issuer_rut,
    'enabled', coalesce(i.enabled, false),
    'verified', coalesce(i.verified, false),
    'keyVersion', c.key_version,
    'updatedAt', greatest(c.updated_at, i.updated_at),
    'reviewStatus', coalesce(i.review_status, 'draft'),
    'reviewNote', i.review_note,
    'submittedAt', i.submitted_at,
    'reviewedAt', i.reviewed_at,
    'resolucionNumero', i.resolucion_numero,
    'resolucionFecha', i.resolucion_fecha,
    'sucursalNombre', i.sucursal_nombre,
    'sucursalCodigo', i.sucursal_codigo,
    'defaultTaxCategory', i.default_tax_category,
    'identityVerified', fiscal.identity_block_reason(b.bid) is null,
    'identityBlockReason', fiscal.identity_block_reason(b.bid),
    'rutShared', i.rut_share_group is not null)
  from (select p_business_id as bid) b
  left join fiscal.business_credentials c on c.business_id = b.bid
  left join fiscal.issuers i on i.business_id = b.bid;
$$;

create or replace function public.crm_fiscal_get_issuance(p_business_id uuid, p_sale_id uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
           'id', f.id, 'status', f.status, 'folio', f.folio, 'pdf_base64', f.pdf_base64,
           'has_xml', f.xml_base64 is not null, 'error_code', f.error_code,
           'sii_status', f.sii_status, 'sii_track_id', f.sii_track_id, 'sii_checked_at', f.sii_checked_at,
           'issued_at', f.issued_at, 'updated_at', f.updated_at, 'issuer_rut', f.issuer_rut)
    from public.crm_fiscal_issuances f
   where f.business_id = p_business_id and f.sale_id = p_sale_id and f.dte_type = 39;
$$;

-- 10. Permisos --------------------------------------------------------------------------------
-- Tablas nuevas: sin acceso directo para anon/authenticated (el esquema fiscal no les da USAGE);
-- service_role solo lee. Todas las escrituras pasan por funciones SECURITY DEFINER.
revoke all on fiscal.rut_share_groups, fiscal.identity_checks, fiscal.document_folios,
              fiscal.tributary_corrections, fiscal.credit_notes from public, anon, authenticated, service_role;
grant select on fiscal.rut_share_groups, fiscal.identity_checks, fiscal.document_folios,
                fiscal.tributary_corrections, fiscal.credit_notes to service_role;

revoke all on function fiscal.normalize_rut(text) from public, anon, authenticated;
revoke all on function fiscal.xml_rut_emisor(text) from public, anon, authenticated;
revoke all on function fiscal.guard_issuer_rut() from public, anon, authenticated;
revoke all on function fiscal.is_walinka_admin(uuid) from public, anon, authenticated;
revoke all on function fiscal.credential_fp(uuid) from public, anon, authenticated;
revoke all on function fiscal.identity_block_reason(uuid) from public, anon, authenticated;
revoke all on function fiscal.identity_state(uuid) from public, anon, authenticated;
revoke all on function fiscal.register_folio(text, integer, integer, uuid, text, uuid) from public, anon, authenticated;
revoke all on function fiscal.guard_issuance_identity() from public, anon, authenticated;
revoke all on function fiscal.register_issuance_folio() from public, anon, authenticated;
revoke all on function fiscal.sale_is_fiscalized(uuid) from public, anon, authenticated;
revoke all on function fiscal.guard_fiscalized_sale() from public, anon, authenticated;
revoke all on function fiscal.guard_credit_note() from public, anon, authenticated;
revoke all on function public.crm_fiscal_create_rut_share(uuid, text, uuid[], text, text) from public, anon, authenticated;
revoke all on function public.crm_fiscal_record_identity_check(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.crm_fiscal_authorize_tributary_correction(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.crm_fiscal_draft_credit_note(uuid, uuid, uuid, integer, text, numeric, jsonb) from public, anon, authenticated;
revoke all on function public.crm_fiscal_emission_context(uuid, uuid) from public, anon, authenticated;
revoke all on function public.crm_fiscal_connection_status(uuid) from public, anon, authenticated;
revoke all on function public.crm_fiscal_get_issuance(uuid, uuid) from public, anon, authenticated;

grant execute on function fiscal.normalize_rut(text) to service_role;
grant execute on function fiscal.identity_block_reason(uuid) to service_role;
grant execute on function fiscal.identity_state(uuid) to service_role;
grant execute on function public.crm_fiscal_create_rut_share(uuid, text, uuid[], text, text) to service_role;
grant execute on function public.crm_fiscal_record_identity_check(uuid, uuid, text, text, text, jsonb) to service_role;
grant execute on function public.crm_fiscal_authorize_tributary_correction(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.crm_fiscal_draft_credit_note(uuid, uuid, uuid, integer, text, numeric, jsonb) to service_role;
grant execute on function public.crm_fiscal_emission_context(uuid, uuid) to service_role;
grant execute on function public.crm_fiscal_connection_status(uuid) to service_role;
grant execute on function public.crm_fiscal_get_issuance(uuid, uuid) to service_role;

commit;
