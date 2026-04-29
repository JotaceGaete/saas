-- Add business_mode to wa_businesses
-- Idempotent: uses IF NOT EXISTS; safe to re-run.

ALTER TABLE public.wa_businesses
  ADD COLUMN IF NOT EXISTS business_mode text NOT NULL DEFAULT 'store';

-- Add check constraint only if it doesn't exist yet
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conname = 'wa_businesses_business_mode_check'
    AND    conrelid = 'public.wa_businesses'::regclass
  ) THEN
    ALTER TABLE public.wa_businesses
      ADD CONSTRAINT wa_businesses_business_mode_check
      CHECK (business_mode IN ('store', 'restaurant'));
  END IF;
END;
$$;
