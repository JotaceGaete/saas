// Preload de pruebas de base de datos. Lee PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE.
// Uso: node --import ./backend/src/storefront/ci/preload-pg.mjs --test ...
import pg from 'pg';

// numeric llega como texto por defecto; la API espera número (PostgREST devuelve número).
pg.types.setTypeParser(1700, (v) => parseFloat(v));

const pool = new pg.Pool({ max: 4 });
globalThis.__WALINKA_PG_QUERY__ = (text, values) => pool.query(text, values);
globalThis.__WALINKA_PG_POOL_END__ = () => pool.end();
globalThis.__WALINKA_PG_POOL__ = pool;
