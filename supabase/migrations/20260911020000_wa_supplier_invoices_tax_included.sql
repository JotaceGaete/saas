-- ============================================================
-- PROVEEDORES-CORE-4A — tax_included en wa_supplier_invoices
--
-- Preparación de wa_supplier_invoices como fuente única futura para
-- /proveedores Y /crm/compras (PROVEEDORES-CORE-4). Esta migración SOLO
-- agrega la columna de metadata de captura que crm_purchase_invoices ya
-- tenía y wa_supplier_invoices no:
--
--   crm_purchase_invoices.tax_included BOOLEAN NOT NULL DEFAULT true
--
-- (confirmado en 20260809110000_crm_cash_documents_reconciliation.sql,
-- línea 220 -- la única migración que define esa tabla).
--
-- tax_included NUNCA es la fuente de verdad contable -- eso sigue siendo
-- net_amount/tax_rate/tax_amount/total_amount, exactamente igual que en
-- crm_purchase_invoices hoy (esos 4 campos ya vienen calculados desde el
-- cliente, tax_included solo documenta si el usuario ingresó el total con
-- IVA incluido o aparte, para que una futura edición de una factura SIN
-- pagos pueda recalcular con el mismo criterio original en vez de
-- asumir uno.
--
-- Producción confirmada por el usuario: crm_purchase_invoices tiene 0
-- filas y wa_supplier_invoices ya existe con datos reales de /proveedores
-- -- por eso el DEFAULT true (mismo default que tenía crm_purchase_invoices)
-- es seguro para backfill: toda fila ya existente de wa_supplier_invoices
-- fue cargada por /proveedores, que siempre trabajó con el total ya
-- "incluido" (SupplierInvoiceFormModal.jsx: taxIncluded arranca en `true`
-- y no se expone un toggle para desmarcarlo hoy) -- el DEFAULT no
-- reescribe ningún cálculo existente, solo documenta retroactivamente lo
-- que ya era cierto para esas filas.
ALTER TABLE public.wa_supplier_invoices
  ADD COLUMN IF NOT EXISTS tax_included BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.wa_supplier_invoices.tax_included IS
  'PROVEEDORES-CORE-4A: metadata de captura (¿el usuario ingresó el total '
  'con IVA incluido o aparte?), nunca fuente de verdad contable -- esa '
  'sigue siendo net_amount/tax_rate/tax_amount/total_amount. Mismo campo '
  'que ya existía en crm_purchase_invoices (legacy, congelada desde '
  'PROVEEDORES-CORE-4).';

-- No se toca ningún índice, RLS, trigger ni grant existente -- la columna
-- hereda automáticamente el grant de tabla ya otorgado a `authenticated`
-- en 20260911010000_wa_supplier_invoices_core.sql, y la política
-- "wa_supplier_invoices_owner" (FOR ALL) ya cubre cualquier columna nueva
-- sin necesidad de tocarla.
--
-- No afecta wa_supplier_invoice_balances (esa vista no proyecta
-- tax_included, y no tiene motivo para hacerlo -- balance/estado nunca
-- dependieron de este campo).
--
-- No afecta wa_register_supplier_payment (esa RPC nunca leyó ni escribió
-- columnas de wa_supplier_invoices más allá de total_amount/supplier_id/
-- business_id -- agregar una columna nueva a la tabla no cambia su firma
-- ni su comportamiento).

NOTIFY pgrst, 'reload schema';
