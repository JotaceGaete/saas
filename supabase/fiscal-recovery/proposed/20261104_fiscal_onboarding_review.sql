-- F — Alta de facturación electrónica por comercio, con revisión de Walinka.
--     PROPUESTA: NO APLICADA EN PRODUCCIÓN. Depende de P0, A, B, C, D y E (va después de E).
--
-- Flujo:
--   1. El dueño fiscal ingresa RUT + API key de DTE Core (crm_fiscal_save_credentials, B) y la
--      resolución SII (+ sucursal opcional) y envía la solicitud (crm_fiscal_submit_application).
--   2. Un administrador de Walinka (auth.users.raw_app_meta_data.role = 'admin') la revisa y la
--      aprueba, rechaza (con motivo) o, más tarde, la suspende (crm_fiscal_review_application).
--   3. Solo una solicitud aprobada deja el emisor verified = true y enabled = true. Todo lo demás
--      lo deja apagado. Cambiar o quitar la API key vuelve la solicitud a 'draft' y apaga el emisor.
--
-- Garantías en la base (no dependen de la API):
--   - verified solo puede ser true con review_status = 'approved'. La emisión exige además
--     enabled (lib/eligibility.mjs y crm_claim_fiscal_issuance), que solo enciende la aprobación.
--   - Solo service_role ejecuta las funciones; la de revisión además exige que el revisor sea
--     admin de Walinka en auth.users.
--   - Cada solicitud, aprobación, rechazo y suspensión queda en fiscal.admin_audit.
--   - Nunca se devuelve la API key.

begin;

-- 1. Estado de revisión y resolución SII del emisor -------------------------------------------
alter table fiscal.issuers
  add column if not exists review_status text not null default 'draft',
  add column if not exists review_note text,
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid,
  add column if not exists resolucion_numero integer,
  add column if not exists resolucion_fecha date;

-- Filas existentes (piloto): un emisor ya verificado se considera aprobado; el resto, borrador.
update fiscal.issuers set review_status = 'approved' where verified and review_status = 'draft';

alter table fiscal.issuers drop constraint if exists issuers_review_check;
alter table fiscal.issuers add constraint issuers_review_check check (
  review_status in ('draft', 'pending_review', 'approved', 'rejected', 'suspended')
  and (not verified or review_status = 'approved')
  and (review_note is null or length(review_note) <= 500)
  and (resolucion_numero is null or resolucion_numero between 1 and 999999)
  and (resolucion_fecha is null or resolucion_fecha >= date '2003-01-01')
);

-- 2. Auditoría: acciones nuevas ---------------------------------------------------------------
alter table fiscal.admin_audit drop constraint if exists admin_audit_action_check;
alter table fiscal.admin_audit add constraint admin_audit_action_check
  check (action in ('reconcile_attempt', 'reconcile_result', 'owner_changed', 'credentials_saved',
                    'credentials_removed', 'application_submitted', 'application_approved',
                    'application_rejected', 'application_suspended'));

-- 3. Cambiar o quitar la API key exige volver a revisar ---------------------------------------
create or replace function fiscal.credentials_reset_review()
returns trigger
language plpgsql
set search_path = pg_catalog, fiscal
as $$
declare
  v_business uuid := coalesce(new.business_id, old.business_id);
begin
  update fiscal.issuers
     set review_status = 'draft', verified = false, enabled = false, updated_at = now()
   where business_id = v_business and review_status <> 'draft';
  return null;
end;
$$;

drop trigger if exists business_credentials_reset_review on fiscal.business_credentials;
create trigger business_credentials_reset_review
  after insert or update or delete on fiscal.business_credentials
  for each row execute function fiscal.credentials_reset_review();

-- 4. Solicitud del comercio -------------------------------------------------------------------
-- La API comprueba antes que el actor es fiscal_owner del negocio. Reenviar una solicitud
-- aprobada o suspendida la devuelve a revisión y apaga la emisión hasta que Walinka la apruebe.
create or replace function public.crm_fiscal_submit_application(
  p_business_id uuid, p_actor_user_id uuid,
  p_resolucion_numero integer, p_resolucion_fecha date,
  p_sucursal_nombre text default null, p_sucursal_codigo text default null
)
returns boolean
language plpgsql
set search_path = public, fiscal
as $$
declare
  v_nombre text := nullif(btrim(coalesce(p_sucursal_nombre, '')), '');
  v_codigo text := nullif(btrim(coalesce(p_sucursal_codigo, '')), '');
begin
  if p_business_id is null or p_actor_user_id is null
     or p_resolucion_numero is null or p_resolucion_numero not between 1 and 999999
     or p_resolucion_fecha is null or p_resolucion_fecha < date '2003-01-01' or p_resolucion_fecha > current_date
     or (v_nombre is not null and length(v_nombre) > 80)
     or (v_codigo is not null and v_codigo !~ '^[0-9]{1,9}$') then
    raise exception 'FISCAL_APPLICATION_INVALID';
  end if;
  if not exists (select 1 from public.wa_businesses where id = p_business_id and is_active) then
    raise exception 'FISCAL_BUSINESS_INACTIVE';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('fiscal_connection:' || p_business_id::text, 0));
  if fiscal.has_fresh_sending(p_business_id) then
    raise exception 'FISCAL_OPERATION_IN_PROGRESS';
  end if;
  if not exists (select 1 from fiscal.business_credentials where business_id = p_business_id)
     or not exists (select 1 from fiscal.issuers where business_id = p_business_id) then
    raise exception 'FISCAL_CREDENTIALS_REQUIRED';
  end if;

  update fiscal.issuers
     set resolucion_numero = p_resolucion_numero, resolucion_fecha = p_resolucion_fecha,
         sucursal_nombre = v_nombre, sucursal_codigo = v_codigo,
         review_status = 'pending_review', review_note = null,
         submitted_at = now(), submitted_by = p_actor_user_id,
         reviewed_at = null, reviewed_by = null,
         verified = false, enabled = false, updated_at = now()
   where business_id = p_business_id;

  insert into fiscal.admin_audit (business_id, sale_id, actor_user_id, action, outcome, detail)
  values (p_business_id, null, p_actor_user_id, 'application_submitted', 'pending_review',
          jsonb_build_object('resolucion_numero', p_resolucion_numero, 'resolucion_fecha', p_resolucion_fecha,
                             'sucursal_codigo', v_codigo));
  return true;
end;
$$;

-- 5. Revisión de Walinka ----------------------------------------------------------------------
--   approve: solo desde pending_review, con API key y resolución -> approved, verified, enabled.
--   reject:  solo desde pending_review, con motivo                -> rejected, apagado.
--   suspend: solo desde approved, con motivo                      -> suspended, apagado.
create or replace function public.crm_fiscal_review_application(
  p_business_id uuid, p_admin_user_id uuid, p_decision text, p_note text default null
)
returns boolean
language plpgsql
set search_path = public, fiscal
as $$
declare
  v_issuer fiscal.issuers%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_to text;
begin
  if p_business_id is null or p_admin_user_id is null or p_decision not in ('approve', 'reject', 'suspend')
     or (v_note is not null and length(v_note) > 500) then
    raise exception 'FISCAL_REVIEW_INVALID';
  end if;
  if not exists (select 1 from auth.users u
                  where u.id = p_admin_user_id and u.raw_app_meta_data ->> 'role' = 'admin') then
    raise exception 'FISCAL_REVIEWER_NOT_ADMIN';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('fiscal_connection:' || p_business_id::text, 0));
  select * into v_issuer from fiscal.issuers where business_id = p_business_id for update;
  if not found then
    raise exception 'FISCAL_APPLICATION_NOT_FOUND';
  end if;

  if p_decision = 'approve' then
    if v_issuer.review_status <> 'pending_review' then raise exception 'FISCAL_REVIEW_STATE'; end if;
    if v_issuer.resolucion_numero is null or v_issuer.resolucion_fecha is null
       or not exists (select 1 from fiscal.business_credentials where business_id = p_business_id) then
      raise exception 'FISCAL_APPLICATION_INCOMPLETE';
    end if;
    v_to := 'approved';
    update fiscal.issuers
       set review_status = 'approved', review_note = v_note, reviewed_at = now(), reviewed_by = p_admin_user_id,
           verified = true, enabled = true, updated_at = now()
     where business_id = p_business_id;
  elsif p_decision = 'reject' then
    if v_issuer.review_status <> 'pending_review' then raise exception 'FISCAL_REVIEW_STATE'; end if;
    if v_note is null then raise exception 'FISCAL_REVIEW_NOTE_REQUIRED'; end if;
    v_to := 'rejected';
    update fiscal.issuers
       set review_status = 'rejected', review_note = v_note, reviewed_at = now(), reviewed_by = p_admin_user_id,
           verified = false, enabled = false, updated_at = now()
     where business_id = p_business_id;
  else
    if v_issuer.review_status <> 'approved' then raise exception 'FISCAL_REVIEW_STATE'; end if;
    if v_note is null then raise exception 'FISCAL_REVIEW_NOTE_REQUIRED'; end if;
    v_to := 'suspended';
    update fiscal.issuers
       set review_status = 'suspended', review_note = v_note, reviewed_at = now(), reviewed_by = p_admin_user_id,
           verified = false, enabled = false, updated_at = now()
     where business_id = p_business_id;
  end if;

  insert into fiscal.admin_audit (business_id, sale_id, actor_user_id, action, outcome, detail)
  values (p_business_id, null, p_admin_user_id,
          case v_to when 'approved' then 'application_approved'
                    when 'rejected' then 'application_rejected' else 'application_suspended' end,
          v_to, jsonb_build_object('from', v_issuer.review_status, 'note', v_note));
  return true;
end;
$$;

-- 6. Cola de revisión (sin secretos) ----------------------------------------------------------
create or replace function public.crm_fiscal_list_applications(p_status text default null)
returns jsonb
language sql
stable
set search_path = public, fiscal
as $$
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by
           (x."reviewStatus" = 'pending_review') desc, x."submittedAt" asc nulls last, x."businessName"), '[]'::jsonb)
    from (
      select i.business_id as "businessId", b.name as "businessName", i.issuer_rut as "issuerRut",
             i.review_status as "reviewStatus", i.review_note as "reviewNote",
             i.submitted_at as "submittedAt", i.reviewed_at as "reviewedAt",
             i.resolucion_numero as "resolucionNumero", i.resolucion_fecha as "resolucionFecha",
             i.sucursal_nombre as "sucursalNombre", i.sucursal_codigo as "sucursalCodigo",
             (c.business_id is not null) as "hasCredentials", i.enabled as "enabled",
             u.email as "ownerEmail"
        from fiscal.issuers i
        join public.wa_businesses b on b.id = i.business_id
        left join fiscal.business_credentials c on c.business_id = i.business_id
        left join auth.users u on u.id = b.user_id
       where p_status is null or i.review_status = p_status
    ) x;
$$;

-- 7. Estado para el comercio: agrega revisión, resolución y sucursal --------------------------
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
    'sucursalCodigo', i.sucursal_codigo)
  from (select p_business_id as bid) b
  left join fiscal.business_credentials c on c.business_id = b.bid
  left join fiscal.issuers i on i.business_id = b.bid;
$$;

-- 8. Contexto de emisión: la resolución viaja con el emisor (para imprimir la boleta) ---------
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
                        'resolucion_numero', s.resolucion_numero, 'resolucion_fecha', s.resolucion_fecha)
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

-- 9. Permisos: solo service_role ---------------------------------------------------------------
revoke all on function public.crm_fiscal_submit_application(uuid, uuid, integer, date, text, text) from public, anon, authenticated;
revoke all on function public.crm_fiscal_review_application(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.crm_fiscal_list_applications(text) from public, anon, authenticated;
revoke all on function public.crm_fiscal_connection_status(uuid) from public, anon, authenticated;
revoke all on function public.crm_fiscal_emission_context(uuid, uuid) from public, anon, authenticated;
revoke all on function fiscal.credentials_reset_review() from public, anon, authenticated;
grant execute on function public.crm_fiscal_submit_application(uuid, uuid, integer, date, text, text) to service_role;
grant execute on function public.crm_fiscal_review_application(uuid, uuid, text, text) to service_role;
grant execute on function public.crm_fiscal_list_applications(text) to service_role;
grant execute on function public.crm_fiscal_connection_status(uuid) to service_role;
grant execute on function public.crm_fiscal_emission_context(uuid, uuid) to service_role;

commit;
