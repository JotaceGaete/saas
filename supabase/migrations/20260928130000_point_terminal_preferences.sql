-- POINT-TERMINAL-1 — terminal Point activa por negocio.
-- La lista de dispositivos sigue perteneciendo a Mercado Pago; Walinka solo
-- persiste cuál eligió el comercio y si ya fue verificada físicamente.
CREATE TABLE public.crm_point_terminal_preferences (
  business_id UUID PRIMARY KEY REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  terminal_id TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending',
  selected_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT crm_point_terminal_preferences_terminal_not_blank
    CHECK (terminal_id IS NULL OR btrim(terminal_id) <> ''),
  CONSTRAINT crm_point_terminal_preferences_verification_status
    CHECK (verification_status IN ('pending', 'verified'))
);

CREATE TRIGGER crm_point_terminal_preferences_updated_at
  BEFORE UPDATE ON public.crm_point_terminal_preferences
  FOR EACH ROW EXECUTE FUNCTION public.wa_set_updated_at();

ALTER TABLE public.crm_point_terminal_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.crm_point_terminal_preferences FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.crm_point_terminal_preferences IS
  'Terminal Mercado Pago Point actualmente elegida por el negocio. Server-side only; no elimina terminales de Mercado Pago ni altera el historial de operaciones.';
