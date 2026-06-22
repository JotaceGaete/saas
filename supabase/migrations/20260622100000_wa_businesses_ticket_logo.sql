-- ============================================================
-- wa_businesses: logo específico para ticket térmico
--
-- ticket_logo_url — sobreescribe logo_url solo en impresión.
-- Si es NULL, el ticket usa logo_url. Si logo_url también es NULL,
-- no se muestra ninguna imagen (sin fallback genérico).
-- ============================================================

ALTER TABLE public.wa_businesses
  ADD COLUMN IF NOT EXISTS ticket_logo_url TEXT;
