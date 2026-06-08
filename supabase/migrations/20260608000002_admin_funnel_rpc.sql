-- Embudo mínimo: 5 pasos derivados de tablas existentes.
-- No requiere nueva infraestructura de eventos.

create or replace function admin_get_funnel()
returns json
language sql
security definer
set search_path = public
as $$
  with
  registros as (
    select count(*)::int as n from wa_businesses
  ),
  primer_producto as (
    select count(distinct business_id)::int as n
    from wa_products
    where is_active = true
  ),
  tres_productos as (
    select count(*)::int as n
    from (
      select business_id
      from wa_products
      where is_active = true
      group by business_id
      having count(*) >= 3
    ) t
  ),
  catalogo_compartido as (
    select count(distinct business_id)::int as n
    from wa_catalog_visits
  ),
  primer_pedido as (
    select count(distinct business_id)::int as n
    from wa_orders
  )
  select json_build_object(
    'registros',           (select n from registros),
    'primer_producto',     (select n from primer_producto),
    'tres_productos',      (select n from tres_productos),
    'catalogo_compartido', (select n from catalogo_compartido),
    'primer_pedido',       (select n from primer_pedido)
  );
$$;

-- Acceso restringido a usuarios autenticados; la página usa RequireAdmin en el frontend.
grant execute on function admin_get_funnel() to authenticated;
