ALTER TABLE public.admin_alert_queue
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;

UPDATE public.admin_alert_queue
SET next_attempt_at = COALESCE(next_attempt_at, created_at, now())
WHERE next_attempt_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_admin_alert_queue_next_attempt_status
  ON public.admin_alert_queue (next_attempt_at)
  WHERE status IN ('pending', 'failed');

COMMENT ON COLUMN public.admin_alert_queue.next_attempt_at IS
  'Proximo intento permitido para alertas admin. Se usa para aplicar backoff y cortar retries infinitos.';
