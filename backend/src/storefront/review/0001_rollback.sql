-- =============================================================================
-- ROLLBACK de 0001_storefront_read_model.sql
-- NO EJECUTAR sin autorización. Elimina solo objetos creados por 0001.
--
-- Antes de ejecutar:
--  1. Desactivar el montaje de la API (rewrite /api/v1/storefront) o aceptar que
--     devolverá 500 mientras existan rutas sin función: el handler captura el error.
--  2. Exportar wa_storefront_banners si contiene filas: este script la elimina.
--  3. unaccent NO se elimina: existía en producción antes de 0001 (schema extensions).
-- =============================================================================
begin;

drop function if exists public.storefront_banners(uuid, text);
drop function if exists public.storefront_business(text);
drop function if exists public.storefront_products_by_ids(uuid, uuid[]);
drop function if exists public.storefront_product(uuid, text);
drop function if exists public.storefront_categories(uuid);
drop function if exists public.storefront_list_products(uuid, text, text, text, text, text, uuid, int);

drop table if exists public.wa_storefront_banners;
drop view  if exists public.wa_storefront_products_v;
drop function if exists public.storefront_fold(text);

commit;
