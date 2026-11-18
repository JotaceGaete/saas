// Carga los datos de paridad en la base indicada en PGDATABASE (variables PG* estándar).
// Uso: PGDATABASE=<base> node seed.mjs
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(readFileSync(join(here, '..', '__fixtures__', 'parity-seed.json'), 'utf8'));

const client = new pg.Client();
await client.connect();

const insert = async (table, rows) => {
  for (const row of rows) {
    const cols = Object.keys(row);
    const values = cols.map((k) => (row[k] !== null && typeof row[k] === 'object' ? JSON.stringify(row[k]) : row[k]));
    const names = cols.map((c) => `"${c}"`).join(',');
    const params = cols.map((_, i) => `$${i + 1}`).join(',');
    await client.query(`insert into ${table} (${names}) values (${params})`, values);
  }
};

try {
  await insert('wa_businesses', seed.businesses);
  await insert('wa_business_categories', seed.categories);
  await insert('wa_products', seed.products);
  console.log(`seed: ${seed.businesses.length} tiendas, ${seed.categories.length} categorías, ${seed.products.length} productos`);
} finally {
  await client.end();
}
