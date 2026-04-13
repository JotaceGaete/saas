-- Precio anterior para mostrar descuento en vista de ofertas.
-- price = precio actual de venta; compare_at_price = precio anterior (opcional).
-- Cuando on_sale = true y compare_at_price > price, el catálogo calcula el % OFF.
ALTER TABLE public.wa_products ADD COLUMN IF NOT EXISTS compare_at_price NUMERIC(10,2) NULL;
COMMENT ON COLUMN public.wa_products.compare_at_price IS 'Precio anterior antes de la oferta (opcional). Si está presente y es mayor al price actual, se muestra tachado y se calcula el % OFF.';
