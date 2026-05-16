/**
 * Clasifica errores de proveedor IA para decidir si intentar fallback al otro proveedor.
 * No reemplaza validación de entrada (eso ocurre antes de llamar al proveedor).
 */

/**
 * @param {unknown} err
 * @returns {string}
 */
export function summarizeAiError(err) {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const s = msg.replace(/\s+/g, ' ').trim();
  return s.length > 320 ? `${s.slice(0, 317)}…` : s;
}

/**
 * HTTP status extraído de mensajes tipo `[ai/openai] HTTP 429: ...` o propiedades del error.
 * @param {unknown} err
 * @returns {number|null}
 */
function inferHttpStatus(err) {
  if (err && typeof err === 'object') {
    const s = err.status ?? err.statusCode ?? err.cause?.status ?? err.cause?.statusCode;
    if (typeof s === 'number' && Number.isFinite(s)) return s;
  }
  const m = String(err?.message ?? err ?? '').match(/HTTP\s+(\d{3})/i);
  if (m) return Number(m[1]);
  return null;
}

/**
 * ¿El fallo del proveedor primario justifica intentar el secundario?
 * No usar para errores de validación previos a la API ni fallos definitivos (auth inválida, cuerpo 400).
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function shouldAttemptFallbackFromPrimaryError(err) {
  const msg = String(err?.message ?? err ?? '');
  const lower = msg.toLowerCase();

  if (msg.includes('[ai] text or productName is required')) return false;
  if (msg.includes('Model returned empty description')) return false;
  if (msg.includes('Invalid JSON from model') || msg.includes('Model content not JSON') || msg.includes('[ai/openai] Invalid JSON')) {
    return false;
  }

  const http = inferHttpStatus(err);
  if (http === 401) return false;
  if (http === 400 && !lower.includes('rate') && !lower.includes('quota') && !lower.includes('resource')) return false;

  if (msg.includes('Missing GEMINI_API_KEY') || msg.includes('Missing OPENAI_API_KEY')) return true;

  if (msg.includes('Provider timeout')) return true;
  if (http === 429 || http === 502 || http === 503 || http === 504) return true;

  // 403 de proveedor (ej. Gemini PERMISSION_DENIED: proyecto bloqueado, cuota, acceso denegado).
  // No confundir con HttpError(403) de plan no permitido, que se atrapa antes con isHttpError().
  if (
    lower.includes('permission_denied')
    || lower.includes('permission denied')
    || lower.includes('your project has been denied')
    || lower.includes('access denied')
    || lower.includes('forbidden')
  ) {
    return true;
  }
  if (http === 403) return true;

  if (
    lower.includes('rate limit')
    || lower.includes('quota')
    || lower.includes('resource exhausted')
    || lower.includes('too many requests')
  ) {
    return true;
  }
  if (
    lower.includes('unavailable')
    || lower.includes('overloaded')
    || lower.includes('try again later')
    || lower.includes('service unavailable')
    || lower.includes('deadline exceeded')
    || lower.includes('temporarily unavailable')
  ) {
    return true;
  }

  const code = err && typeof err === 'object' ? err.code : undefined;
  if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ENOTFOUND' || code === 'EAI_AGAIN') return true;
  if (lower.includes('fetch failed') || lower.includes('network') || lower.includes('socket')) return true;

  if (http != null && http >= 500 && http < 600) return true;

  return false;
}

/** Alias del nombre alternativo solicitado. */
export const isRetryableAIProviderError = shouldAttemptFallbackFromPrimaryError;

/**
 * @param {'gemini'|'openai'} providerId
 * @returns {boolean}
 */
export function hasProviderApiKeyConfigured(providerId) {
  if (providerId === 'gemini') {
    return Boolean(String(process.env.GEMINI_API_KEY || '').trim());
  }
  if (providerId === 'openai') {
    return Boolean(String(process.env.OPENAI_API_KEY || '').trim());
  }
  return false;
}
