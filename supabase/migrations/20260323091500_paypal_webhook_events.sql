-- Webhook idempotency table for PayPal events.
-- Guarantees atomic processing reservation with UNIQUE(event_id, environment).

CREATE TABLE IF NOT EXISTS public.paypal_webhook_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'live')),
  event_id TEXT NOT NULL,
  event_type TEXT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'processed', 'failed')),
  payload JSONB NULL,
  processing_error TEXT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS paypal_webhook_events_event_env_uidx
  ON public.paypal_webhook_events (event_id, environment);

CREATE INDEX IF NOT EXISTS paypal_webhook_events_status_idx
  ON public.paypal_webhook_events (status);

