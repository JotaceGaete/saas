-- Country code canonical for payment/provider decisions (ISO alpha-2).
ALTER TABLE public.wa_businesses
  ADD COLUMN IF NOT EXISTS country_code TEXT;

COMMENT ON COLUMN public.wa_businesses.country_code IS 'ISO 3166-1 alpha-2 country code used for payments and pricing.';

-- Backfill from current country/currency data.
UPDATE public.wa_businesses
SET country_code = CASE
  WHEN upper(coalesce(country_code, '')) IN ('AR','BO','BR','CL','CO','CR','EC','GT','MX','PA','PE','PY','UY') THEN upper(country_code)
  WHEN upper(coalesce(country, '')) IN ('AR', 'ARGENTINA') THEN 'AR'
  WHEN upper(coalesce(country, '')) IN ('CL', 'CHILE') THEN 'CL'
  WHEN upper(coalesce(country, '')) IN ('BO', 'BOLIVIA') THEN 'BO'
  WHEN upper(coalesce(country, '')) IN ('BR', 'BRASIL', 'BRAZIL') THEN 'BR'
  WHEN upper(coalesce(country, '')) IN ('CO', 'COLOMBIA') THEN 'CO'
  WHEN upper(coalesce(country, '')) IN ('CR', 'COSTA RICA') THEN 'CR'
  WHEN upper(coalesce(country, '')) IN ('EC', 'ECUADOR') THEN 'EC'
  WHEN upper(coalesce(country, '')) IN ('GT', 'GUATEMALA') THEN 'GT'
  WHEN upper(coalesce(country, '')) IN ('MX', 'MEXICO', 'MEXICO') THEN 'MX'
  WHEN upper(coalesce(country, '')) IN ('PA', 'PANAMA') THEN 'PA'
  WHEN upper(coalesce(country, '')) IN ('PE', 'PERU') THEN 'PE'
  WHEN upper(coalesce(country, '')) IN ('PY', 'PARAGUAY') THEN 'PY'
  WHEN upper(coalesce(country, '')) IN ('UY', 'URUGUAY') THEN 'UY'
  WHEN upper(coalesce(currency, '')) = 'ARS' THEN 'AR'
  WHEN upper(coalesce(currency, '')) = 'CLP' THEN 'CL'
  ELSE 'CL'
END
WHERE country_code IS NULL
   OR upper(country_code) NOT IN ('AR','BO','BR','CL','CO','CR','EC','GT','MX','PA','PE','PY','UY');

ALTER TABLE public.wa_businesses
  ALTER COLUMN country_code SET DEFAULT 'CL';

UPDATE public.wa_businesses
SET country_code = 'CL'
WHERE country_code IS NULL;

ALTER TABLE public.wa_businesses
  ALTER COLUMN country_code SET NOT NULL;

ALTER TABLE public.wa_businesses
  DROP CONSTRAINT IF EXISTS wa_businesses_country_code_check;

ALTER TABLE public.wa_businesses
  ADD CONSTRAINT wa_businesses_country_code_check
  CHECK (country_code IN ('AR','BO','BR','CL','CO','CR','EC','GT','MX','PA','PE','PY','UY'));
