-- ============================================================
-- Normalizar set_updated_at() → public schema y alias
--
-- El proyecto usa public.wa_set_updated_at() como función
-- canónica de updated_at. La migración 20260602000000 creó
-- set_updated_at() sin schema explícito (cae en public) para
-- crm_cost_center y crm_purchases.
--
-- Ambas funciones son idénticas en comportamiento. Esta migración:
--   1. Crea public.set_updated_at() como alias de wa_set_updated_at()
--      si no existe — garantiza que siempre exista en el schema
--      correcto independientemente del search_path.
--   2. No elimina la función existente (puede haber otras dependencias).
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
