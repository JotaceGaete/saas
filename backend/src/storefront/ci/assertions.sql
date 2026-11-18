-- Aserciones sobre una base con 0001 y 0002 aplicadas. Cualquier fallo aborta (ON_ERROR_STOP).

do $$
declare
  fn_list text := 'public.storefront_list_products(uuid,text,text,text,text,text,uuid,int)';
  fn      text;
begin
  -- unaccent: diccionario en el esquema extensions, sin depender del search_path
  if extensions.unaccent('extensions.unaccent'::regdictionary, 'Canción Ñandú') <> 'Cancion Nandu' then
    raise exception 'unaccent: transformación incorrecta';
  end if;

  -- storefront_fold: sin tildes, minúsculas, nulos tratados
  if public.storefront_fold('CAFÉ Ñandú') <> 'cafe nandu' then raise exception 'fold: caso básico'; end if;
  if public.storefront_fold(null) <> '' then raise exception 'fold: nulo'; end if;

  -- collation ICU de producción disponible en este servidor
  if not exists (select 1 from pg_collation where collname = 'es-CL-x-icu') then
    raise exception 'collation es-CL-x-icu no disponible';
  end if;

  -- Vista y tabla de banners: sin acceso para anon ni authenticated
  if has_table_privilege('anon', 'public.wa_storefront_products_v', 'select')
     or has_table_privilege('authenticated', 'public.wa_storefront_products_v', 'select') then
    raise exception 'permisos: vista visible para anon/authenticated';
  end if;
  if has_table_privilege('anon', 'public.wa_storefront_banners', 'select')
     or has_table_privilege('authenticated', 'public.wa_storefront_banners', 'select') then
    raise exception 'permisos: banners visibles para anon/authenticated';
  end if;
  if not has_table_privilege('service_role', 'public.wa_storefront_products_v', 'select') then
    raise exception 'permisos: service_role sin select en la vista';
  end if;

  -- Funciones: anon y authenticated sin EXECUTE; service_role con EXECUTE
  foreach fn in array array[
    'public.storefront_list_products(uuid,text,text,text,text,text,uuid,int)',
    'public.storefront_categories(uuid)',
    'public.storefront_product(uuid,text)',
    'public.storefront_products_by_ids(uuid,uuid[])',
    'public.storefront_business(text)',
    'public.storefront_banners(uuid,text)',
    'public.storefront_fold(text)'
  ] loop
    if has_function_privilege('anon', fn, 'execute')
       or has_function_privilege('authenticated', fn, 'execute') then
      raise exception 'permisos: % ejecutable por anon/authenticated', fn;
    end if;
    if not has_function_privilege('service_role', fn, 'execute') then
      raise exception 'permisos: % no ejecutable por service_role', fn;
    end if;
  end loop;

  -- RLS habilitado en la tabla nueva
  if not (select relrowsecurity from pg_class where oid = 'public.wa_storefront_banners'::regclass) then
    raise exception 'RLS deshabilitado en wa_storefront_banners';
  end if;

  raise notice 'assertions: OK';
end $$;
