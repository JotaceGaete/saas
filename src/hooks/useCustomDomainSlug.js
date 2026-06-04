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
 * Resolves a business slug from the current hostname.
 *
 * Strategy (in order):
 *   1. Call RPC get_slug_by_custom_domain — SECURITY DEFINER, bypasses RLS.
 *   2. Fallback: direct SELECT on business_domains → wa_businesses (works if RLS allows anon).
 *
 * Returns { slug: string|null, loading: boolean }
 *   loading=true  → resolution in flight
 *   slug=null     → not a custom domain; normal walinka routing applies
 *   slug=string   → custom domain matched; render this catalog
 */
export function useCustomDomainSlug() {
  const [slug, setSlug] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const hostname =
      typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';

    console.log('[custom-domain] hostname detected:', hostname);

    if (!hostname || isWalinkaHost(hostname)) {
      console.log('[custom-domain] walinka host — skipping lookup');
      setSlug(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      // ── Step 1: RPC (SECURITY DEFINER — bypasses RLS) ──────────────────────
      const { data: rpcSlug, error: rpcError } = await supabase
        .rpc('get_slug_by_custom_domain', { p_domain: hostname });

      console.log('[custom-domain] rpc get_slug_by_custom_domain →', {
        hostname,
        rpcSlug,
        rpcError: rpcError ? { message: rpcError.message, code: rpcError.code } : null,
      });

      if (!cancelled && !rpcError && rpcSlug) {
        console.log('[custom-domain] resolved via rpc, slug:', rpcSlug);
        setSlug(rpcSlug);
        setLoading(false);
        return;
      }

      if (cancelled) return;

      // ── Step 2: Direct query fallback ───────────────────────────────────────
      console.log('[custom-domain] rpc failed or empty — trying direct query');

      const { data: domainRow, error: domainError } = await supabase
        .from('business_domains')
        .select('business_id, status, domain')
        .eq('domain', hostname)
        .eq('status', 'active')
        .maybeSingle();

      console.log('[custom-domain] business_domains row →', {
        domainRow,
        domainError: domainError ? { message: domainError.message, code: domainError.code } : null,
      });

      if (cancelled) return;

      if (domainError || !domainRow?.business_id) {
        console.log('[custom-domain] no matching domain row — rendering normal flow');
        setSlug(null);
        setLoading(false);
        return;
      }

      const { data: bizRow, error: bizError } = await supabase
        .from('wa_businesses')
        .select('slug')
        .eq('id', domainRow.business_id)
        .eq('is_active', true)
        .maybeSingle();

      console.log('[custom-domain] wa_businesses row →', {
        business_id: domainRow.business_id,
        bizRow,
        bizError: bizError ? { message: bizError.message, code: bizError.code } : null,
      });

      if (cancelled) return;

      const resolvedSlug = bizRow?.slug || null;
      console.log('[custom-domain] final slug:', resolvedSlug);
      setSlug(resolvedSlug);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { slug, loading };
}
