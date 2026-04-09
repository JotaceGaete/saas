-- ============================================================
-- Configuración global del admin de Ventalink.
-- Clave-valor simple. Primer uso: daily_message (Consejo del día).
-- Escritura: solo via RPC SECURITY DEFINER con check de rol admin.
-- Lectura: via RPC pública (para mostrar en dashboard de usuarios).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.wa_admin_settings (
  key        TEXT        PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.wa_admin_settings IS 'Configuración global del panel admin. Clave-valor.';

ALTER TABLE public.wa_admin_settings ENABLE ROW LEVEL SECURITY;
-- Sin políticas directas: acceso exclusivo via RPC SECURITY DEFINER.

-- ── RPC pública: leer el consejo del día ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wa_get_daily_message()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT value FROM public.wa_admin_settings WHERE key = 'daily_message' LIMIT 1;
$$;

COMMENT ON FUNCTION public.wa_get_daily_message IS
  'Devuelve el mensaje del día configurado por el admin. Accesible por usuarios autenticados.';

GRANT EXECUTE ON FUNCTION public.wa_get_daily_message TO authenticated;

-- ── RPC admin: escribir el consejo del día ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.wa_admin_set_daily_message(p_message TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo admins
  IF NOT (
    (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin') OR
    (auth.jwt() -> 'app_metadata'  ->> 'role' = 'admin')
  ) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  INSERT INTO public.wa_admin_settings (key, value, updated_at)
  VALUES ('daily_message', p_message, now())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.wa_admin_set_daily_message IS
  'Actualiza el mensaje del día. Solo accesible por admins (role en JWT).';

GRANT EXECUTE ON FUNCTION public.wa_admin_set_daily_message TO authenticated;

NOTIFY pgrst, 'reload schema';
