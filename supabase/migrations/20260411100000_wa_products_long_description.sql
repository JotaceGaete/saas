-- Agrega descripción extendida opcional a productos.
-- Nullable: no afecta productos existentes ni lógica de catálogo actual.
alter table wa_products
  add column if not exists long_description text;

comment on column wa_products.long_description is
  'Descripción larga opcional del producto. Solo se muestra en el modal del catálogo si está presente.';
