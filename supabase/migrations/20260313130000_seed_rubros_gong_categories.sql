-- ============================================================
-- Rubros y categorías para Gong / catálogo (admin only).
-- Si el rubro o la categoría ya existen (slug / rubro_id+name), se ignoran (ON CONFLICT DO NOTHING).
-- Slug para URLs: el rubro ya tiene slug; las categorías usan nombre (slug puede generarse en frontend).
-- ============================================================

-- 0. Icono opcional por rubro (nombre de icono, ej. Lucide: Shirt, UtensilsCrossed, Home, Sparkles).
ALTER TABLE public.wa_rubros ADD COLUMN IF NOT EXISTS icon TEXT;

-- 1. Insertar rubros nuevos (slug único). Los que ya existan se ignoran.
INSERT INTO public.wa_rubros (name, slug, sort_order)
VALUES
  ('Moda y Accesorios',    'moda-y-accesorios',    10),
  ('Gastronomía',          'gastronomia',           20),
  ('Hogar y Decoración',   'hogar-y-decoracion',    30),
  ('Belleza y Cuidado Personal', 'belleza-y-cuidado-personal', 40),
  ('Bienestar y Deporte',  'bienestar-y-deporte',   50),
  ('Tecnología y Electrónica', 'tecnologia-y-electronica', 60),
  ('Mascotas',             'mascotas',              70),
  ('Varios',               'varios',                80),
  ('Ofertas / Sale',       'ofertas-sale',          90)
ON CONFLICT (slug) DO NOTHING;

-- Asignar iconos a rubros (nombres compatibles con Lucide/AppIcon si se usan en frontend).
UPDATE public.wa_rubros SET icon = 'Shirt'           WHERE slug = 'moda-y-accesorios' AND (icon IS NULL OR icon = '');
UPDATE public.wa_rubros SET icon = 'UtensilsCrossed' WHERE slug = 'gastronomia' AND (icon IS NULL OR icon = '');
UPDATE public.wa_rubros SET icon = 'Home'          WHERE slug = 'hogar-y-decoracion' AND (icon IS NULL OR icon = '');
UPDATE public.wa_rubros SET icon = 'Sparkles'      WHERE slug = 'belleza-y-cuidado-personal' AND (icon IS NULL OR icon = '');
UPDATE public.wa_rubros SET icon = 'Dumbbell'     WHERE slug = 'bienestar-y-deporte' AND (icon IS NULL OR icon = '');
UPDATE public.wa_rubros SET icon = 'Smartphone'   WHERE slug = 'tecnologia-y-electronica' AND (icon IS NULL OR icon = '');
UPDATE public.wa_rubros SET icon = 'PawPrint'     WHERE slug = 'mascotas' AND (icon IS NULL OR icon = '');
UPDATE public.wa_rubros SET icon = 'Package'      WHERE slug = 'varios' AND (icon IS NULL OR icon = '');
UPDATE public.wa_rubros SET icon = 'Tag'          WHERE slug = 'ofertas-sale' AND (icon IS NULL OR icon = '');

-- 2. Categorías por rubro (por slug de rubro). ON CONFLICT (rubro_id, name) DO NOTHING.
DO $$
DECLARE
  r_moda UUID; r_gastronomia UUID; r_hogar UUID; r_belleza UUID;
  r_bienestar UUID; r_tech UUID; r_mascotas UUID; r_varios UUID; r_ofertas UUID;
BEGIN
  SELECT id INTO r_moda       FROM public.wa_rubros WHERE slug = 'moda-y-accesorios' LIMIT 1;
  SELECT id INTO r_gastronomia FROM public.wa_rubros WHERE slug = 'gastronomia' LIMIT 1;
  SELECT id INTO r_hogar     FROM public.wa_rubros WHERE slug = 'hogar-y-decoracion' LIMIT 1;
  SELECT id INTO r_belleza   FROM public.wa_rubros WHERE slug = 'belleza-y-cuidado-personal' LIMIT 1;
  SELECT id INTO r_bienestar FROM public.wa_rubros WHERE slug = 'bienestar-y-deporte' LIMIT 1;
  SELECT id INTO r_tech     FROM public.wa_rubros WHERE slug = 'tecnologia-y-electronica' LIMIT 1;
  SELECT id INTO r_mascotas FROM public.wa_rubros WHERE slug = 'mascotas' LIMIT 1;
  SELECT id INTO r_varios   FROM public.wa_rubros WHERE slug = 'varios' LIMIT 1;
  SELECT id INTO r_ofertas  FROM public.wa_rubros WHERE slug = 'ofertas-sale' LIMIT 1;

  -- 1. Moda y Accesorios
  IF r_moda IS NOT NULL THEN
    INSERT INTO public.wa_rubro_categories (rubro_id, name, sort_order) VALUES
      (r_moda, 'Blusas', 1), (r_moda, 'Vestidos', 2), (r_moda, 'Faldas', 3), (r_moda, 'Pantalones', 4), (r_moda, 'Jeans', 5), (r_moda, 'Blazers', 6),
      (r_moda, 'Camisas', 7), (r_moda, 'Camisetas/Poleras', 8), (r_moda, 'Shorts', 9), (r_moda, 'Chaquetas', 10),
      (r_moda, 'Bebés (0-24m)', 11), (r_moda, 'Niños', 12), (r_moda, 'Niñas', 13), (r_moda, 'Uniformes Escolares', 14),
      (r_moda, 'Zapatillas', 15), (r_moda, 'Zapatos formales', 16), (r_moda, 'Sandalias', 17), (r_moda, 'Botas', 18),
      (r_moda, 'Joyería', 19), (r_moda, 'Relojes', 20), (r_moda, 'Bolsos/Carteras', 21), (r_moda, 'Lentes de sol', 22), (r_moda, 'Cinturones', 23),
      (r_moda, 'Lencería', 24), (r_moda, 'Bóxers', 25), (r_moda, 'Pijamas', 26), (r_moda, 'Ropa de descanso', 27)
    ON CONFLICT (rubro_id, name) DO NOTHING;
  END IF;

  -- 2. Gastronomía (Comida preparada)
  IF r_gastronomia IS NOT NULL THEN
    INSERT INTO public.wa_rubro_categories (rubro_id, name, sort_order) VALUES
      (r_gastronomia, 'Tortas', 1), (r_gastronomia, 'Pasteles', 2), (r_gastronomia, 'Galletas', 3), (r_gastronomia, 'Repostería Vegana', 4), (r_gastronomia, 'Panadería', 5),
      (r_gastronomia, 'Hamburguesas', 6), (r_gastronomia, 'Pizzas', 7), (r_gastronomia, 'Completos/Hot Dogs', 8), (r_gastronomia, 'Papas Fritas', 9),
      (r_gastronomia, 'Ensaladas', 10), (r_gastronomia, 'Bowls', 11), (r_gastronomia, 'Jugos Naturales', 12), (r_gastronomia, 'Opciones Keto', 13),
      (r_gastronomia, 'Comida Casera', 14), (r_gastronomia, 'Sushi', 15), (r_gastronomia, 'Pasta', 16), (r_gastronomia, 'Carnes y Parrilladas', 17),
      (r_gastronomia, 'Cervezas Artesanales', 18), (r_gastronomia, 'Vinos', 19), (r_gastronomia, 'Coctelería', 20), (r_gastronomia, 'Bebidas Analcohólicas', 21)
    ON CONFLICT (rubro_id, name) DO NOTHING;
  END IF;

  -- 3. Hogar y Decoración
  IF r_hogar IS NOT NULL THEN
    INSERT INTO public.wa_rubro_categories (rubro_id, name, sort_order) VALUES
      (r_hogar, 'Living', 1), (r_hogar, 'Comedor', 2), (r_hogar, 'Dormitorio', 3), (r_hogar, 'Oficina/Home Office', 4),
      (r_hogar, 'Sábanas', 5), (r_hogar, 'Cortinas', 6), (r_hogar, 'Alfombras', 7), (r_hogar, 'Cojines', 8),
      (r_hogar, 'Cuadros', 9), (r_hogar, 'Velas', 10), (r_hogar, 'Floreros', 11), (r_hogar, 'Iluminación', 12),
      (r_hogar, 'Ollas', 13), (r_hogar, 'Vajilla', 14), (r_hogar, 'Utensilios', 15), (r_hogar, 'Pequeños Electrodomésticos', 16),
      (r_hogar, 'Plantas', 17), (r_hogar, 'Maceteros', 18), (r_hogar, 'Muebles de exterior', 19), (r_hogar, 'Herramientas', 20)
    ON CONFLICT (rubro_id, name) DO NOTHING;
  END IF;

  -- 4. Belleza y Cuidado Personal
  IF r_belleza IS NOT NULL THEN
    INSERT INTO public.wa_rubro_categories (rubro_id, name, sort_order) VALUES
      (r_belleza, 'Limpiadores', 1), (r_belleza, 'Hidratantes', 2), (r_belleza, 'Serums', 3), (r_belleza, 'Protección Solar', 4),
      (r_belleza, 'Rostro', 5), (r_belleza, 'Ojos', 6), (r_belleza, 'Labios', 7), (r_belleza, 'Brochas y Accesorios', 8),
      (r_belleza, 'Shampoos', 9), (r_belleza, 'Acondicionadores', 10), (r_belleza, 'Tratamientos', 11), (r_belleza, 'Tinturas', 12),
      (r_belleza, 'Perfumes Mujer', 13), (r_belleza, 'Perfumes Hombre', 14), (r_belleza, 'Fragancias de nicho', 15),
      (r_belleza, 'Esmaltes', 16), (r_belleza, 'Herramientas', 17), (r_belleza, 'Cuidado de manos', 18)
    ON CONFLICT (rubro_id, name) DO NOTHING;
  END IF;

  -- 5. Bienestar y Deporte
  IF r_bienestar IS NOT NULL THEN
    INSERT INTO public.wa_rubro_categories (rubro_id, name, sort_order) VALUES
      (r_bienestar, 'Proteínas', 1), (r_bienestar, 'Vitaminas', 2), (r_bienestar, 'Pre-entreno', 3),
      (r_bienestar, 'Pesas/Mancuernas', 4), (r_bienestar, 'Mats de Yoga', 5), (r_bienestar, 'Bandas elásticas', 6),
      (r_bienestar, 'Leggings', 7), (r_bienestar, 'Tops', 8), (r_bienestar, 'Shorts', 9), (r_bienestar, 'Ropa térmica', 10),
      (r_bienestar, 'Camping', 11), (r_bienestar, 'Trekking', 12), (r_bienestar, 'Ciclismo', 13)
    ON CONFLICT (rubro_id, name) DO NOTHING;
  END IF;

  -- 6. Tecnología y Electrónica
  IF r_tech IS NOT NULL THEN
    INSERT INTO public.wa_rubro_categories (rubro_id, name, sort_order) VALUES
      (r_tech, 'Notebooks', 1), (r_tech, 'Accesorios (Mouse/Teclado)', 2), (r_tech, 'Monitores', 3),
      (r_tech, 'Celulares', 4), (r_tech, 'Carcasas', 5), (r_tech, 'Cargadores', 6), (r_tech, 'Audífonos', 7),
      (r_tech, 'Consolas', 8), (r_tech, 'Juegos', 9), (r_tech, 'Sillas Gamer', 10),
      (r_tech, 'Parlantes Bluetooth', 11), (r_tech, 'Cámaras', 12), (r_tech, 'Smart TVs', 13)
    ON CONFLICT (rubro_id, name) DO NOTHING;
  END IF;

  -- 7. Mascotas (rubro puede ser el existente "mascotas")
  IF r_mascotas IS NOT NULL THEN
    INSERT INTO public.wa_rubro_categories (rubro_id, name, sort_order) VALUES
      (r_mascotas, 'Alimento', 1), (r_mascotas, 'Juguetes', 2), (r_mascotas, 'Camas', 3), (r_mascotas, 'Correas y Arneses', 4),
      (r_mascotas, 'Arenas Sanitarias', 5), (r_mascotas, 'Rascadores', 6),
      (r_mascotas, 'Peces', 7), (r_mascotas, 'Aves', 8), (r_mascotas, 'Animales Exóticos', 9)
    ON CONFLICT (rubro_id, name) DO NOTHING;
  END IF;

  -- Varios / Otros
  IF r_varios IS NOT NULL THEN
    INSERT INTO public.wa_rubro_categories (rubro_id, name, sort_order) VALUES
      (r_varios, 'General', 1)
    ON CONFLICT (rubro_id, name) DO NOTHING;
  END IF;

  -- Ofertas / Sale (sin subcategorías obligatorias; el admin puede agregar)
  IF r_ofertas IS NOT NULL THEN
    INSERT INTO public.wa_rubro_categories (rubro_id, name, sort_order) VALUES
      (r_ofertas, 'Ofertas', 1)
    ON CONFLICT (rubro_id, name) DO NOTHING;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
