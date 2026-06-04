import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Layer 1b: fires when this module is first imported.
console.log(
  '[custom-domain-module] loaded — hostname:',
  typeof window !== 'undefined' ? window.location.hostname : 'ssr',
);

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
 * Resolves a business slug from the current hostname via business_domains.
 *
 * Resolution order:
 *   1. RPC get_slug_by_custom_domain — SECURITY DEFINER, bypasses RLS.
 *   2. Direct SELECT business_domains → wa_businesses (fallback if RLS allows anon).
 *
 * Returns { slug: string|null, loading: boolean }
 */
export function useCustomDomainSlug() {
  const [slug, setSlug] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Layer 3: fires inside the effect — if you see layer-2 but not this,
    // React is suppressing effects (strict-mode double-invoke?).
    const hostname =
      typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';

    console.log('[custom-domain] useEffect fired — hostname:', hostname);

    if (!hostname || isWalinkaHost(hostname)) {
      console.log('[custom-domain] walinka host — skipping lookup, hostname:', hostname);
      setSlug(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      // ── Step 1: RPC (SECURITY DEFINER — bypasses RLS) ──────────────────────
      let rpcSlug = null;
      let rpcError = null;
      try {
        const result = await supabase.rpc('get_slug_by_custom_domain', { p_domain: hostname });
        rpcSlug = result.data;
        rpcError = result.error;
      } catch (err) {
        rpcError = { message: err?.message || String(err), code: 'JS_EXCEPTION' };
      }

      console.log('[custom-domain] rpc get_slug_by_custom_domain →', {
        hostname,
        rpcSlug,
        rpcError: rpcError ? { message: rpcError.message, code: rpcError.code } : null,
      });

      if (!cancelled && !rpcError && rpcSlug) {
        console.log('[custom-domain] resolved via rpc — slug:', rpcSlug);
        setSlug(rpcSlug);
        setLoading(false);
        return;
      }

      if (cancelled) return;

      // ── Step 2: Direct query fallback ───────────────────────────────────────
      console.log('[custom-domain] rpc empty/failed — trying direct SELECT on business_domains');

      let domainRow = null;
      let domainError = null;
      try {
        const result = await supabase
          .from('business_domains')
          .select('business_id, status, domain')
          .eq('domain', hostname)
          .eq('status', 'active')
          .maybeSingle();
        domainRow = result.data;
        domainError = result.error;
      } catch (err) {
        domainError = { message: err?.message || String(err), code: 'JS_EXCEPTION' };
      }

      console.log('[custom-domain] business_domains row →', {
        domainRow,
        domainError: domainError ? { message: domainError.message, code: domainError.code } : null,
      });

      if (cancelled) return;

      if (domainError || !domainRow?.business_id) {
        console.log('[custom-domain] no matching domain row — falling back to normal routing');
        setSlug(null);
        setLoading(false);
        return;
      }

      let bizRow = null;
      let bizError = null;
      try {
        const result = await supabase
          .from('wa_businesses')
          .select('slug')
          .eq('id', domainRow.business_id)
          .eq('is_active', true)
          .maybeSingle();
        bizRow = result.data;
        bizError = result.error;
      } catch (err) {
        bizError = { message: err?.message || String(err), code: 'JS_EXCEPTION' };
      }

      console.log('[custom-domain] wa_businesses row →', {
        business_id: domainRow.business_id,
        bizRow,
        bizError: bizError ? { message: bizError.message, code: bizError.code } : null,
      });

      if (cancelled) return;

      const resolvedSlug = bizRow?.slug || null;
      console.log('[custom-domain] final resolved slug:', resolvedSlug);
      setSlug(resolvedSlug);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { slug, loading };
}
