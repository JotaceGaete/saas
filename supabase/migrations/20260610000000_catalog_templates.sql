-- Biblioteca de plantillas de catálogo administrables por Ventalink.
--
-- Convive con el onboarding automático actual (src/utils/productTemplates.js +
-- seedTemplateProductsIfEmpty): NO lo reemplaza. Esta estructura permite que
-- el equipo administre plantillas reutilizables desde /admin/catalog-templates
-- y, en una fase posterior, que el onboarding lea desde aquí (con fallback al
-- JS hardcodeado) para no duplicar datos.
--
-- Diseño completo: docs/CATALOG_TEMPLATES_ARCHITECTURE.md

-- ── 1. Plantilla (cabecera) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.catalog_templates (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT        NOT NULL,
  slug               TEXT        NOT NULL UNIQUE,
  description        TEXT,
  -- Agrupador visual en la biblioteca (ej. 'Moda', 'Gastronomía').
  category           TEXT,
  preview_image_url  TEXT,
  banner_url         TEXT,
  logo_url           TEXT,
  is_active          BOOLEAN     NOT NULL DEFAULT true,
  -- Vínculo con el onboarding automático: si un negocio guarda este rubro y no
  -- tiene productos, esta plantilla es la que se siembra. NULL = solo manual.
  -- UNIQUE: un rubro no puede tener dos plantillas de onboarding.
  rubro_slug         TEXT        UNIQUE,
  -- 'system' = plantillas seed equivalentes a productTemplates.js (el código
  -- puede depender de ellas); 'custom' = creadas/duplicadas por el equipo.
  source             TEXT        NOT NULL DEFAULT 'custom'
                                 CHECK (source IN ('system', 'custom')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. Categorías de la plantilla ─────────────────────────────────────────────
-- Al aplicar la plantilla se crean como wa_business_categories del negocio
-- (los productos siguen usando category TEXT, igual que hoy).
CREATE TABLE IF NOT EXISTS public.catalog_template_categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID        NOT NULL REFERENCES public.catalog_templates(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (template_id, name)
);

-- ── 3. Productos de la plantilla ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.catalog_template_products (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID          NOT NULL REFERENCES public.catalog_templates(id) ON DELETE CASCADE,
  name          TEXT          NOT NULL,
  description   TEXT,
  price         NUMERIC(12,2) NOT NULL DEFAULT 0,
  image_url     TEXT,
  -- Variante chica para wa_products.thumbnail_url; si es NULL se usa image_url.
  thumbnail_url TEXT,
  -- Nombre de categoría (texto, igual que wa_products.category). Debe coincidir
  -- con catalog_template_categories.name; se valida en capa de servicio.
  category_name TEXT,
  sort_order    INTEGER       NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ── 4. Índices ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_catalog_template_products_template
  ON public.catalog_template_products(template_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_catalog_template_categories_template
  ON public.catalog_template_categories(template_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_catalog_templates_active
  ON public.catalog_templates(is_active) WHERE is_active = true;

-- ── 5. Trigger updated_at ─────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS catalog_templates_updated_at ON public.catalog_templates;
CREATE TRIGGER catalog_templates_updated_at
  BEFORE UPDATE ON public.catalog_templates
  FOR EACH ROW EXECUTE FUNCTION public.wa_set_updated_at();

-- ── 6. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.catalog_templates           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_template_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_template_products   ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario autenticado ve plantillas activas (las necesita
-- para aplicarlas a su negocio); las inactivas solo las ve el admin.
DROP POLICY IF EXISTS "catalog_templates_auth_select" ON public.catalog_templates;
CREATE POLICY "catalog_templates_auth_select"
  ON public.catalog_templates FOR SELECT TO authenticated
  USING (is_active = true OR public.wa_is_admin());

DROP POLICY IF EXISTS "catalog_template_categories_auth_select" ON public.catalog_template_categories;
CREATE POLICY "catalog_template_categories_auth_select"
  ON public.catalog_template_categories FOR SELECT TO authenticated
  USING (
    template_id IN (
      SELECT id FROM public.catalog_templates
      WHERE is_active = true OR public.wa_is_admin()
    )
  );

DROP POLICY IF EXISTS "catalog_template_products_auth_select" ON public.catalog_template_products;
CREATE POLICY "catalog_template_products_auth_select"
  ON public.catalog_template_products FOR SELECT TO authenticated
  USING (
    template_id IN (
      SELECT id FROM public.catalog_templates
      WHERE is_active = true OR public.wa_is_admin()
    )
  );

-- Escritura: solo admin (panel /admin/catalog-templates).
DROP POLICY IF EXISTS "catalog_templates_admin_all" ON public.catalog_templates;
CREATE POLICY "catalog_templates_admin_all"
  ON public.catalog_templates FOR ALL TO authenticated
  USING (public.wa_is_admin())
  WITH CHECK (public.wa_is_admin());

DROP POLICY IF EXISTS "catalog_template_categories_admin_all" ON public.catalog_template_categories;
CREATE POLICY "catalog_template_categories_admin_all"
  ON public.catalog_template_categories FOR ALL TO authenticated
  USING (public.wa_is_admin())
  WITH CHECK (public.wa_is_admin());

DROP POLICY IF EXISTS "catalog_template_products_admin_all" ON public.catalog_template_products;
CREATE POLICY "catalog_template_products_admin_all"
  ON public.catalog_template_products FOR ALL TO authenticated
  USING (public.wa_is_admin())
  WITH CHECK (public.wa_is_admin());

-- ── 7. Seed: migración interna de los templates hardcodeados ─────────────────
-- Mismos datos que src/utils/productTemplates.js (PRODUCT_TEMPLATES). El
-- onboarding sigue leyendo el JS por ahora; este seed deja la biblioteca lista
-- y permite el switch posterior sin duplicar contenido.

-- 7a. Ropa Básica (rubro 'ropa')
WITH tpl AS (
  INSERT INTO public.catalog_templates
    (name, slug, description, category, banner_url, logo_url, rubro_slug, source, preview_image_url)
  VALUES (
    'Ropa Básica',
    'ropa-basica',
    'Catálogo de ejemplo para tiendas de ropa: básicos de vestuario con fotos y precios listos para editar.',
    'Moda',
    'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1600&h=600&q=80',
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNTYiIGhlaWdodD0iMjU2IiB2aWV3Qm94PSItNyAtNyAzOCAzOCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnIiB4MT0iMCIgeTE9IjAiIHgyPSIxIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjOEI1Q0Y2Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjNkQyOEQ5Ii8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3QgeD0iLTciIHk9Ii03IiB3aWR0aD0iMzgiIGhlaWdodD0iMzgiIGZpbGw9InVybCgjZykiLz48ZyBmaWxsPSJub25lIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iMS42IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik0yMC4zOCAzLjQ2IDE2IDJhNCA0IDAgMCAxLTggMEwzLjYyIDMuNDZhMiAyIDAgMCAwLTEuMzQgMi4yM2wuNTggMy40N2ExIDEgMCAwIDAgLjk5Ljg0SDZ2MTBjMCAxLjEuOSAyIDIgMmg4YTIgMiAwIDAgMCAyLTJWMTBoMi4xNWExIDEgMCAwIDAgLjk5LS44NGwuNTgtMy40N2EyIDIgMCAwIDAtMS4zNC0yLjIzeiIvPjwvZz48L3N2Zz4=',
    'ropa',
    'system',
    'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=900&q=80'
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id
)
INSERT INTO public.catalog_template_products
  (template_id, name, description, price, image_url, thumbnail_url, sort_order)
SELECT tpl.id, p.name, p.description, p.price, p.image_url, p.thumbnail_url, p.sort_order
FROM tpl, (VALUES
  ('Polera básica de algodón', 'Polera unisex de algodón 100%, suave y fresca. Disponible en varios colores y tallas.', 9990,
   'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80',
   'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=320&q=70', 0),
  ('Jeans clásico', 'Jeans de corte recto, cómodo y resistente para el uso diario.', 19990,
   'https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=900&q=80',
   'https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=320&q=70', 1),
  ('Polerón con capucha', 'Polerón abrigado con capucha y bolsillo canguro. Ideal para media estación.', 17990,
   'https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=900&q=80',
   'https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=320&q=70', 2),
  ('Chaqueta urbana', 'Chaqueta liviana de estilo urbano, perfecta para combinar con cualquier outfit.', 29990,
   'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=900&q=80',
   'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=320&q=70', 3),
  ('Vestido casual', 'Vestido casual de tela fresca, cómodo para el día a día.', 22990,
   'https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=900&q=80',
   'https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=320&q=70', 4),
  ('Zapatillas urbanas', 'Zapatillas cómodas y versátiles para acompañar tu look diario.', 34990,
   'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80',
   'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=320&q=70', 5)
) AS p(name, description, price, image_url, thumbnail_url, sort_order);

-- 7b. Restaurante (rubro 'comida-y-bebidas')
WITH tpl AS (
  INSERT INTO public.catalog_templates
    (name, slug, description, category, banner_url, logo_url, rubro_slug, source, preview_image_url)
  VALUES (
    'Restaurante',
    'restaurante',
    'Menú de ejemplo para restaurantes y locales de comida: platos con fotos y precios listos para editar.',
    'Gastronomía',
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1600&h=600&q=80',
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNTYiIGhlaWdodD0iMjU2IiB2aWV3Qm94PSItNyAtNyAzOCAzOCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnIiB4MT0iMCIgeTE9IjAiIHgyPSIxIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjRkI5MjNDIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjRUE1ODBDIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3QgeD0iLTciIHk9Ii03IiB3aWR0aD0iMzgiIGhlaWdodD0iMzgiIGZpbGw9InVybCgjZykiLz48ZyBmaWxsPSJub25lIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iMS42IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik0zIDJ2N2MwIDEuMS45IDIgMiAyaDRhMiAyIDAgMCAwIDItMlYyIi8+PHBhdGggZD0iTTcgMnYyMCIvPjxwYXRoIGQ9Ik0yMSAxNVYyYTUgNSAwIDAgMC01IDV2NmMwIDEuMS45IDIgMiAyaDNabTAgMHY3Ii8+PC9nPjwvc3ZnPg==',
    'comida-y-bebidas',
    'system',
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80'
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id
)
INSERT INTO public.catalog_template_products
  (template_id, name, description, price, image_url, thumbnail_url, sort_order)
SELECT tpl.id, p.name, p.description, p.price, p.image_url, p.thumbnail_url, p.sort_order
FROM tpl, (VALUES
  ('Hamburguesa de la casa', 'Hamburguesa con queso derretido, lechuga, tomate y nuestra salsa especial. Incluye papas fritas.', 8990,
   'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80',
   'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=320&q=70', 0),
  ('Pizza artesanal', 'Pizza a la piedra con masa artesanal, salsa de tomate natural y queso mozzarella.', 11990,
   'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=900&q=80',
   'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=320&q=70', 1),
  ('Ensalada fresca', 'Mix de hojas verdes, palta, tomates cherry y aderezo de la casa.', 6990,
   'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=80',
   'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=320&q=70', 2),
  ('Pasta de la casa', 'Pasta fresca con salsa a elección, terminada con queso parmesano.', 9490,
   'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=900&q=80',
   'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=320&q=70', 3),
  ('Panqueques dulces', 'Torre de panqueques con miel de maple y frutas frescas. Perfecto para compartir.', 4990,
   'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&w=900&q=80',
   'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&w=320&q=70', 4)
) AS p(name, description, price, image_url, thumbnail_url, sort_order);

COMMENT ON TABLE public.catalog_templates IS
  'Biblioteca de plantillas de catálogo administrable por Ventalink. rubro_slug vincula la plantilla al onboarding automático; source=system marca las plantillas seed equivalentes a productTemplates.js.';
COMMENT ON TABLE public.catalog_template_products IS
  'Productos de una plantilla. Al aplicar se copian a wa_products (nunca se eliminan productos existentes del negocio).';
COMMENT ON TABLE public.catalog_template_categories IS
  'Categorías de una plantilla. Al aplicar se crean como wa_business_categories si no existen.';
