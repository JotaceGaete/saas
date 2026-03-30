-- Aclara semántica: cache_key = SHA-256 de (business_id + input canónico), sin provider/model,
-- para que el mismo contenido reutilice fila tras fallback entre proveedores.

COMMENT ON COLUMN public.wa_ai_product_description_cache.cache_key IS
  'SHA-256 hex: business_id + hash de entrada (texto, nombre, maxLen). Sin provider/model; columnas provider/model reflejan el proveedor final.';
