/**
 * País del visitante solo para sugerencias de mercado (no es fuente de verdad del negocio).
 *
 * Origen del header (en orden):
 * - Cloudflare: CF-IPCountry (si el Worker o el proxy reenvían la petición al origen)
 * - Cloudflare: X-Ventalink-Country (opcional, si un Worker lo inyecta)
 * - Vercel: x-vercel-ip-country
 *
 * Respuesta: { country: "CL"|null, source: "edge"|"unknown" }
 * Si no hay país, el frontend puede usar fallback por IP (solo sugerencia).
 */

function normalizeCountry(headerValue) {
  if (!headerValue || typeof headerValue !== 'string') return null;
  const c = headerValue.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : null;
}

export async function GET(request) {
  const h = request.headers;
  const country =
    normalizeCountry(h.get('CF-IPCountry')) ||
    normalizeCountry(h.get('cf-ipcountry')) ||
    normalizeCountry(h.get('X-Ventalink-Country')) ||
    normalizeCountry(h.get('x-vercel-ip-country')) ||
    null;

  const body = JSON.stringify({
    country,
    source: country ? 'edge' : 'unknown',
  });

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  });
}
