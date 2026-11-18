-- Base mínima para verificar 0001 y 0002 (no es el esquema completo de producción).
-- Reproduce lo que importa para los permisos y la colación:
--  * unaccent en el esquema "extensions" (ubicación real en producción);
--  * roles de Supabase anon / authenticated / service_role;
--  * ACL por defecto de "public" que Supabase aplica a objetos nuevos
--    (sin las revocaciones de las migraciones, anon tendría acceso).
-- Ejecutar dentro de una base recién creada (run-db-checks.sh la crea).

create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create table wa_businesses (
  id uuid primary key, slug text not null unique, name text not null, whatsapp text, address text,
  currency text, logo_url text, cover_image_url text, instagram_url text, tiktok_url text,
  facebook_url text, is_active boolean not null, design_settings jsonb
);

create table wa_business_categories (
  id uuid primary key, business_id uuid not null references wa_businesses(id), name text not null, slug text not null,
  unique (business_id, slug), unique (business_id, name)
);

create table wa_products (
  id uuid primary key, business_id uuid not null references wa_businesses(id), slug text not null,
  name text not null, public_code varchar, description text, long_description text, options_description text,
  category text, price numeric not null, compare_at_price numeric, show_price boolean, on_sale boolean,
  featured boolean, is_main_featured boolean, is_active boolean not null, status text not null,
  is_draft boolean, is_sold_out boolean, stock_actual int, stock_minimo int, sort_order int,
  card_image_url text, thumbnail_url text, image_url text, images jsonb, add_ons jsonb,
  combo_config jsonb, video_url text, video_thumbnail_url text,
  unique (business_id, slug)
);

create index on wa_products (business_id);

alter table wa_products enable row level security;
alter table wa_businesses enable row level security;
alter table wa_business_categories enable row level security;
