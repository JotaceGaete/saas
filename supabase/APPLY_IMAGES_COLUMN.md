# Aplicar columna `images` en wa_products

Si ves el error **"Could not find the 'images' column of 'wa_products' in the schema cache"**, la tabla `wa_products` no tiene aún la columna para múltiples imágenes.

## Cómo solucionarlo

1. Entra a tu proyecto en [Supabase Dashboard](https://supabase.com/dashboard).
2. Ve a **SQL Editor**.
3. Crea una nueva query y pega este SQL:

```sql
-- Columna para múltiples imágenes por producto
ALTER TABLE public.wa_products
  ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.wa_products.images IS 'Array of image URLs; first should match image_url for main display';
```

4. Pulsa **Run** (o Ctrl+Enter).

Después de ejecutarlo, vuelve al editor de producto y guarda de nuevo. El error debería desaparecer y las múltiples imágenes se guardarán y podrás navegarlas en el catálogo.
