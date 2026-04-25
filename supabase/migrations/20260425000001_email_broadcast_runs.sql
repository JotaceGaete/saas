-- ─────────────────────────────────────────────────────────────────────────────
-- Migración: email_broadcast_runs
--
-- QUÉ HACE:
--   Crea la tabla email_broadcast_runs para evitar duplicados en envíos masivos.
--   El endpoint /api/admin/trigger-news-broadcast inserta un registro aquí
--   ANTES de encolar emails. Si el broadcast_id ya existe, el endpoint aborta
--   con 409 sin tocar email_queue.
--
-- NO TOCA:
--   - email_queue (schema, índices, triggers existentes)
--   - welcome, onboarding tips, n8n, cron
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.email_broadcast_runs (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id   text        NOT NULL UNIQUE,
  template       text        NOT NULL,
  subject        text,
  total_enqueued int         NOT NULL DEFAULT 0,
  skipped        int         NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.email_broadcast_runs IS
  'Registro de envíos masivos (broadcasts). '
  'UNIQUE broadcast_id actúa como guard idempotente: '
  'llamar al endpoint dos veces con el mismo broadcast_id retorna 409.';

COMMENT ON COLUMN public.email_broadcast_runs.broadcast_id IS
  'UUID generado por el cliente o por el endpoint. Único por campaña.';

COMMENT ON COLUMN public.email_broadcast_runs.total_enqueued IS
  'Filas insertadas en email_queue en este broadcast.';

COMMENT ON COLUMN public.email_broadcast_runs.skipped IS
  'Negocios saltados: sin email válido o con email pending/failed del mismo template.';

CREATE INDEX IF NOT EXISTS idx_broadcast_runs_created_at
  ON public.email_broadcast_runs (created_at DESC);

-- Solo service_role (el endpoint usa SUPABASE_SERVICE_ROLE_KEY)
ALTER TABLE public.email_broadcast_runs ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN POST-MIGRACIÓN
-- ─────────────────────────────────────────────────────────────────────────────
--
-- SELECT * FROM public.email_broadcast_runs ORDER BY created_at DESC LIMIT 5;
