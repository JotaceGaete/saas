-- =============================================================================
-- BORRADOR 0002 — contenido editorial por comercio (contrato v1.3).
-- NO aplicado en Supabase. Solo tablas y RLS; las funciones de lectura y las
-- escrituras del panel se definen en una migración posterior con autorización.
-- Textos y páginas los administra Walinka; ningún campo de plantilla define datos comerciales.
-- =============================================================================

create table if not exists public.wa_storefront_texts (
  business_id uuid not null references public.wa_businesses(id) on delete cascade,
  key         text not null check (key in ('announcement', 'heroTitle', 'emptyCatalog', 'featuredTitle', 'searchPlaceholder', 'emptySearch', 'ctaLabel')),
  value       text not null check (char_length(btrim(value)) between 1 and 500),
  updated_at  timestamptz not null default now(),
  primary key (business_id, key)
);

create table if not exists public.wa_storefront_pages (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.wa_businesses(id) on delete cascade,
  kind        text not null check (kind in ('menu', 'footer', 'detail')),
  slug        text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  title       text not null check (char_length(btrim(title)) between 1 and 160),
  status      text not null default 'draft' check (status in ('draft', 'published')),
  position    int  not null default 0 check (position >= 0),
  updated_at  timestamptz not null default now(),
  unique (business_id, kind, slug)
);

create table if not exists public.wa_storefront_page_blocks (
  id         uuid primary key default gen_random_uuid(),
  page_id    uuid not null references public.wa_storefront_pages(id) on delete cascade,
  position   int  not null default 0 check (position >= 0),
  block_type text not null check (block_type in ('text', 'image', 'list')),
  body       text check (char_length(body) <= 5000),
  image_url  text check (image_url is null or image_url ~ '^https://'),
  alt_text   text check (alt_text is null or char_length(btrim(alt_text)) between 1 and 200),
  items      jsonb check (items is null or (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 50)),
  constraint block_shape check (
    (block_type = 'text'  and body is not null)
    or (block_type = 'image' and image_url is not null and alt_text is not null)
    or (block_type = 'list'  and items is not null)
  ),
  unique (page_id, position)
);

alter table public.wa_storefront_texts enable row level security;
alter table public.wa_storefront_pages enable row level security;
alter table public.wa_storefront_page_blocks enable row level security;
-- Sin políticas públicas: lectura solo por funciones storefront_* (service_role), a definir.
revoke all on public.wa_storefront_texts, public.wa_storefront_pages, public.wa_storefront_page_blocks from public, anon, authenticated;
