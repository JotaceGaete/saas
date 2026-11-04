-- PROPUESTA — NO APLICAR sin autorización. Depende de 20261031_fiscal_single_ledger_guard.sql
-- (crm_fiscal_emission_context) y de 20261101/20261102, que tampoco están en producción.
--
-- Configuración mínima: sucursal de emisión por comercio, guardada junto al emisor.
-- Valores reales: pendientes de verificar en el proveedor (XML de la 51106 o panel). No se usan defaults.

-- Ajuste previo a producción (2026-11-04): toda la migración en una transacción.
begin;

alter table fiscal.issuers
  add column if not exists sucursal_nombre text,
  add column if not exists sucursal_codigo text;

alter table fiscal.issuers drop constraint if exists issuers_sucursal_pair_check;
alter table fiscal.issuers add constraint issuers_sucursal_pair_check check (
  (sucursal_nombre is null and sucursal_codigo is null)
  or (nullif(trim(sucursal_nombre), '') is not null and nullif(trim(sucursal_codigo), '') is not null)
);

-- Contexto de emisión: igual que la versión propuesta, más la sucursal del emisor.
create or replace function public.crm_fiscal_emission_context(p_business_id uuid, p_sale_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, fiscal
as $$
  select jsonb_build_object(
    'issuer', (select jsonb_build_object(
                        'issuer_rut', s.issuer_rut, 'enabled', s.enabled, 'verified', s.verified,
                        'sucursal_nombre', s.sucursal_nombre, 'sucursal_codigo', s.sucursal_codigo)
                 from fiscal.issuers s where s.business_id = p_business_id),
    'emission_enabled', exists (select 1 from fiscal.dte39_emission_control c where c.singleton and c.enabled),
    'tax_lines_verified', fiscal.sale_tax_lines_verified(p_business_id, p_sale_id),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'unit_price', x.unit_price,
                                          'quantity', x.quantity, 'discount_pct', x.discount_pct,
                                          'category', x.category) order by x.sort_order nulls last, x.id)
        from (select i.id, i.name, i.unit_price, i.quantity, i.discount_pct, i.sort_order,
                     (select v.category from fiscal.line_tax_verifications v
                       where v.invoice_item_id = i.id and v.verified is true
                       order by v.created_at desc limit 1) as category
                from public.crm_invoice_items i
               where i.invoice_id = p_sale_id) x), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('method', p.payment_method, 'amount', p.amount,
                                          'status', p.payment_status, 'voided', p.voided_at is not null))
        from public.crm_payments p
       where p.business_id = p_business_id and p.invoice_id = p_sale_id), '[]'::jsonb),
    'point_ops', coalesce((
      select jsonb_agg(jsonb_build_object('mp_status', o.mp_status, 'mp_order_id', o.mp_order_id,
                                          'mp_payment_id', o.mp_payment_id, 'finalized_at', o.finalized_at,
                                          'currency', o.currency, 'amount', o.amount))
        from public.crm_pos_point_operations o
       where o.business_id = p_business_id and o.crm_invoice_id = p_sale_id), '[]'::jsonb)
  );
$$;

revoke all on function public.crm_fiscal_emission_context(uuid, uuid) from public, anon, authenticated;
grant execute on function public.crm_fiscal_emission_context(uuid, uuid) to service_role;

commit;
