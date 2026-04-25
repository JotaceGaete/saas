ALTER TABLE public.email_queue
ADD COLUMN IF NOT EXISTS user_id uuid,
ADD COLUMN IF NOT EXISTS business_id uuid,
ADD COLUMN IF NOT EXISTS type text;

UPDATE public.email_queue
SET type = COALESCE(type, template)
WHERE type IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS email_queue_business_type_unique
ON public.email_queue (business_id, type)
WHERE business_id IS NOT NULL
  AND type IS NOT NULL;