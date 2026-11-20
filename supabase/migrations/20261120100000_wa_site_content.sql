-- Walinka Websites · Fase 1: contenido editable por comercio y plantilla.
--
-- Principios:
--   * Una fila por (comercio, plantilla). draft y published son columnas separadas.
--   * Ninguna tabla tiene INSERT/UPDATE/DELETE para anon ni authenticated: todas las escrituras
--     pasan por funciones SECURITY DEFINER que verifican dueño o admin.
--   * La lectura pública NO toca la tabla: solo entrega el contenido publicado vía RPC.
--   * No se usa wa_businesses para contenido: su política wa_businesses_public_read es "true",
--     así que cualquier columna nueva quedaría legible con la clave anon.
--   * No cambia planes, permisos de plan, productos, precios, pedidos ni categorías.

-- 1) Tabla -------------------------------------------------------------------

create table if not exists public.wa_site_content (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.wa_businesses(id) on delete cascade,
  template_key      text not null,
  contract_version  integer not null default 1,
  draft             jsonb not null default '{}'::jsonb,
  published         jsonb,
  draft_updated_at  timestamptz not null default now(),
  published_at      timestamptz,
  updated_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint wa_site_content_business_template_uniq unique (business_id, template_key),
  constraint wa_site_content_template_key_format check (template_key ~ '^[a-z0-9-]{3,60}$'),
  constraint wa_site_content_draft_object check (jsonb_typeof(draft) = 'object'),
  constraint wa_site_content_published_object check (published is null or jsonb_typeof(published) = 'object'),
  constraint wa_site_content_draft_size check (pg_column_size(draft) <= 16384)
);

alter table public.wa_site_content enable row level security;

revoke all on public.wa_site_content from anon, authenticated;
grant select on public.wa_site_content to authenticated;

-- Lectura del editor: solo dueño del comercio o admin. anon no tiene GRANT ni policy.
create policy wa_site_content_editor_select
  on public.wa_site_content
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.wa_businesses b
      where b.id = wa_site_content.business_id
        and (b.user_id = auth.uid() or public.wa_is_admin())
    )
  );

-- Sin policies de INSERT/UPDATE/DELETE a propósito.

-- 2) Validadores (puros, sin acceso a tablas) -------------------------------

create or replace function public.wa_jsonb_text_in_range(j jsonb, p_min integer, p_max integer)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(
    jsonb_typeof(j) = 'string'
    and char_length(j #>> '{}') between p_min and p_max,
    false
  )
$$;

-- Dominio multimedia autorizado: el host público de R2 que usan las imágenes reales de Walinka.
-- Solo https, sin query ni fragmento, y el host debe terminar exactamente en media.gong.cl.
create or replace function public.wa_site_content_image_url_allowed(p_url text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_url ~ '^https://media\.gong\.cl/[A-Za-z0-9._~/%-]+$', false)
$$;

create or replace function public.wa_site_content_v1_section_is_valid(s jsonb, p_has_highlights boolean)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  h jsonb;
begin
  if jsonb_typeof(s) is distinct from 'object' then
    return false;
  end if;

  -- Contrato cerrado: sin claves extra en la sección ni en la imagen (igual que el lector de Artemis).
  if (select array_agg(k order by k) from jsonb_object_keys(s) k)
     is distinct from (select array_agg(k order by k) from unnest(
       case when p_has_highlights
         then array['eyebrow','title','text','image','ctaLabel','href','highlights']
         else array['eyebrow','title','text','image','ctaLabel','href'] end::text[]) k) then
    return false;
  end if;
  if jsonb_typeof(s->'image') is distinct from 'object'
     or (select array_agg(k order by k) from jsonb_object_keys(s->'image') k)
        is distinct from (select array_agg(k order by k) from unnest(array['url','alt']::text[]) k) then
    return false;
  end if;

  if not (
    public.wa_jsonb_text_in_range(s->'eyebrow', 1, 40)
    and public.wa_jsonb_text_in_range(s->'title', 1, 90)
    and public.wa_jsonb_text_in_range(s->'text', 1, 280)
    and public.wa_jsonb_text_in_range(s->'ctaLabel', 1, 30)
    -- Destino interno únicamente: empieza con "/" y no es "//" ni contiene "\".
    and coalesce(
      jsonb_typeof(s->'href') = 'string'
      and (s->>'href') ~ '^/'
      and (s->>'href') !~ '^//'
      and position(chr(92) in (s->>'href')) = 0,
      false)
    and jsonb_typeof(s->'image') = 'object'
    -- Imágenes solo desde el dominio multimedia autorizado (ver wa_site_content_image_url_allowed).
    and coalesce(jsonb_typeof(s->'image'->'url') = 'string' and public.wa_site_content_image_url_allowed(s->'image'->>'url'), false)
    and public.wa_jsonb_text_in_range(s->'image'->'alt', 1, 140)
  ) then
    return false;
  end if;

  if p_has_highlights then
    if jsonb_typeof(s->'highlights') is distinct from 'array'
       or jsonb_array_length(s->'highlights') <> 3 then
      return false;
    end if;
    for h in select value from jsonb_array_elements(s->'highlights') loop
      if not public.wa_jsonb_text_in_range(h, 1, 60) then
        return false;
      end if;
    end loop;
  end if;

  return true;
end;
$$;

create or replace function public.wa_site_content_v1_is_valid(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
begin
  if jsonb_typeof(p) is distinct from 'object' then
    return false;
  end if;
  -- Debe ser texto "1" (no el número 1), igual que el validador JS y el lector de Artemis.
  if jsonb_typeof(p->'version') is distinct from 'string' or (p->>'version') <> '1' then
    return false;
  end if;
  if jsonb_typeof(p->'sections') is distinct from 'object' then
    return false;
  end if;
  -- Contrato cerrado: solo estas dos secciones, sin campos extra en la raíz.
  if (select array_agg(k order by k) from jsonb_object_keys(p) k) is distinct from array['sections','version']::text[] then
    return false;
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys(p->'sections') k)
     is distinct from array['editorialIngles','editorialVintage']::text[] then
    return false;
  end if;

  return public.wa_site_content_v1_section_is_valid(p->'sections'->'editorialIngles', true)
     and public.wa_site_content_v1_section_is_valid(p->'sections'->'editorialVintage', false);
end;
$$;

-- 3) Escritura: solo vía funciones -------------------------------------------

create or replace function public.wa_site_content_assert_editor(p_business_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.wa_businesses b
    where b.id = p_business_id
      and (b.user_id = auth.uid() or public.wa_is_admin())
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- Piloto de fase 1: solo comercios habilitados. Los admins de Walinka pueden entrar a cualquiera.
  -- Debe mantenerse igual a WEBSITE_EDITOR_PILOT_SLUGS en src/websites/templates/index.js.
  if not public.wa_is_admin() and not exists (
    select 1 from public.wa_businesses b
    where b.id = p_business_id
      and b.slug = any (array['artemis-chile']::text[])
  ) then
    raise exception 'not_in_pilot' using errcode = '42501';
  end if;
end;
$$;

-- Guardar borrador: permisivo (puede estar incompleto). Valida forma y tamaño, no contrato.
create or replace function public.wa_save_site_draft(p_business_id uuid, p_template_key text, p_draft jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  perform public.wa_site_content_assert_editor(p_business_id);

  if p_template_key !~ '^[a-z0-9-]{3,60}$' then
    raise exception 'invalid_template_key';
  end if;
  if jsonb_typeof(p_draft) is distinct from 'object' or pg_column_size(p_draft) > 16384 then
    raise exception 'invalid_draft';
  end if;

  insert into public.wa_site_content (business_id, template_key, draft, draft_updated_at, updated_by, updated_at)
  values (p_business_id, p_template_key, p_draft, v_now, auth.uid(), v_now)
  on conflict (business_id, template_key) do update
    set draft = excluded.draft,
        draft_updated_at = excluded.draft_updated_at,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;

  return v_now;
end;
$$;

-- Publicar: copia el borrador a published solo si cumple el contrato vigente.
create or replace function public.wa_publish_site_content(p_business_id uuid, p_template_key text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft jsonb;
  v_now timestamptz := now();
begin
  perform public.wa_site_content_assert_editor(p_business_id);

  select s.draft into v_draft
  from public.wa_site_content s
  where s.business_id = p_business_id and s.template_key = p_template_key
  for update;

  if not found then
    raise exception 'no_draft';
  end if;
  if not public.wa_site_content_v1_is_valid(v_draft) then
    raise exception 'invalid_content';
  end if;

  update public.wa_site_content
  set published = v_draft,
      published_at = v_now,
      updated_by = auth.uid(),
      updated_at = v_now
  where business_id = p_business_id and template_key = p_template_key;

  return v_now;
end;
$$;

revoke all on function public.wa_site_content_assert_editor(uuid) from public, anon;
revoke all on function public.wa_save_site_draft(uuid, text, jsonb) from public, anon;
revoke all on function public.wa_publish_site_content(uuid, text) from public, anon;
grant execute on function public.wa_save_site_draft(uuid, text, jsonb) to authenticated;
grant execute on function public.wa_publish_site_content(uuid, text) to authenticated;

-- 4) Lectura pública: solo publicado, por slug del comercio -------------------

create or replace function public.wa_get_published_site_content(p_business_slug text, p_template_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select s.published
  from public.wa_site_content s
  join public.wa_businesses b on b.id = s.business_id
  where b.slug = p_business_slug
    and b.is_active
    and s.template_key = p_template_key
    and s.published is not null
  limit 1
$$;

grant execute on function public.wa_get_published_site_content(text, text) to anon, authenticated;

-- 5) Mínimo privilegio ----------------------------------------------------------
-- Los helpers y el verificador de editor solo los usan las funciones SECURITY DEFINER
-- (que corren como dueño de la migración). Ningún rol de cliente debe invocarlos directamente.
-- Sin esto, un usuario autenticado podría sondear IDs de comercio para deducir si es dueño
-- o si el piloto lo bloquea.
revoke all on function public.wa_site_content_assert_editor(uuid) from public, anon, authenticated;
revoke all on function public.wa_jsonb_text_in_range(jsonb, integer, integer) from public, anon, authenticated;
revoke all on function public.wa_site_content_image_url_allowed(text) from public, anon, authenticated;
revoke all on function public.wa_site_content_v1_section_is_valid(jsonb, boolean) from public, anon, authenticated;
revoke all on function public.wa_site_content_v1_is_valid(jsonb) from public, anon, authenticated;
