-- Añade retry_count a email_queue para soportar reintentos automáticos con backoff lineal.
--
-- Comportamiento en process-email-queue:
--   - Fallo transitorio (Resend 5xx, timeout): retry_count++ y send_at += 30min × intento.
--   - Fallo permanente (business/user no existe): se fuerza retry_count = MAX_RETRIES (3) → failed definitivo.
--   - MAX_RETRIES = 3: tras 3 intentos fallidos el registro queda en status='failed'.
--
-- Backoff: intento 1 → +30min, intento 2 → +60min, intento 3 → failed definitivo.

ALTER TABLE public.email_queue
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.email_queue.retry_count IS
  'Número de intentos de envío fallidos. Al llegar a MAX_RETRIES (3), status pasa a failed definitivo.';
