/**
 * Rate limit en memoria por negocio (ventana deslizante).
 * Cuenta todas las peticiones al endpoint (incl. las que aciertan cache).
 *
 * Env:
 * - AI_RATE_LIMIT_GENERATE_PRODUCT_DESCRIPTION_MAX (default 50; 0 = desactivado)
 * - AI_RATE_LIMIT_GENERATE_PRODUCT_DESCRIPTION_WINDOW_MS (default 60000)
 */

/** @type {Map<string, number[]>} */
const buckets = new Map();

function getMax() {
  const n = Number(process.env.AI_RATE_LIMIT_GENERATE_PRODUCT_DESCRIPTION_MAX);
  if (Number.isFinite(n) && n <= 0) return 0;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 50;
}

function getWindowMs() {
  const n = Number(process.env.AI_RATE_LIMIT_GENERATE_PRODUCT_DESCRIPTION_WINDOW_MS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 60_000;
}

/**
 * @param {string} businessId
 * @returns {{ allowed: boolean, retryAfterSec?: number, limit?: number, windowMs?: number }}
 */
export function consumeGenerateProductDescriptionSlot(businessId) {
  const max = getMax();
  const windowMs = getWindowMs();
  if (max === 0) {
    return { allowed: true };
  }

  const key = String(businessId || '').trim();
  if (!key) return { allowed: true };

  const now = Date.now();
  let stamps = buckets.get(key) || [];
  stamps = stamps.filter((t) => now - t < windowMs);

  if (stamps.length >= max) {
    const oldest = stamps[0];
    const retryAfterMs = Math.max(0, oldest + windowMs - now);
    const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
    return { allowed: false, retryAfterSec, limit: max, windowMs };
  }

  stamps.push(now);
  buckets.set(key, stamps);

  if (buckets.size > 50_000) {
    for (const [k, arr] of buckets) {
      const pruned = arr.filter((t) => now - t < windowMs);
      if (pruned.length === 0) buckets.delete(k);
      else buckets.set(k, pruned);
    }
  }

  return { allowed: true, limit: max, windowMs };
}
