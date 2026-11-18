import { BUSINESS_COLUMNS, CATEGORY_COLUMNS, PRODUCT_COLUMNS } from './mapping.js';

/**
 * Repositorio de solo lectura sobre las tablas reales de Walinka.
 * `select(spec)` es inyectado: en producción usa supabase-js con clave de servicio; en pruebas,
 * un adaptador SQL contra PostgreSQL. Como la clave de servicio omite RLS, cada consulta
 * filtra explícitamente por business_id, is_active, status e is_draft.
 *
 * spec: { table, columns: string[], eq: {col: value}, order?: [{column, ascending}], limit? }
 */
export function createStorefrontRepository({ select }) {
  if (typeof select !== 'function') throw new Error('createStorefrontRepository requiere select()');

  return {
    async findBusinessBySlug(slug) {
      const rows = await select({
        table: 'wa_businesses',
        columns: BUSINESS_COLUMNS,
        eq: { slug, is_active: true },
        limit: 1,
      });
      return rows[0] ?? null;
    },

    async listCategoryRows(businessId) {
      return select({
        table: 'wa_business_categories',
        columns: CATEGORY_COLUMNS,
        eq: { business_id: businessId },
      });
    },

    async listProductRows(businessId) {
      return select({
        table: 'wa_products',
        columns: PRODUCT_COLUMNS,
        eq: { business_id: businessId, is_active: true, status: 'active', is_draft: false },
      });
    },
  };
}

/** Adaptador supabase-js (producción). Solo SELECT; sin joins. */
export function createSupabaseSelect(client) {
  return async function select({ table, columns, eq = {}, order = [], limit }) {
    let q = client.from(table).select(columns.join(','));
    for (const [column, value] of Object.entries(eq)) q = q.eq(column, value);
    for (const o of order) q = q.order(o.column, { ascending: o.ascending !== false });
    if (limit) q = q.limit(limit);
    const { data, error } = await q;
    if (error) throw new Error(`storefront: lectura de ${table} falló: ${error.message}`);
    return data ?? [];
  };
}
