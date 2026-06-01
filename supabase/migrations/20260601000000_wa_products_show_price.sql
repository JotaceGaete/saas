ALTER TABLE public.wa_products
  ADD COLUMN IF NOT EXISTS show_price BOOLEAN NOT NULL DEFAULT true;

-- Fuerza a PostgREST a recargar el schema cache para que la columna sea visible
NOTIFY pgrst, 'reload schema';
