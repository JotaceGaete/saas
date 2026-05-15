-- Public product slugs for shareable catalog product pages.
-- Slugs are unique per business and generated from product name when omitted.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

ALTER TABLE public.wa_products
  ADD COLUMN IF NOT EXISTS slug TEXT;

CREATE OR REPLACE FUNCTION public.wa_slugify_product_name(input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  out TEXT;
BEGIN
  out := lower(extensions.unaccent(coalesce(input, '')));
  out := regexp_replace(out, '[^a-z0-9]+', '-', 'g');
  out := trim(both '-' from out);
  IF out = '' THEN
    out := 'producto';
  END IF;
  RETURN out;
END;
$$;

CREATE OR REPLACE FUNCTION public.wa_products_assign_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  counter INTEGER := 2;
BEGIN
  IF NEW.slug IS NULL OR trim(NEW.slug) = '' THEN
    base_slug := public.wa_slugify_product_name(NEW.name);
  ELSIF TG_OP = 'UPDATE' AND NEW.name IS DISTINCT FROM OLD.name AND NEW.slug = OLD.slug THEN
    base_slug := public.wa_slugify_product_name(NEW.name);
  ELSE
    base_slug := public.wa_slugify_product_name(NEW.slug);
  END IF;

  candidate := base_slug;
  WHILE EXISTS (
    SELECT 1
    FROM public.wa_products p
    WHERE p.business_id = NEW.business_id
      AND p.slug = candidate
      AND p.id <> NEW.id
  ) LOOP
    candidate := base_slug || '-' || counter;
    counter := counter + 1;
  END LOOP;

  NEW.slug := candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wa_products_0_assign_slug ON public.wa_products;
CREATE TRIGGER wa_products_0_assign_slug
  BEFORE INSERT OR UPDATE OF name, slug, business_id ON public.wa_products
  FOR EACH ROW
  EXECUTE FUNCTION public.wa_products_assign_slug();

UPDATE public.wa_products
SET slug = NULL
WHERE slug IS NULL OR trim(slug) = '';

ALTER TABLE public.wa_products
  ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS wa_products_business_slug_unique_idx
  ON public.wa_products (business_id, slug);

CREATE INDEX IF NOT EXISTS wa_products_public_slug_lookup_idx
  ON public.wa_products (business_id, slug, is_active);

COMMENT ON COLUMN public.wa_products.slug IS 'Public product slug, unique per business, for shareable product pages.';
