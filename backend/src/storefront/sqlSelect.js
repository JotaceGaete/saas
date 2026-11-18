/**
 * Transporte de llamadas a funciones de solo lectura (RPC) del read model.
 * Producción: supabase.rpc con clave de servicio. Pruebas: SQL parametrizado contra PostgreSQL.
 * Los nombres de función y de argumento se validan con una lista de forma; los valores van como parámetros.
 */
const IDENT = /^[a-z_][a-z0-9_]*$/;

function ident(name) {
  if (typeof name !== 'string' || !IDENT.test(name)) throw new Error(`identificador inválido: ${name}`);
  return name;
}

/** Construye `select * from public.fn(arg => $1, ...)` con argumentos nombrados. */
export function buildRpcSql(fn, args = {}) {
  const names = Object.keys(args);
  const values = names.map((k) => args[k]);
  const list = names.map((k, i) => `${ident(k)} => $${i + 1}`).join(', ');
  return { text: `select * from public.${ident(fn)}(${list})`, values };
}

/** Transporte pg: query(text, values) → { rows }. */
export function createPgRpc(query) {
  return async function rpc(fn, args) {
    const { text, values } = buildRpcSql(fn, args);
    const res = await query(text, values);
    return res.rows;
  };
}

/** Transporte supabase-js: client.rpc(fn, args) → data. Clave de servicio en el backend. */
export function createSupabaseRpc(client) {
  return async function rpc(fn, args) {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw new Error(`storefront rpc ${fn} falló: ${error.message}`);
    return data ?? [];
  };
}
