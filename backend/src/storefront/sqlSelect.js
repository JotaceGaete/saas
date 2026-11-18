/**
 * Traduce una consulta de solo lectura del repositorio a SQL parametrizado.
 * Lo usan las pruebas de integración contra PostgreSQL. Los identificadores se validan
 * contra una lista blanca de forma; los valores van siempre como parámetros.
 */
const IDENT = /^[a-z_][a-z0-9_]*$/;

function ident(name) {
  if (typeof name !== 'string' || !IDENT.test(name)) throw new Error(`identificador inválido: ${name}`);
  return `"${name}"`;
}

export function buildSelectSql({ table, columns, eq = {}, order = [], limit }) {
  if (!Array.isArray(columns) || columns.length === 0) throw new Error('columns requeridas');
  const values = [];
  let text = `select ${columns.map(ident).join(', ')} from ${ident(table)}`;
  const where = Object.entries(eq).map(([column, value]) => {
    if (value === null || value === undefined) throw new Error(`eq nulo no soportado: ${column}`);
    values.push(value);
    return `${ident(column)} = $${values.length}`;
  });
  if (where.length) text += ` where ${where.join(' and ')}`;
  if (order.length) {
    text += ` order by ${order.map((o) => `${ident(o.column)} ${o.ascending === false ? 'desc' : 'asc'}`).join(', ')}`;
  }
  if (limit !== undefined && limit !== null) {
    values.push(Math.max(1, Math.floor(Number(limit))));
    text += ` limit $${values.length}`;
  }
  return { text, values };
}

/** Adaptador de select sobre cualquier función query(text, values) → { rows }. */
export function createPgSelect(query) {
  return async function select(spec) {
    const { text, values } = buildSelectSql(spec);
    const res = await query(text, values);
    return res.rows;
  };
}
