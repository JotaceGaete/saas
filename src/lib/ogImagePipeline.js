/**
 * Fetch/race logic behind /api/og-catalog's cover+logo resolution, extracted
 * as a pure, dependency-injected module so the timing/race behavior can be
 * unit-tested without real network calls or real wall-clock waits.
 *
 * Strategy (deliberately NOT a plain Promise.allSettled): cover and logo
 * fetches start at the same time, but a successful cover must never wait on
 * the logo — only the failure/timeout path falls back to logo, and even then
 * never beyond the remaining total budget. See resolveOgSourceImage.
 */

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** JPEG / PNG / GIF / WebP magic bytes — rejects corrupt/invalid buffers that would break resvg. */
export function isSupportedRasterBuffer(ab) {
  if (!ab || ab.byteLength < 12) return false;
  const u = new Uint8Array(ab);
  if (u[0] === 0xff && u[1] === 0xd8) return true;
  if (u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4e && u[3] === 0x47) return true;
  if (u[0] === 0x47 && u[1] === 0x49 && u[2] === 0x46) return true;
  if (
    u[0] === 0x52 && u[1] === 0x49 && u[2] === 0x46 && u[3] === 0x46 &&
    u[8] === 0x57 && u[9] === 0x45 && u[10] === 0x42 && u[11] === 0x50
  ) {
    return true;
  }
  return false;
}

/**
 * Fetches a single remote image with a hard timeout, returning a result
 * object that never throws — callers never need a try/catch.
 * @returns {Promise<{ ok: boolean, dataUri: string|null, reason: string, ms: number }>}
 */
export async function fetchImageDataUri(url, { timeoutMs, fetchImpl = fetch, now = Date.now } = {}) {
  const t0 = now();
  if (!url || !/^https?:\/\//i.test(url)) {
    return { ok: false, dataUri: null, reason: 'invalid_or_missing_url', ms: 0 };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { Accept: 'image/jpeg,image/png,image/webp,image/gif,*/*;q=0.8' },
    });
    if (!res.ok) return { ok: false, dataUri: null, reason: `http_${res.status}`, ms: now() - t0 };
    const len = res.headers.get('content-length');
    if (len && Number(len) > MAX_IMAGE_BYTES) {
      return { ok: false, dataUri: null, reason: 'content_length_too_large', ms: now() - t0 };
    }
    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_IMAGE_BYTES || ab.byteLength === 0) {
      return { ok: false, dataUri: null, reason: 'body_size_invalid', ms: now() - t0 };
    }
    if (!isSupportedRasterBuffer(ab)) {
      return { ok: false, dataUri: null, reason: 'unsupported_or_corrupt_image_magic', ms: now() - t0 };
    }
    const ct = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim().toLowerCase();
    if (!ct.startsWith('image/')) {
      return { ok: false, dataUri: null, reason: 'not_image_content_type', ms: now() - t0 };
    }
    const b64 = Buffer.from(ab).toString('base64');
    return { ok: true, dataUri: `data:${ct};base64,${b64}`, reason: 'ok', ms: now() - t0 };
  } catch (e) {
    return { ok: false, dataUri: null, reason: e?.name === 'AbortError' ? 'timeout' : 'fetch_error', ms: now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Same fetch/timeout/validation contract as fetchImageDataUri, but returns raw
 * bytes instead of a data URI — used for proxying an explicit share image
 * byte-for-byte (WhatsApp doesn't follow redirects on og:image).
 * @returns {Promise<{ ok: boolean, buffer: Buffer|null, contentType: string|null, reason: string, ms: number }>}
 */
export async function fetchImageBuffer(url, { timeoutMs, fetchImpl = fetch, now = Date.now } = {}) {
  const t0 = now();
  if (!url || !/^https?:\/\//i.test(url)) {
    return { ok: false, buffer: null, contentType: null, reason: 'invalid_or_missing_url', ms: 0 };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { Accept: 'image/jpeg,image/png,image/webp,image/gif,*/*;q=0.8' },
    });
    if (!res.ok) return { ok: false, buffer: null, contentType: null, reason: `http_${res.status}`, ms: now() - t0 };
    const len = res.headers.get('content-length');
    if (len && Number(len) > MAX_IMAGE_BYTES) {
      return { ok: false, buffer: null, contentType: null, reason: 'content_length_too_large', ms: now() - t0 };
    }
    const ab = await res.arrayBuffer();
    if (ab.byteLength === 0 || ab.byteLength > MAX_IMAGE_BYTES) {
      return { ok: false, buffer: null, contentType: null, reason: 'body_size_invalid', ms: now() - t0 };
    }
    if (!isSupportedRasterBuffer(ab)) {
      return { ok: false, buffer: null, contentType: null, reason: 'unsupported_or_corrupt_image_magic', ms: now() - t0 };
    }
    const ct = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim().toLowerCase();
    if (!ct.startsWith('image/')) {
      return { ok: false, buffer: null, contentType: null, reason: 'not_image_content_type', ms: now() - t0 };
    }
    return { ok: true, buffer: Buffer.from(ab), contentType: ct, reason: 'ok', ms: now() - t0 };
  } catch (e) {
    return { ok: false, buffer: null, contentType: null, reason: e?.name === 'AbortError' ? 'timeout' : 'fetch_error', ms: now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Controlled race: cover and logo both start fetching immediately (never
 * serial). A successful cover returns right away — it never awaits the logo
 * fetch, even if the logo would resolve a moment later. Only when the cover
 * fails/times out do we fall back to awaiting the logo, and even that wait
 * is capped so the whole call never exceeds totalBudgetMs regardless of how
 * the per-image timeouts land.
 *
 * @returns {Promise<{
 *   source: 'cover'|'logo'|'none',
 *   coverResult: object, logoResult: object|null,
 *   coverDataUri: string|null, logoDataUri: string|null,
 *   totalMs: number,
 * }>}
 */
export async function resolveOgSourceImage({
  coverUrl,
  logoUrl,
  perImageTimeoutMs,
  totalBudgetMs,
  fetchImpl = fetch,
  now = Date.now,
}) {
  const t0 = now();
  const deadlineAt = t0 + totalBudgetMs;

  const coverPromise = fetchImageDataUri(coverUrl, { timeoutMs: perImageTimeoutMs, fetchImpl, now });
  // Starts fetching immediately (never serial) — but a successful cover below
  // returns without ever awaiting this, by design.
  const logoPromise = fetchImageDataUri(logoUrl, { timeoutMs: perImageTimeoutMs, fetchImpl, now });
  logoPromise.catch(() => {}); // fetchImageDataUri never actually rejects; just a safety net.

  const coverResult = await coverPromise;

  if (coverResult.ok) {
    return {
      source: 'cover',
      coverResult,
      logoResult: null,
      coverDataUri: coverResult.dataUri,
      logoDataUri: null,
      totalMs: now() - t0,
    };
  }

  const remaining = deadlineAt - now();
  let logoResult;
  if (remaining <= 0) {
    logoResult = { ok: false, dataUri: null, reason: 'total_budget_exceeded', ms: 0 };
  } else {
    logoResult = await Promise.race([
      logoPromise,
      new Promise((resolve) => {
        setTimeout(() => resolve({ ok: false, dataUri: null, reason: 'total_budget_exceeded', ms: remaining }), remaining);
      }),
    ]);
  }

  if (logoResult.ok) {
    return {
      source: 'logo',
      coverResult,
      logoResult,
      coverDataUri: null,
      logoDataUri: logoResult.dataUri,
      totalMs: now() - t0,
    };
  }

  return {
    source: 'none',
    coverResult,
    logoResult,
    coverDataUri: null,
    logoDataUri: null,
    totalMs: now() - t0,
  };
}
