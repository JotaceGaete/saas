import { getPaypalApiBaseUrl } from '../../config/paypal/index.js';

const DEFAULT_TIMEOUT_MS = 12000;

function withTimeout(signal, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeout),
  };
}

/**
 * Cliente HTTP mínimo para PayPal REST API.
 * Devuelve status + body parseado (json o texto).
 */
export async function paypalRequest(path, options = {}) {
  const baseUrl = getPaypalApiBaseUrl();
  const url = `${baseUrl}${path}`;
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const { signal, cleanup } = withTimeout(options.signal, timeoutMs);

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body,
      signal,
    });

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const isJson = contentType.includes('application/json');
    const body = isJson ? await response.json().catch(() => null) : await response.text().catch(() => '');

    return {
      ok: response.ok,
      status: response.status,
      headers: response.headers,
      body,
    };
  } finally {
    cleanup();
  }
}

