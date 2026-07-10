import { getOgCatalogShareImageUrl } from './catalogSeo';
import { CATALOG_ORIGIN } from '../config/appUrl';

/** Generous — this runs in the background and must never block saving or sharing. */
const PREWARM_TIMEOUT_MS = 8_000;

/**
 * Fires a real GET at the exact og:image URL right after a visual save, so
 * the origin (serverless function + storage/CDN read) is warm by the time a
 * crawler makes the real first request. Never throws, never blocks the
 * caller beyond its own timeout — the share button stays usable regardless
 * of the outcome.
 *
 * @param {string} slug
 * @param {string|number|null} cacheBust — usually the business's updated_at;
 *   /api/og-catalog ignores this value server-side (it always reads the DB
 *   fresh), so any value works — it only affects which URL string gets warmed.
 * @returns {Promise<{ ok: boolean, ms: number, status: number|null }>}
 */
export async function prewarmOgImage(slug, cacheBust) {
  const t0 = Date.now();
  const url = getOgCatalogShareImageUrl(slug, cacheBust ?? Date.now(), CATALOG_ORIGIN);
  if (!url) return { ok: false, ms: 0, status: null };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PREWARM_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'GET', cache: 'no-store', signal: controller.signal });
    return { ok: res.ok, ms: Date.now() - t0, status: res.status };
  } catch {
    return { ok: false, ms: Date.now() - t0, status: null };
  } finally {
    clearTimeout(timer);
  }
}
