import { InvalidCursorError } from './cursor.js';
import {
  isPubliclyVisible,
  mapBanner,
  mapCategory,
  mapProductDetail,
  mapProductSummary,
  mapStoreProfile,
  toInternalProductRow,
} from './mapping.js';
import { SORT_MODES, sortKeyOf } from './sort.js';

export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 60;
export const FILTERS = Object.freeze(['featured', 'on_sale']);
export const PLACEMENTS = Object.freeze(['home_hero', 'home_secondary', 'catalog_top']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ParamError extends Error {
  constructor(param) {
    super(`Parámetro inválido: ${param}`);
    this.name = 'ParamError';
    this.param = param;
  }
}

/**
 * Lee query params de listados. sort, filter y category inválidos → ParamError (400).
 * limit: no numérico o 0 → valor por defecto; fuera de rango → se acota a [1, 60].
 */
export function parseListParams(searchParams, defaultSort = 'manual') {
  const sort = searchParams.get('sort') ?? defaultSort;
  if (!SORT_MODES.includes(sort)) throw new ParamError('sort');

  const filter = searchParams.get('filter') ?? undefined;
  if (filter !== undefined && !FILTERS.includes(filter)) throw new ParamError('filter');

  const category = searchParams.get('category') ?? undefined;
  if (category !== undefined && !/^[a-z0-9-]{1,80}$/.test(category)) throw new ParamError('category');

  const rawLimit = Number(searchParams.get('limit'));
  const limit = !rawLimit || !Number.isFinite(rawLimit)
    ? DEFAULT_PAGE_SIZE
    : Math.min(Math.max(1, Math.floor(rawLimit)), MAX_PAGE_SIZE);

  const cursor = searchParams.get('cursor') ?? undefined;
  return { sort, filter, category, limit, cursor };
}

/** Valida la clave del cursor según el orden. Un tipo incorrecto es un cursor inválido. */
function validKeyFor(sort, key) {
  if (sort === 'manual') return Number.isInteger(key);
  if (sort === 'name_asc') return typeof key === 'string';
  return typeof key === 'number' && Number.isFinite(key);
}

export function createStorefrontService({ repository, cursorCodec }) {
  if (!repository || !cursorCodec) throw new Error('createStorefrontService requiere repository y cursorCodec');

  async function loadBusiness(slug) {
    return (await repository.findBusinessBySlug(slug)) ?? null;
  }

  function scopeOf(slug, kind, { category, filter, q }) {
    return [slug, kind, category ?? '*', filter ?? '*', q ?? ''].join('|');
  }

  /** Una página de productos. El filtro, la búsqueda y el keyset se resuelven en PostgreSQL. */
  async function listPage(business, slug, kind, params) {
    const { sort, limit, cursor } = params;
    const scope = scopeOf(slug, kind, params);
    let afterKey = null;
    let afterId = null;
    if (cursor) {
      const pos = cursorCodec.decode(cursor, { sort, scope });
      if (!UUID_RE.test(pos.id) || !validKeyFor(sort, pos.key)) throw new InvalidCursorError();
      afterKey = pos.key;
      afterId = pos.id;
    }
    const rows = await repository.listProductPage(business.id, {
      sort,
      filter: params.filter,
      category: params.category,
      q: params.q,
      afterKey,
      afterId,
      limit: limit + 1,
    });
    const hasMore = rows.length > limit;
    const internal = rows.slice(0, limit).map((r) => toInternalProductRow(r)).filter(isPubliclyVisible);
    const last = internal[internal.length - 1];
    const nextCursor = hasMore && last
      ? cursorCodec.encode({ sort, key: sortKeyOf(sort, last), id: last.id, scope })
      : null;
    return { data: internal.map(mapProductSummary), meta: { nextCursor, limit } };
  }

  return {
    async getStore(slug) {
      const business = await loadBusiness(slug);
      if (!business) return null;
      return { data: mapStoreProfile(business), meta: { nextCursor: null, limit: 1 } };
    },

    async listCategories(slug) {
      const business = await loadBusiness(slug);
      if (!business) return null;
      const data = (await repository.listCategories(business.id)).map(mapCategory);
      return { data, meta: { nextCursor: null, limit: data.length } };
    },

    async listProducts(slug, params) {
      const business = await loadBusiness(slug);
      if (!business) return null;
      return listPage(business, slug, 'products', params);
    },

    async searchProducts(slug, params) {
      const business = await loadBusiness(slug);
      if (!business) return null;
      // Igual que el demo: sin texto de búsqueda no hay resultados.
      if (!String(params.q ?? '').trim()) return { data: [], meta: { nextCursor: null, limit: params.limit } };
      return listPage(business, slug, 'search', { ...params, q: params.q.trim() });
    },

    async getProduct(slug, productSlug) {
      const business = await loadBusiness(slug);
      if (!business) return null;
      const dbRow = await repository.findProduct(business.id, productSlug);
      if (!dbRow) return null;
      const row = toInternalProductRow(dbRow);
      if (!isPubliclyVisible(row)) return null;
      const relatedIds = row.add_ons_raw
        .filter((a) => a && a.type === 'product' && typeof a.productId === 'string')
        .map((a) => a.productId);
      const related = (await repository.findProductsByIds(business.id, relatedIds))
        .map((r) => toInternalProductRow(r))
        .filter(isPubliclyVisible);
      const visibleById = new Map(related.map((r) => [r.id, r]));
      return { data: mapProductDetail(row, visibleById), meta: { nextCursor: null, limit: 1 } };
    },

    async listBanners(slug, placement) {
      const business = await loadBusiness(slug);
      if (!business) return null;
      const data = (await repository.listBanners(business.id, placement))
        .map(mapBanner)
        .filter((b) => b.desktopImageUrl);
      return { data, meta: { nextCursor: null, limit: data.length } };
    },
  };
}
