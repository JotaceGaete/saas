-- Returns the active custom domain for a given business slug.
-- SECURITY DEFINER so anon callers bypass RLS on business_domains.
CREATE OR REPLACE FUNCTION public.get_active_custom_domain(p_slug text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT bd.domain
  FROM   public.business_domains bd
  JOIN   public.wa_businesses    wb ON wb.id = bd.business_id
  WHERE  wb.slug     = lower(trim(p_slug))
  AND    wb.is_active = true
  AND    bd.status   = 'active'
  LIMIT  1;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_custom_domain(text) TO anon, authenticated;
