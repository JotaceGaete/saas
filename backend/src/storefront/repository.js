/**
 * Repositorio de solo lectura sobre el read model (funciones storefront_* de la migración 0001).
 * Todo el filtrado, la búsqueda, el orden y la paginación ocurren en PostgreSQL.
 * `rpc(fn, args)` es inyectado: createSupabaseRpc en producción, createPgRpc en pruebas.
 */
export function createStorefrontRepository({ rpc }) {
  if (typeof rpc !== 'function') throw new Error('createStorefrontRepository requiere rpc()');

  return {
    async findBusinessBySlug(slug) {
      const rows = await rpc('storefront_business', { p_slug: slug });
      return rows[0] ?? null;
    },

    listCategories(businessId) {
      return rpc('storefront_categories', { p_business_id: businessId });
    },

    /** Una página: limit ya incluye +1 para detectar página siguiente. */
    listProductPage(businessId, { sort, filter, category, q, afterKey, afterId, limit }) {
      return rpc('storefront_list_products', {
        p_business_id: businessId,
        p_sort: sort,
        p_filter: filter ?? null,
        p_category: category ?? null,
        p_q: q ?? null,
        p_after_key: afterKey === undefined || afterKey === null ? null : String(afterKey),
        p_after_id: afterId ?? null,
        p_limit: limit,
      });
    },

    async findProduct(businessId, productSlug) {
      const rows = await rpc('storefront_product', { p_business_id: businessId, p_slug: productSlug });
      return rows[0] ?? null;
    },

    findProductsByIds(businessId, ids) {
      if (ids.length === 0) return Promise.resolve([]);
      return rpc('storefront_products_by_ids', { p_business_id: businessId, p_ids: ids.slice(0, 100) });
    },

    listBanners(businessId, placement) {
      return rpc('storefront_banners', { p_business_id: businessId, p_placement: placement });
    },
  };
}
