-- =============================================================================
-- PROPUESTA — Storefront read model (API v1.2 / v1.3).
-- NO aplicada en Supabase. Probar solo en la réplica local (walinka_replica)
-- y solicitar autorización explícita antes de cualquier migración de producción.
--
-- Principios:
--  * La API nunca lee wa_products directamente: lee la vista de filas públicas.
--  * Filtro, búsqueda, orden y paginación keyset ocurren en PostgreSQL.
--  * Todas las funciones van con grants solo para service_role.
--  * Orden determinista: clave de orden + wa_products.id como desempate (asc).
--  * Collation de nombres: "es-CL-x-icu" (existe en PostgreSQL 16 y 17 con ICU).
-- =============================================================================

-- En producción unaccent ya existe en el esquema "extensions" (verificado con SELECT).
-- Si no existiera, se crea ahí; el esquema "extensions" debe existir (Supabase lo provee).
create extension if not exists unaccent with schema extensions;

-- Búsqueda insensible a tildes y mayúsculas. Equivale a quitar marcas diacríticas + lower.
-- STABLE (no IMMUTABLE): unaccent depende de un diccionario y no puede marcarse IMMUTABLE
-- sin riesgo de índices inconsistentes. Por eso no se usa en índices de expresión.
-- Se invoca con el diccionario calificado para no depender del search_path.
create or replace function public.storefront_fold(p text)
returns text
language sql
stable
parallel safe
set search_path = public, pg_catalog
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p, '')))
$$;

-- Vista de solo filas públicas con columnas en lista blanca.
-- Excluye sku, barcode, tax_treatment, costos y cualquier columna de plan.
create or replace view public.wa_storefront_products_v
with (security_invoker = true) as
select
  p.id,
  p.business_id,
  p.slug,
  p.name,
  p.public_code,
  p.category,
  cat.slug as category_slug,
  p.description,
  p.long_description,
  p.options_description,
  p.price,
  p.compare_at_price,
  p.show_price,
  p.on_sale,
  p.featured,
  p.is_main_featured,
  p.is_sold_out,
  p.stock_actual,
  p.stock_minimo,
  p.sort_order,
  p.card_image_url,
  p.thumbnail_url,
  p.image_url,
  p.images,
  p.add_ons,
  p.combo_config,
  p.video_url,
  p.video_thumbnail_url,
  p.status,
  p.is_active,
  p.is_draft
from public.wa_products p
left join lateral (
  select c.slug
  from public.wa_business_categories c
  where c.business_id = p.business_id and c.name = p.category
  order by c.id
  limit 1
) cat on true
where p.is_active
  and p.status = 'active'
  and not p.is_draft;

-- Índices NO incluidos en esta migración. CREATE INDEX CONCURRENTLY no puede ejecutarse
-- dentro de la transacción de una migración; se aplicarían en un script aparte, solo si
-- EXPLAIN (ANALYZE, BUFFERS) en réplica muestra necesidad. Con ~1.262 filas en wa_products
-- los índices existentes por business_id bastan para el catálogo actual.
-- Candidatos (no crear sin medición):
--   (business_id, sort_order, id) WHERE is_active AND status='active' AND NOT is_draft   -- orden manual
--   (business_id, price, id)      WHERE ... mismo predicado                               -- precio
-- La búsqueda por subcadena (strpos sobre storefront_fold) no usa índices B-tree; si el
-- volumen lo exige, se evaluará pg_trgm sobre una columna normalizada, en una migración separada.

-- Listado: filtro + búsqueda + keyset + límite, todo en PostgreSQL.
create or replace function public.storefront_list_products(
  p_business_id uuid,
  p_sort        text,
  p_filter      text default null,
  p_category    text default null,
  p_q           text default null,
  p_after_key   text default null,
  p_after_id    uuid default null,
  p_limit       int  default 25
)
returns setof public.wa_storefront_products_v
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 25), 1), 61);
  v_q     text := case when p_q is null or btrim(p_q) = '' then null else public.storefront_fold(btrim(p_q)) end;
  v_pred  text;
  v_order text;
begin
  if p_sort not in ('manual', 'price_asc', 'price_desc', 'name_asc') then
    raise exception 'sort inválido' using errcode = '22023';
  end if;
  if p_filter is not null and p_filter not in ('featured', 'on_sale') then
    raise exception 'filter inválido' using errcode = '22023';
  end if;
  if (p_after_key is null) <> (p_after_id is null) then
    raise exception 'cursor incompleto' using errcode = '22023';
  end if;

  v_pred := case p_sort
    when 'manual'     then '(v.sort_order > $6::int or (v.sort_order = $6::int and v.id > $7))'
    when 'price_asc'  then '(v.price > $6::numeric or (v.price = $6::numeric and v.id > $7))'
    when 'price_desc' then '(v.price < $6::numeric or (v.price = $6::numeric and v.id > $7))'
    else '(v.name collate "es-CL-x-icu" > $6::text collate "es-CL-x-icu" or (v.name = $6::text and v.id > $7))'
  end;
  v_order := case p_sort
    when 'manual'     then 'v.sort_order, v.id'
    when 'price_asc'  then 'v.price, v.id'
    when 'price_desc' then 'v.price desc, v.id'
    else 'v.name collate "es-CL-x-icu", v.id'
  end;

  return query execute format($q$
    select v.* from public.wa_storefront_products_v v
    where v.business_id = $1
      and ($2 is distinct from 'featured' or (v.featured or v.is_main_featured))
      and ($2 is distinct from 'on_sale' or v.on_sale)
      and ($3::text is null or v.category_slug = $3)
      and ($4::text is null or strpos(public.storefront_fold(v.name), $4) > 0)
      and ($6::text is null or %s)
    order by %s
    limit $5
  $q$, v_pred, v_order)
  using p_business_id, p_filter, p_category, v_q, v_limit, p_after_key, p_after_id;
end;
$$;

-- Categorías derivadas de productos públicos (sin crear categorías).
create or replace function public.storefront_categories(p_business_id uuid)
returns table (slug text, name text, sort_order int, product_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select v.category_slug, min(v.category), min(v.sort_order), count(*)
  from public.wa_storefront_products_v v
  where v.business_id = p_business_id and v.category_slug is not null
  group by v.category_slug
  order by min(v.sort_order), v.category_slug collate "C"
$$;

create or replace function public.storefront_product(p_business_id uuid, p_slug text)
returns setof public.wa_storefront_products_v
language sql
stable
security invoker
set search_path = public
as $$
  select v.* from public.wa_storefront_products_v v
  where v.business_id = p_business_id and v.slug = p_slug
  limit 1
$$;

-- Productos relacionados por complementos. Solo de la misma tienda; máximo 100 ids.
create or replace function public.storefront_products_by_ids(p_business_id uuid, p_ids uuid[])
returns setof public.wa_storefront_products_v
language sql
stable
security invoker
set search_path = public
as $$
  select v.* from public.wa_storefront_products_v v
  where v.business_id = p_business_id and v.id = any (p_ids[1:100])
$$;

create or replace function public.storefront_business(p_slug text)
returns table (
  id uuid, slug text, name text, whatsapp text, address text, currency text,
  logo_url text, cover_image_url text, instagram_url text, tiktok_url text,
  facebook_url text, design_settings jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  select b.id, b.slug, b.name, b.whatsapp, b.address, b.currency,
         b.logo_url, b.cover_image_url, b.instagram_url, b.tiktok_url,
         b.facebook_url, b.design_settings
  from public.wa_businesses b
  where b.slug = p_slug and b.is_active
  limit 1
$$;

-- =============================================================================
-- Banners por comercio (entidad nueva e independiente de public.banners de plataforma).
-- =============================================================================
create table if not exists public.wa_storefront_banners (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.wa_businesses(id) on delete cascade,
  placement         text not null check (placement in ('home_hero', 'home_secondary', 'catalog_top')),
  position          int  not null default 0 check (position >= 0),
  desktop_image_url text not null check (desktop_image_url ~ '^https://'),
  mobile_image_url  text check (mobile_image_url is null or mobile_image_url ~ '^https://'),
  alt_text          text not null check (char_length(btrim(alt_text)) between 1 and 200),
  link_url          text check (link_url is null or link_url ~ '^(https://|/[^/])'),
  starts_at         timestamptz,
  ends_at           timestamptz,
  status            text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (starts_at is null or ends_at is null or ends_at > starts_at)
);

create index if not exists wa_storefront_banners_lookup_idx
  on public.wa_storefront_banners (business_id, placement, status, position, id);

alter table public.wa_storefront_banners enable row level security;
-- Sin políticas para anon/authenticated: la lectura pública va solo por la función de abajo.
-- Las escrituras del panel se definen en una migración posterior (requiere autorización).

create or replace function public.storefront_banners(p_business_id uuid, p_placement text)
returns setof public.wa_storefront_banners
language sql
stable
security invoker
set search_path = public
as $$
  select b.* from public.wa_storefront_banners b
  where b.business_id = p_business_id
    and b.placement = p_placement
    and b.status = 'active'
    and (b.starts_at is null or b.starts_at <= now())
    and (b.ends_at is null or b.ends_at > now())
  order by b.position, b.id
  limit 50
$$;

-- =============================================================================
-- Grants: solo service_role ejecuta estas funciones y lee la tabla de banners.
-- =============================================================================
revoke all on public.wa_storefront_products_v from public, anon, authenticated;
revoke all on public.wa_storefront_banners from public, anon, authenticated;
revoke execute on function public.storefront_fold(text) from public, anon, authenticated;
grant execute on function public.storefront_fold(text) to service_role;
revoke execute on function public.storefront_list_products(uuid, text, text, text, text, text, uuid, int) from public, anon, authenticated;
revoke execute on function public.storefront_categories(uuid) from public, anon, authenticated;
revoke execute on function public.storefront_product(uuid, text) from public, anon, authenticated;
revoke execute on function public.storefront_products_by_ids(uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public.storefront_business(text) from public, anon, authenticated;
revoke execute on function public.storefront_banners(uuid, text) from public, anon, authenticated;
grant select on public.wa_storefront_products_v to service_role;
grant select, insert, update, delete on public.wa_storefront_banners to service_role;
grant execute on function public.storefront_list_products(uuid, text, text, text, text, text, uuid, int) to service_role;
grant execute on function public.storefront_categories(uuid) to service_role;
grant execute on function public.storefront_product(uuid, text) to service_role;
grant execute on function public.storefront_products_by_ids(uuid, uuid[]) to service_role;
grant execute on function public.storefront_business(text) to service_role;
grant execute on function public.storefront_banners(uuid, text) to service_role;
