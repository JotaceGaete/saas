import {
  deriveCategories,
  isPubliclyVisible,
  mapProductDetail,
  mapProductSummary,
  mapStoreProfile,
  toInternalProductRow,
} from './mapping.js';
import { compareProducts, isAfterPosition, sortKeyOf, SORT_MODES } from './sort.js';

export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 60;
export const FILTERS = Object.freeze(['featured', 'on_sale']);

export class ParamError extends Error {
  constructor(param) {
    super(`Parámetro inválido: ${param}`);
    this.name = 'ParamError';
    this.param = param;
  }
}

/**
 * Normaliza texto para búsqueda: minúsculas y sin tildes/diacríticos (decisión del dueño).
 * El demo del starter aplica la misma regla, así que la paridad se mantiene.
 */
export function normalizeText(s) {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
}

/**
 * Lee query params de listados. sort y filter inválidos → ParamError (400).
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

export function createStorefrontService({ repository, cursorCodec }) {
  if (!repository || !cursorCodec) throw new Error('createStorefrontService requiere repository y cursorCodec');

  async function loadStore(slug) {
    const business = await repository.findBusinessBySlug(slug);
    return business ?? null;
  }

  /** Productos públicos de la tienda ya mapeados a fila interna. */
  async function loadVisible(business) {
    const [catRows, prodRows] = await Promise.all([
      repository.listCategoryRows(business.id),
      repository.listProductRows(business.id),
    ]);
    const categorySlugByName = new Map(
      catRows
        .filter((c) => typeof c.name === 'string' && c.name.trim())
        .map((c) => [c.name.trim(), c.slug]),
    );
    const rows = prodRows
      .map((r) => toInternalProductRow(r, categorySlugByName))
      .filter((r) => isPubliclyVisible(r));
    const visibleById = new Map(rows.map((r) => [r.id, r]));
    return { rows, visibleById };
  }

  function paginate(rows, { sort, limit, cursor, scope }) {
    const sorted = [...rows].sort(compareProducts(sort));
    let pool = sorted;
    if (cursor) {
      const pos = cursorCodec.decode(cursor, { sort, scope });
      pool = sorted.filter((p) => isAfterPosition(sort, p, pos.key, pos.id));
    }
    const page = pool.slice(0, limit);
    const last = page[page.length - 1];
    const hasMore = pool.length > limit;
    const nextCursor = hasMore && last
      ? cursorCodec.encode({ sort, key: sortKeyOf(sort, last), id: last.id, scope })
      : null;
    return { data: page.map(mapProductSummary), meta: { nextCursor, limit } };
  }

  function scopeOf(slug, kind, { category, filter, q }) {
    return [slug, kind, category ?? '*', filter ?? '*', q ?? ''].join('|');
  }

  function applyFilters(rows, { category, filter, q }) {
    let out = rows;
    if (category) out = out.filter((r) => r.category_slug === category);
    if (filter === 'featured') out = out.filter((r) => r.featured || r.is_main_featured);
    if (filter === 'on_sale') out = out.filter((r) => r.on_sale);
    if (q) {
      const needle = normalizeText(q.trim());
      if (needle) out = out.filter((r) => normalizeText(r.name).includes(needle));
    }
    return out;
  }

  return {
    async getStore(slug) {
      const business = await loadStore(slug);
      if (!business) return null;
      return { data: mapStoreProfile(business), meta: { nextCursor: null, limit: 1 } };
    },

    async listCategories(slug) {
      const business = await loadStore(slug);
      if (!business) return null;
      const { rows } = await loadVisible(business);
      const data = deriveCategories(rows);
      return { data, meta: { nextCursor: null, limit: data.length } };
    },

    async listProducts(slug, params) {
      const business = await loadStore(slug);
      if (!business) return null;
      const { rows } = await loadVisible(business);
      const scope = scopeOf(slug, 'products', params);
      const filtered = applyFilters(rows, params);
      return paginate(filtered, { ...params, scope });
    },

    async searchProducts(slug, params) {
      const business = await loadStore(slug);
      if (!business) return null;
      // Igual que el demo: sin texto de búsqueda no hay resultados.
      if (!String(params.q ?? '').trim()) return { data: [], meta: { nextCursor: null, limit: params.limit } };
      const { rows } = await loadVisible(business);
      const scope = scopeOf(slug, 'search', params);
      const filtered = applyFilters(rows, params);
      return paginate(filtered, { ...params, scope });
    },

    async getProduct(slug, productSlug) {
      const business = await loadStore(slug);
      if (!business) return null;
      const { rows, visibleById } = await loadVisible(business);
      const row = rows.find((r) => r.slug === productSlug);
      if (!row) return null;
      return { data: mapProductDetail(row, visibleById), meta: { nextCursor: null, limit: 1 } };
    },
  };
}

