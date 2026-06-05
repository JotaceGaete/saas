-- Public SECURITY DEFINER RPC to resolve a custom domain to a business slug.
-- Safe to call from anon/public: returns only the slug, nothing sensitive.
CREATE OR REPLACE FUNCTION public.get_slug_by_custom_domain(p_domain text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT wb.slug
  FROM   public.business_domains bd
  JOIN   public.wa_businesses    wb ON wb.id = bd.business_id
  WHERE  bd.domain   = lower(trim(p_domain))
  AND    bd.status   = 'active'
  AND    wb.is_active = true
  LIMIT  1;
$$;

-- Allow any role (including anon) to execute this function.
GRANT EXECUTE ON FUNCTION public.get_slug_by_custom_domain(text) TO anon, authenticated;
