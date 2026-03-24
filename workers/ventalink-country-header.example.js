/**
 * Ejemplo para Cloudflare Workers delante del origen (Vercel u otro):
 * reenvía el país de cf.country como cabecera legible por /api/client-country.
 *
 * Ajusta el nombre del worker y el origen según tu despliegue.
 * No intercepta rutas de assets/API si no lo necesitas: puedes limitar a HTML o a /api/client-country.
 *
 * @example
 * // En el Worker principal:
 * const country = request.cf?.country;
 * const reqToOrigin = new Request(request);
 * if (country) reqToOrigin.headers.set('X-Ventalink-Country', country);
 * return fetch(reqToOrigin);
 */

export default {
  async fetch(request, env, ctx) {
    const country = request.cf?.country;
    const headers = new Headers(request.headers);
    if (country && /^[A-Z]{2}$/i.test(String(country))) {
      headers.set('X-Ventalink-Country', String(country).toUpperCase());
    }
    return fetch(new Request(request.url, { method: request.method, headers, body: request.body }));
  },
};
