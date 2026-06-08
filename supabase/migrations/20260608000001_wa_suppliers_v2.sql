-- v2: agregar supplier_type (categoría) y amount_paid (abonos parciales)

alter table wa_suppliers
  add column if not exists supplier_type text default 'otros'
    check (supplier_type in ('mercaderia','insumos','servicios','transporte','arriendo','marketing','otros'));

alter table wa_supplier_debts
  add column if not exists amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0);
