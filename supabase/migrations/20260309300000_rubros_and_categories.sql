-- Rubros (sectores) y categorías por rubro. Admin los gestiona; negocios eligen rubro y categorías del rubro.
-- Escalable: luego se pueden agregar atributos por rubro (ej. ropa: talla, color).

-- 1. Tabla de rubros
CREATE TABLE IF NOT EXISTS public.wa_rubros (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT UNIQUE NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_rubros_slug ON public.wa_rubros(slug);
CREATE INDEX IF NOT EXISTS idx_wa_rubros_sort ON public.wa_rubros(sort_order);

-- 2. Categorías por rubro
CREATE TABLE IF NOT EXISTS public.wa_rubro_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rubro_id   UUID NOT NULL REFERENCES public.wa_rubros(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(rubro_id, name)
);

CREATE INDEX IF NOT EXISTS idx_wa_rubro_categories_rubro ON public.wa_rubro_categories(rubro_id);

-- 3. Rubro principal del negocio
ALTER TABLE public.wa_businesses ADD COLUMN IF NOT EXISTS rubro_id UUID REFERENCES public.wa_rubros(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_wa_businesses_rubro_id ON public.wa_businesses(rubro_id);

-- 4. Triggers updated_at
DROP TRIGGER IF EXISTS wa_rubros_updated_at ON public.wa_rubros;
CREATE TRIGGER wa_rubros_updated_at
  BEFORE UPDATE ON public.wa_rubros
  FOR EACH ROW EXECUTE FUNCTION public.wa_set_updated_at();

DROP TRIGGER IF EXISTS wa_rubro_categories_updated_at ON public.wa_rubro_categories;
CREATE TRIGGER wa_rubro_categories_updated_at
  BEFORE UPDATE ON public.wa_rubro_categories
  FOR EACH ROW EXECUTE FUNCTION public.wa_set_updated_at();

-- 5. RLS
ALTER TABLE public.wa_rubros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_rubro_categories ENABLE ROW LEVEL SECURITY;

-- Lectura para todos (catálogo público y dueños de negocio necesitan ver rubros y categorías)
DROP POLICY IF EXISTS "wa_rubros_select_all" ON public.wa_rubros;
CREATE POLICY "wa_rubros_select_all"
ON public.wa_rubros FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "wa_rubros_public_select" ON public.wa_rubros;
CREATE POLICY "wa_rubros_public_select"
ON public.wa_rubros FOR SELECT TO anon
USING (true);

DROP POLICY IF EXISTS "wa_rubro_categories_select_all" ON public.wa_rubro_categories;
CREATE POLICY "wa_rubro_categories_select_all"
ON public.wa_rubro_categories FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "wa_rubro_categories_public_select" ON public.wa_rubro_categories;
CREATE POLICY "wa_rubro_categories_public_select"
ON public.wa_rubro_categories FOR SELECT TO anon
USING (true);

-- Admin: CRUD completo en rubros y categorías
DROP POLICY IF EXISTS "wa_rubros_admin_all" ON public.wa_rubros;
CREATE POLICY "wa_rubros_admin_all"
ON public.wa_rubros FOR ALL TO authenticated
USING (public.wa_is_admin())
WITH CHECK (public.wa_is_admin());

DROP POLICY IF EXISTS "wa_rubro_categories_admin_all" ON public.wa_rubro_categories;
CREATE POLICY "wa_rubro_categories_admin_all"
ON public.wa_rubro_categories FOR ALL TO authenticated
USING (public.wa_is_admin())
WITH CHECK (public.wa_is_admin());

-- 6. Datos iniciales: rubros y categorías de ejemplo
INSERT INTO public.wa_rubros (id, name, slug, sort_order) VALUES
  (gen_random_uuid(), 'Ropa', 'ropa', 1),
  (gen_random_uuid(), 'Ferretería', 'ferreteria', 2),
  (gen_random_uuid(), 'Electrónica', 'electronica', 3),
  (gen_random_uuid(), 'Mascotas', 'mascotas', 4),
  (gen_random_uuid(), 'Belleza', 'belleza', 5),
  (gen_random_uuid(), 'Comida', 'comida', 6),
  (gen_random_uuid(), 'Librería', 'libreria', 7),
  (gen_random_uuid(), 'Servicios', 'servicios', 8),
  (gen_random_uuid(), 'Otros', 'otros', 9)
ON CONFLICT (slug) DO NOTHING;

-- Categorías por rubro (insertamos por slug de rubro para no depender del UUID generado)
DO $$
DECLARE
  r_ropa UUID; r_ferreteria UUID; r_electronica UUID; r_mascotas UUID;
  r_belleza UUID; r_comida UUID; r_libreria UUID; r_servicios UUID; r_otros UUID;
BEGIN
  SELECT id INTO r_ropa FROM public.wa_rubros WHERE slug = 'ropa' LIMIT 1;
  SELECT id INTO r_ferreteria FROM public.wa_rubros WHERE slug = 'ferreteria' LIMIT 1;
  SELECT id INTO r_electronica FROM public.wa_rubros WHERE slug = 'electronica' LIMIT 1;
  SELECT id INTO r_mascotas FROM public.wa_rubros WHERE slug = 'mascotas' LIMIT 1;
  SELECT id INTO r_belleza FROM public.wa_rubros WHERE slug = 'belleza' LIMIT 1;
  SELECT id INTO r_comida FROM public.wa_rubros WHERE slug = 'comida' LIMIT 1;
  SELECT id INTO r_libreria FROM public.wa_rubros WHERE slug = 'libreria' LIMIT 1;
  SELECT id INTO r_servicios FROM public.wa_rubros WHERE slug = 'servicios' LIMIT 1;
  SELECT id INTO r_otros FROM public.wa_rubros WHERE slug = 'otros' LIMIT 1;

  IF r_ropa IS NOT NULL THEN
    INSERT INTO public.wa_rubro_categories (rubro_id, name, sort_order) VALUES
      (r_ropa, 'Poleras y polerones', 1), (r_ropa, 'Pantalones', 2), (r_ropa, 'Vestidos', 3),
      (r_ropa, 'Chaquetas', 4), (r_ropa, 'Ropa interior', 5), (r_ropa, 'Accesorios', 6)
    ON CONFLICT (rubro_id, name) DO NOTHING;
  END IF;
  IF r_ferreteria IS NOT NULL THEN
    INSERT INTO public.wa_rubro_categories (rubro_id, name, sort_order) VALUES
      (r_ferreteria, 'Herramientas', 1), (r_ferreteria, 'Tornillería', 2), (r_ferreteria, 'Pinturas', 3),
      (r_ferreteria, 'Electricidad', 4), (r_ferreteria, 'Grifería', 5), (r_ferreteria, 'Jardín', 6)
    ON CONFLICT (rubro_id, name) DO NOTHING;
  END IF;
  IF r_electronica IS NOT NULL THEN
    INSERT INTO public.wa_rubro_categories (rubro_id, name, sort_order) VALUES
      (r_electronica, 'Celulares', 1), (r_electronica, 'Computación', 2), (r_electronica, 'Audio', 3),
      (r_electronica, 'Accesorios', 4), (r_electronica, 'Consolas', 5)
    ON CONFLICT (rubro_id, name) DO NOTHING;
  END IF;
  IF r_mascotas IS NOT NULL THEN
    INSERT INTO public.wa_rubro_categories (rubro_id, name, sort_order) VALUES
      (r_mascotas, 'Alimento', 1), (r_mascotas, 'Juguetes', 2), (r_mascotas, 'Higiene', 3),
      (r_mascotas, 'Accesorios', 4), (r_mascotas, 'Medicamentos', 5)
    ON CONFLICT (rubro_id, name) DO NOTHING;
  END IF;
  IF r_belleza IS NOT NULL THEN
    INSERT INTO public.wa_rubro_categories (rubro_id, name, sort_order) VALUES
      (r_belleza, 'Cuidado facial', 1), (r_belleza, 'Cabello', 2), (r_belleza, 'Maquillaje', 3),
      (r_belleza, 'Perfumería', 4), (r_belleza, 'Uñas', 5)
    ON CONFLICT (rubro_id, name) DO NOTHING;
  END IF;
  IF r_comida IS NOT NULL THEN
    INSERT INTO public.wa_rubro_categories (rubro_id, name, sort_order) VALUES
      (r_comida, 'Preparados', 1), (r_comida, 'Bebidas', 2), (r_comida, 'Snacks', 3),
      (r_comida, 'Ingredientes', 4), (r_comida, 'Repostería', 5)
    ON CONFLICT (rubro_id, name) DO NOTHING;
  END IF;
  IF r_libreria IS NOT NULL THEN
    INSERT INTO public.wa_rubro_categories (rubro_id, name, sort_order) VALUES
      (r_libreria, 'Libros', 1), (r_libreria, 'Papelería', 2), (r_libreria, 'Arte', 3),
      (r_libreria, 'Escritura', 4)
    ON CONFLICT (rubro_id, name) DO NOTHING;
  END IF;
  IF r_servicios IS NOT NULL THEN
    INSERT INTO public.wa_rubro_categories (rubro_id, name, sort_order) VALUES
      (r_servicios, 'Consultoría', 1), (r_servicios, 'Mantención', 2), (r_servicios, 'Clases', 3),
      (r_servicios, 'Otros servicios', 4)
    ON CONFLICT (rubro_id, name) DO NOTHING;
  END IF;
  IF r_otros IS NOT NULL THEN
    INSERT INTO public.wa_rubro_categories (rubro_id, name, sort_order) VALUES
      (r_otros, 'General', 1)
    ON CONFLICT (rubro_id, name) DO NOTHING;
  END IF;
END $$;
