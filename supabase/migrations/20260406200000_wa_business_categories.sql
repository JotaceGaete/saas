-- Categorías personalizadas por negocio.
-- Complementan (no reemplazan) las categorías globales por rubro (wa_rubro_categories).
-- Los productos siguen usando category TEXT — ambas fuentes comparten el mismo campo string.

-- 1. Tabla principal
CREATE TABLE IF NOT EXISTS public.wa_business_categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Un negocio no puede tener dos categorías con el mismo slug
  UNIQUE (business_id, slug),
  -- Tampoco el mismo nombre (case-insensitive via check + slug normalization)
  UNIQUE (business_id, name)
);

-- 2. Índices
CREATE INDEX IF NOT EXISTS idx_wa_business_categories_business_id
  ON public.wa_business_categories(business_id);

-- Mejora el filtrado de productos por categoría (ya existe business_id en wa_products)
CREATE INDEX IF NOT EXISTS idx_wa_products_category
  ON public.wa_products(business_id, category);

-- 3. Trigger updated_at
DROP TRIGGER IF EXISTS wa_business_categories_updated_at ON public.wa_business_categories;
CREATE TRIGGER wa_business_categories_updated_at
  BEFORE UPDATE ON public.wa_business_categories
  FOR EACH ROW EXECUTE FUNCTION public.wa_set_updated_at();

-- 4. RLS
ALTER TABLE public.wa_business_categories ENABLE ROW LEVEL SECURITY;

-- Lectura pública: el catálogo anónimo necesita ver las categorías del negocio
DROP POLICY IF EXISTS "wa_business_categories_public_select" ON public.wa_business_categories;
CREATE POLICY "wa_business_categories_public_select"
  ON public.wa_business_categories FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS "wa_business_categories_auth_select" ON public.wa_business_categories;
CREATE POLICY "wa_business_categories_auth_select"
  ON public.wa_business_categories FOR SELECT TO authenticated
  USING (true);

-- Escritura: solo el dueño del negocio puede gestionar sus categorías propias
DROP POLICY IF EXISTS "wa_business_categories_owner_insert" ON public.wa_business_categories;
CREATE POLICY "wa_business_categories_owner_insert"
  ON public.wa_business_categories FOR INSERT TO authenticated
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "wa_business_categories_owner_update" ON public.wa_business_categories;
CREATE POLICY "wa_business_categories_owner_update"
  ON public.wa_business_categories FOR UPDATE TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "wa_business_categories_owner_delete" ON public.wa_business_categories;
CREATE POLICY "wa_business_categories_owner_delete"
  ON public.wa_business_categories FOR DELETE TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
    )
  );

-- Admin puede hacer todo
DROP POLICY IF EXISTS "wa_business_categories_admin_all" ON public.wa_business_categories;
CREATE POLICY "wa_business_categories_admin_all"
  ON public.wa_business_categories FOR ALL TO authenticated
  USING (public.wa_is_admin())
  WITH CHECK (public.wa_is_admin());

-- 5. Límite de categorías por negocio (función helper usada en el frontend)
-- No se usa constraint DB para evitar errores crípticos; se valida en servicio JS.
-- Límite recomendado: 30 categorías por negocio.
COMMENT ON TABLE public.wa_business_categories IS
  'Categorías personalizadas por negocio. Límite de 30 por negocio, validado en capa de servicio.';
