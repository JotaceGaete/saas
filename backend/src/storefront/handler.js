import { cursorSecretFromEnv, createCursorCodec, InvalidCursorError } from './cursor.js';
import { createStorefrontService, parseListParams, ParamError, PLACEMENTS } from './service.js';
import { createStorefrontRepository } from './repository.js';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
const ROUTE_RE = /(?:^|\/)v1\/stores\/([^/]+)(?:\/(categories|products|search|banners)(?:\/([^/]+))?)?\/?$/;
const CACHE_OK = 'public, s-maxage=60, stale-while-revalidate=300';

function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
}

function fail(status, code, message, extra) {
  return json(status, { error: { code, message } }, extra);
}

/**
 * Manejador Fetch de la API Storefront v1.2 (solo GET).
 * Rutas:
 *   /v1/stores/{slug}
 *   /v1/stores/{slug}/categories
 *   /v1/stores/{slug}/products?sort&filter&category&limit&cursor
 *   /v1/stores/{slug}/search?q&sort&limit&cursor
 *   /v1/stores/{slug}/products/{productSlug}
 *   /v1/stores/{slug}/banners?placement=home_hero|home_secondary|catalog_top
 * Textos, páginas y bloques editoriales no están expuestos hasta que existan sus tablas (v1.3 pendiente).
 */
export function createStorefrontHandler({ service }) {
  if (!service) throw new Error('createStorefrontHandler requiere service');

  return async function handle(request) {
    if (request.method !== 'GET') {
      return fail(405, 'METHOD_NOT_ALLOWED', 'Solo GET', { Allow: 'GET' });
    }

    const url = new URL(request.url);
    const m = ROUTE_RE.exec(url.pathname);
    if (!m) return fail(404, 'NOT_FOUND', 'Ruta no encontrada');

    const slug = decodeURIComponent(m[1]);
    const resource = m[2];
    const sub = m[3] ? decodeURIComponent(m[3]) : undefined;
    if (!SLUG_RE.test(slug) || (sub !== undefined && !SLUG_RE.test(sub))) {
      return fail(404, 'NOT_FOUND', 'Ruta no encontrada');
    }

    try {
      let result;
      if (!resource) {
        result = await service.getStore(slug);
      } else if (resource === 'categories' && sub === undefined) {
        result = await service.listCategories(slug);
      } else if (resource === 'products' && sub === undefined) {
        result = await service.listProducts(slug, parseListParams(url.searchParams));
      } else if (resource === 'products' && sub !== undefined) {
        result = await service.getProduct(slug, sub);
      } else if (resource === 'banners' && sub === undefined) {
        const placement = url.searchParams.get('placement');
        if (!PLACEMENTS.includes(placement)) throw new ParamError('placement');
        result = await service.listBanners(slug, placement);
      } else if (resource === 'search' && sub === undefined) {
        const q = (url.searchParams.get('q') ?? '').slice(0, 120);
        result = await service.searchProducts(slug, { ...parseListParams(url.searchParams, 'name_asc'), q });
      } else {
        return fail(404, 'NOT_FOUND', 'Ruta no encontrada');
      }

      if (result === null) return fail(404, 'STORE_NOT_FOUND', 'Tienda no encontrada');
      return json(200, result, { 'Cache-Control': CACHE_OK });
    } catch (error) {
      if (error instanceof ParamError) return fail(400, 'INVALID_PARAM', error.message);
      if (error instanceof InvalidCursorError) return fail(400, 'INVALID_CURSOR', 'Cursor inválido');
      console.error('[storefront] error interno', error?.message ?? 'desconocido');
      return fail(500, 'INTERNAL', 'Error interno');
    }
  };
}

/**
 * Composición: secreto del cursor desde el entorno (fail-closed en producción).
 * rpc debe ser createSupabaseRpc (producción) o createPgRpc (pruebas).
 */
export function createStorefrontHandlerFromEnv({ rpc, env = process.env, repositoryFactory = createStorefrontRepository }) {
  const codec = createCursorCodec({ secret: cursorSecretFromEnv(env) });
  const repository = repositoryFactory({ rpc });
  const service = createStorefrontService({ repository, cursorCodec: codec });
  return createStorefrontHandler({ service });
}
