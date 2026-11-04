-- PROPUESTA (no aplicada). Número interno de venta: crm_invoices.invoice_number.
--
-- Ya cumple la regla de numeración (verificado contra producción el 2026-11-03,
-- SELECT de solo lectura de las definiciones): lo asigna crm_take_document_number
-- (contador por comercio en crm_document_sequences, fila bloqueada por
-- ON CONFLICT DO UPDATE, en la misma transacción que la venta) desde
-- crm_create_pos_sale, crm_finalize_point_sale y crm_create_invoice_document;
-- UNIQUE (business_id, invoice_number). No se crea otra secuencia.
--
-- Esta migración agrega solo:
--   1. Un guard: invoice_number no cambia una vez asignado.
--   2. Una vista de consulta venta <-> pago Point <-> folio DTE 39, aislada por
--      comercio: un usuario ve solo los comercios de los que es dueño.
--
-- Operaciones existentes que NO afecta (revisadas en el repo y en producción):
--   - Ninguna función ni pantalla actualiza invoice_number: las funciones solo
--     lo escriben en el INSERT; los UPDATE de la app (estado, pagado, totales,
--     datos comerciales) no lo incluyen.
--   - Triggers actuales de crm_invoices: crm_invoices_updated_at (BEFORE UPDATE)
--     y crm_invoice_paid_pos_dte39_enqueue (AFTER INSERT/UPDATE OF status, paid_at).
--     El guard solo mira UPDATE OF invoice_number.
--   - DELETE de ventas: no se toca.
--
-- Reversión:
--   drop trigger if exists crm_invoices_number_immutable on public.crm_invoices;
--   drop function if exists public.crm_invoices_guard_number();
--   drop view if exists public.crm_sale_references;

begin;

create or replace function public.crm_invoices_guard_number()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  -- Asignar por primera vez (NULL -> número) sigue permitido; cambiarlo, no.
  if old.invoice_number is not null and new.invoice_number is distinct from old.invoice_number then
    raise exception 'INVOICE_NUMBER_IMMUTABLE' using errcode = '23514',
      detail = format('invoice %s keeps number %s', old.id, old.invoice_number);
  end if;
  return new;
end;
$$;

drop trigger if exists crm_invoices_number_immutable on public.crm_invoices;
create trigger crm_invoices_number_immutable
  before update of invoice_number on public.crm_invoices
  for each row execute function public.crm_invoices_guard_number();

-- Consulta: número interno, pago Point y boleta. Sin datos nuevos: solo une lo
-- que ya existe. crm_pos_point_operations y crm_fiscal_issuances están cerradas
-- para `authenticated` (REVOKE ALL), así que la vista corre con los permisos de
-- su dueño (sin security_invoker) y filtra el comercio explícitamente con el
-- mismo criterio que crm_create_pos_sale: wa_businesses.user_id = auth.uid().
-- service_role (funciones del servidor) ve todo. No expone XML, PDF ni claves.
create or replace view public.crm_sale_references
with (security_barrier = true) as
select
  i.business_id,
  i.id                 as sale_id,
  i.invoice_number     as sale_number,
  i.source,
  i.status             as sale_status,
  i.total,
  i.paid_at,
  p.id                 as point_operation_id,
  p.mp_order_id        as point_order_id,
  p.mp_payment_id      as point_payment_id,
  f.folio              as dte_folio,
  f.dte_type,
  f.status             as dte_status
from public.crm_invoices i
left join public.crm_pos_point_operations p
  on p.crm_invoice_id = i.id and p.business_id = i.business_id
left join public.crm_fiscal_issuances f
  on f.sale_id = i.id and f.business_id = i.business_id and f.dte_type = 39
where auth.role() = 'service_role'
   or i.business_id in (select b.id from public.wa_businesses b where b.user_id = auth.uid());

revoke all on public.crm_sale_references from public, anon;
grant select on public.crm_sale_references to authenticated, service_role;

commit;
