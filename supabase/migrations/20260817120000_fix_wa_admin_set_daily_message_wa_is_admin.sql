-- ============================================================
-- Fix de seguridad: wa_admin_set_daily_message() debe autorizar
-- exclusivamente vía public.wa_is_admin() -- nunca un chequeo directo de
-- user_metadata.role.
--
-- CAUSA RAÍZ (20260409120000_wa_admin_settings.sql:44-47): el gate original
-- era un chequeo inline duplicado que aceptaba
-- (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' como alternativa
-- válida a app_metadata -- exactamente el mismo patrón de auto-escalación
-- ya corregido en wa_is_admin() (20260817100000). Esta función NO
-- reutilizaba wa_is_admin(), tenía su propio chequeo duplicado.
--
-- Principio de diseño de esta ronda: public.wa_is_admin() es la ÚNICA
-- fuente de autoridad admin en SQL -- ninguna RPC/policy debe repetir un
-- chequeo directo de metadata cuando puede reutilizarla.
--
-- Firma y comportamiento preservados exactamente salvo el gate de
-- autorización.
-- ============================================================

CREATE OR REPLACE FUNCTION public.wa_admin_set_daily_message(p_message TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo admins -- fuente única: public.wa_is_admin() (app_metadata.role
  -- exclusivamente, fix 2026-08-17).
  IF NOT public.wa_is_admin() THEN
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
  'Actualiza el mensaje del día. Solo accesible por admins vía public.wa_is_admin() (app_metadata.role exclusivamente, nunca user_metadata -- fix 2026-08-17).';

NOTIFY pgrst, 'reload schema';
