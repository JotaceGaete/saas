-- Añade columna slug a wa_products para búsqueda directa en páginas públicas.
-- Safe: ADD COLUMN IF NOT EXISTS no falla si ya existe.
ALTER TABLE wa_products
  ADD COLUMN IF NOT EXISTS slug TEXT;

-- Índice único por negocio (NULL-safe: permite múltiples NULL).
CREATE UNIQUE INDEX IF NOT EXISTS wa_products_business_id_slug_key
  ON wa_products (business_id, slug)
  WHERE slug IS NOT NULL;

-- Poblar slug para productos existentes que no tengan uno.
-- Derivado del nombre: minúsculas, sin tildes, guiones en lugar de espacios/especiales.
-- Si unaccent no está disponible, usa regexp_replace sobre el texto normalizado.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'unaccent'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    UPDATE wa_products
    SET slug = regexp_replace(
      lower(trim(unaccent(name))),
      '[^a-z0-9]+', '-', 'g'
    )
    WHERE slug IS NULL AND name IS NOT NULL AND name <> '';
  ELSE
    -- Fallback sin unaccent: solo ASCII-safe.
    UPDATE wa_products
    SET slug = regexp_replace(
      lower(trim(name)),
      '[^a-z0-9]+', '-', 'g'
    )
    WHERE slug IS NULL AND name IS NOT NULL AND name <> '';
  END IF;
END;
$$;

COMMENT ON COLUMN wa_products.slug IS 'Slug URL-safe del producto (derivado del nombre). Permite búsqueda directa en /p/:businessSlug/:productSlug.';
