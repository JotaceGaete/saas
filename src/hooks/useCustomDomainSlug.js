import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const WALINKA_HOSTS = [
  'ventalink.app',
  'cl.ventalink.app',
  'go.ventalink.app',
  'miralatienda.de',
  'localhost',
  '127.0.0.1',
];

function isWalinkaHost(hostname) {
  const h = (hostname || '').toLowerCase();
  return WALINKA_HOSTS.some((d) => h === d || h.endsWith(`.${d}`));
}

/**
 * Resolves a business slug from the current hostname via the business_domains table.
 * Returns { slug: string|null, loading: boolean }.
 *   - loading=true  → query in flight, render nothing yet
 *   - slug=null     → hostname is not a custom domain (normal walinka flow)
 *   - slug=string   → custom domain matched; render this catalog
 */
export function useCustomDomainSlug() {
  const [slug, setSlug] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const hostname =
      typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';

    if (!hostname || isWalinkaHost(hostname)) {
      setSlug(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      // Query business_domains using the `domain` column + status filter
      const { data, error } = await supabase
        .from('business_domains')
        .select('*')
        .eq('domain', hostname)
        .eq('status', 'active')
        .maybeSingle();

      console.log('[custom-domain]', hostname, { data, error });

      if (cancelled) return;

      if (error || !data) {
        setSlug(null);
        setLoading(false);
        return;
      }

      // Try common slug columns first (direct)
      const directSlug =
        data.slug || data.business_slug || data.catalog_slug || null;

      if (directSlug) {
        setSlug(directSlug);
        setLoading(false);
        return;
      }

      // Fallback: look up slug via business_id FK → wa_businesses
      if (data.business_id) {
        const { data: biz } = await supabase
          .from('wa_businesses')
          .select('slug')
          .eq('id', data.business_id)
          .maybeSingle();

        if (!cancelled) {
          setSlug(biz?.slug || null);
          setLoading(false);
        }
        return;
      }

      setSlug(null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { slug, loading };
}
