-- ============================================================
-- wa_products: columnas barcode y sku faltantes
--
-- El código escribe y lee barcode y sku en wa_products pero
-- ninguna migración previa las creó. Esta migración las agrega
-- de forma idempotente.
--
-- barcode: índice único parcial por (business_id, barcode)
--   WHERE barcode IS NOT NULL — mismo patrón que generateUniqueBarcode()
--   que busca colisiones dentro del mismo negocio.
-- sku: solo índice de búsqueda, sin unicidad por ahora.
-- ============================================================

ALTER TABLE public.wa_products
  ADD COLUMN IF NOT EXISTS barcode TEXT,
  ADD COLUMN IF NOT EXISTS sku     TEXT;

-- Índice único parcial: un barcode no puede repetirse dentro del mismo negocio
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_products_business_barcode
  ON public.wa_products (business_id, barcode)
  WHERE barcode IS NOT NULL;

-- Índice de búsqueda para sku (POS terminal, stock)
CREATE INDEX IF NOT EXISTS idx_wa_products_business_sku
  ON public.wa_products (business_id, sku)
  WHERE sku IS NOT NULL;
