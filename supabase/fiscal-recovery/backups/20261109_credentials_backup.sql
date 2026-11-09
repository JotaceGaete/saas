-- Respaldo previo a la rotación de FISCAL_MASTER_KEY (2026-11-09).
-- Copia exacta, sin descifrar, de las credenciales cifradas de DTE Core y su contexto de
-- Artesellos (78506417-8) y Bonita Casualidad (77804207-K). No modifica los originales.
-- Esquema fiscal_backup: sin USAGE para public/anon/authenticated/service_role (solo postgres),
-- fuera de los esquemas que expone la API, tablas con RLS sin políticas y de solo lectura.
-- Restaurar exige la clave maestra ORIGINAL (la que hoy está en Supabase); ver
-- docs/fiscal/RESPALDO_CREDENCIALES_2026-11-09.md.

-- Ningún cambio en los originales mientras se copia (bloquea escrituras, no lecturas).
lock table fiscal.business_credentials, fiscal.rut_confirmations, fiscal.issuers in share mode;

create schema fiscal_backup authorization postgres;
revoke all on schema fiscal_backup from public, anon, authenticated, service_role;
comment on schema fiscal_backup is
  'Respaldos fiscales internos. Solo postgres. No exponer en la API. Ver docs/fiscal/RESPALDO_CREDENCIALES_2026-11-09.md';

-- Huella canónica de una fila de credenciales (independiente de zona horaria y formato).
create function fiscal_backup.cred_row_sha256(
  p_business_id uuid, p_provider text, p_key_version integer, p_ciphertext bytea, p_iv bytea,
  p_auth_tag bytea, p_created_at timestamptz, p_updated_at timestamptz)
returns text language sql immutable set search_path = pg_catalog as $$
  select encode(sha256(convert_to(
    p_business_id::text || '|' || p_provider || '|' || p_key_version::text || '|' ||
    encode(p_ciphertext, 'hex') || '|' || encode(p_iv, 'hex') || '|' || encode(p_auth_tag, 'hex') || '|' ||
    extract(epoch from p_created_at)::text || '|' || extract(epoch from p_updated_at)::text, 'UTF8')), 'hex')
$$;
revoke all on function fiscal_backup.cred_row_sha256(uuid, text, integer, bytea, bytea, bytea, timestamptz, timestamptz)
  from public, anon, authenticated, service_role;

create table fiscal_backup.business_credentials_20261109 as
select c.*,
       fiscal.credential_fp(c.business_id) as credential_fp,
       fiscal_backup.cred_row_sha256(c.business_id, c.provider, c.key_version, c.ciphertext, c.iv, c.auth_tag, c.created_at, c.updated_at) as row_sha256
  from fiscal.business_credentials c
 where c.business_id in ('85e80cd0-7242-492f-951d-b17893e84283', 'cda904a1-e331-4bd4-9f33-a6715687d3dd');

create table fiscal_backup.rut_confirmations_20261109 as
select r.* from fiscal.rut_confirmations r
 where r.business_id in ('85e80cd0-7242-492f-951d-b17893e84283', 'cda904a1-e331-4bd4-9f33-a6715687d3dd');

create table fiscal_backup.issuers_20261109 as
select i.* from fiscal.issuers i
 where i.business_id in ('85e80cd0-7242-492f-951d-b17893e84283', 'cda904a1-e331-4bd4-9f33-a6715687d3dd');

create table fiscal_backup.manifest (
  backup_id text primary key,
  created_at timestamptz not null default now(),
  txid bigint not null default txid_current(),
  master_key_note text not null,
  counts jsonb not null,
  checksums jsonb not null
);

insert into fiscal_backup.manifest (backup_id, master_key_note, counts, checksums)
select '20261109_pre_rotation',
       'Cifradas con la FISCAL_MASTER_KEY original (Supabase, vigente al 2026-11-09 12:10 UTC: descifró folios 25006 y 51110). AES-256-GCM, AAD = business_id|provider|key_version. Sin esa clave estas filas no se pueden descifrar.',
       jsonb_build_object(
         'business_credentials', (select count(*) from fiscal_backup.business_credentials_20261109),
         'rut_confirmations', (select count(*) from fiscal_backup.rut_confirmations_20261109),
         'issuers', (select count(*) from fiscal_backup.issuers_20261109)),
       jsonb_build_object(
         'business_credentials', (select encode(sha256(convert_to(string_agg(row_sha256, ',' order by business_id), 'UTF8')), 'hex') from fiscal_backup.business_credentials_20261109),
         'rut_confirmations', (select encode(sha256(convert_to(string_agg(id::text || '|' || business_id || '|' || provider || '|' || key_version || '|' || credential_fp || '|' || confirmed_rut || '|' || actor_user_id || '|' || extract(epoch from confirmed_at)::text, ',' order by id), 'UTF8')), 'hex') from fiscal_backup.rut_confirmations_20261109),
         'issuers', (select encode(sha256(convert_to(string_agg(to_jsonb(i)::text, ',' order by business_id), 'UTF8')), 'hex') from fiscal_backup.issuers_20261109 i));

-- Solo lectura: cualquier UPDATE, DELETE o TRUNCATE falla (también para postgres, salvo que
-- se quite el trigger a propósito).
create function fiscal_backup.reject_change() returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  raise exception 'fiscal_backup es de solo lectura (%.%)', tg_table_schema, tg_table_name;
end;
$$;
revoke all on function fiscal_backup.reject_change() from public, anon, authenticated, service_role;

do $$
declare t text;
begin
  foreach t in array array['business_credentials_20261109', 'rut_confirmations_20261109', 'issuers_20261109', 'manifest'] loop
    execute format('alter table fiscal_backup.%I enable row level security', t);
    execute format('alter table fiscal_backup.%I force row level security', t);
    execute format('revoke all on fiscal_backup.%I from public, anon, authenticated, service_role', t);
    execute format('create trigger read_only_rows before update or delete on fiscal_backup.%I for each row execute function fiscal_backup.reject_change()', t);
    execute format('create trigger read_only_truncate before truncate on fiscal_backup.%I for each statement execute function fiscal_backup.reject_change()', t);
  end loop;
end;
$$;
