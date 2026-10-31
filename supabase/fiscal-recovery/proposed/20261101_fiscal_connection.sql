-- Conexión de facturación electrónica por comercio (DTECore).
-- Modelo confirmado por el propietario: una cuenta DTECore por RUT, una API key por comercio,
-- suscripción contratada directamente por el comercio. Walinka no comparte credenciales.
--
-- Principios:
--  - La API key se sella (AES-256-GCM, AAD = negocio|proveedor|versión) en el servidor y solo se
--    guarda cifrada. Estas funciones reciben bytes cifrados, nunca la clave en claro.
--  - Ninguna función devuelve la clave. El estado devuelto no contiene secretos.
--  - Guardar o desconectar NO habilita emisión: deja enabled = false y verified = false. El
--    propietario verifica la cuenta y habilita después.
--  - Cambiar o quitar credenciales queda bloqueado mientras haya una emisión en 'sending'.
--  - Solo service_role ejecuta estas funciones (la API comprueba el rol fiscal antes).
--
-- Esta migración se aplica SOLO en walinka_test. No aplicar en producción sin aprobación.

-- 0. La auditoría admite las dos acciones nuevas. La restricción original (20261031) solo listaba
--    reconcile_attempt, reconcile_result y owner_changed.
alter table fiscal.admin_audit drop constraint if exists admin_audit_action_check;
alter table fiscal.admin_audit add constraint admin_audit_action_check
  check (action in ('reconcile_attempt', 'reconcile_result', 'owner_changed', 'credentials_saved', 'credentials_removed'));

-- 1. Estado de conexión (sin secretos).
create or replace function public.crm_fiscal_connection_status(p_business_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, fiscal
as $$
  select jsonb_build_object(
    'connected', c.business_id is not null,
    'issuerRut', i.issuer_rut,
    'enabled', coalesce(i.enabled, false),
    'verified', coalesce(i.verified, false),
    'keyVersion', c.key_version,
    'updatedAt', greatest(c.updated_at, i.updated_at))
  from (select p_business_id as bid) b
  left join fiscal.business_credentials c on c.business_id = b.bid
  left join fiscal.issuers i on i.business_id = b.bid;
$$;

-- 2. Guardar o reemplazar credenciales. Idempotente por negocio (una fila por comercio).
create or replace function public.crm_fiscal_save_credentials(
  p_business_id uuid, p_actor_user_id uuid, p_issuer_rut text,
  p_ciphertext bytea, p_iv bytea, p_auth_tag bytea, p_key_version integer
) returns boolean
language plpgsql
security invoker
set search_path = public, fiscal
as $$
begin
  if p_business_id is null or p_actor_user_id is null or p_key_version is null or p_key_version < 1
     or p_issuer_rut is null or p_issuer_rut !~ '^[0-9]{1,8}-[0-9K]$'
     or p_ciphertext is null or octet_length(p_ciphertext) = 0
     or p_iv is null or octet_length(p_iv) <> 12
     or p_auth_tag is null or octet_length(p_auth_tag) <> 16 then
    raise exception 'Invalid fiscal connection input';
  end if;
  if not exists (select 1 from public.wa_businesses where id = p_business_id and is_active) then
    raise exception 'FISCAL_BUSINESS_INACTIVE';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('fiscal_connection:' || p_business_id::text, 0));
  if exists (select 1 from public.crm_fiscal_issuances
              where business_id = p_business_id and status = 'sending') then
    raise exception 'FISCAL_OPERATION_IN_PROGRESS';
  end if;

  insert into fiscal.business_credentials (business_id, provider, key_version, ciphertext, iv, auth_tag)
  values (p_business_id, 'dtecore', p_key_version, p_ciphertext, p_iv, p_auth_tag)
  on conflict (business_id) do update
     set provider = 'dtecore', key_version = excluded.key_version, ciphertext = excluded.ciphertext,
         iv = excluded.iv, auth_tag = excluded.auth_tag, updated_at = now();

  insert into fiscal.issuers (business_id, issuer_rut, enabled, verified)
  values (p_business_id, p_issuer_rut, false, false)
  on conflict (business_id) do update
     set issuer_rut = excluded.issuer_rut, enabled = false, verified = false, updated_at = now();

  insert into fiscal.admin_audit (business_id, sale_id, actor_user_id, action, outcome, detail)
  values (p_business_id, null, p_actor_user_id, 'credentials_saved', 'stored',
          jsonb_build_object('issuer_rut', p_issuer_rut, 'key_version', p_key_version));
  return true;
end;
$$;

-- 3. Desconectar: borra el secreto cifrado y deshabilita la emisión del negocio.
create or replace function public.crm_fiscal_disconnect(p_business_id uuid, p_actor_user_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public, fiscal
as $$
declare
  v_removed integer;
begin
  if p_business_id is null or p_actor_user_id is null then
    raise exception 'Invalid fiscal connection input';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('fiscal_connection:' || p_business_id::text, 0));
  if exists (select 1 from public.crm_fiscal_issuances
              where business_id = p_business_id and status = 'sending') then
    raise exception 'FISCAL_OPERATION_IN_PROGRESS';
  end if;

  delete from fiscal.business_credentials where business_id = p_business_id;
  get diagnostics v_removed = row_count;
  update fiscal.issuers set enabled = false, verified = false, updated_at = now()
   where business_id = p_business_id;

  insert into fiscal.admin_audit (business_id, sale_id, actor_user_id, action, outcome, detail)
  values (p_business_id, null, p_actor_user_id, 'credentials_removed', 'removed',
          jsonb_build_object('had_credentials', v_removed > 0));
  return true;
end;
$$;

revoke all on function public.crm_fiscal_connection_status(uuid) from public, anon, authenticated;
revoke all on function public.crm_fiscal_save_credentials(uuid, uuid, text, bytea, bytea, bytea, integer) from public, anon, authenticated;
revoke all on function public.crm_fiscal_disconnect(uuid, uuid) from public, anon, authenticated;
grant execute on function public.crm_fiscal_connection_status(uuid) to service_role;
grant execute on function public.crm_fiscal_save_credentials(uuid, uuid, text, bytea, bytea, bytea, integer) to service_role;
grant execute on function public.crm_fiscal_disconnect(uuid, uuid) to service_role;

commit;
