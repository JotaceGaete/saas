// Compara el orden de PostgreSQL con collation "es-CL-x-icu" frente a Intl.Collator('es-CL').
// Si difieren, la paginación keyset del catálogo (cliente vs servidor) pierde consistencia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const NAMES = [
  'Cafe', 'café', 'CAFE', 'Café con leche', 'cafe-doble', 'Cafe 2', 'Cafe10', 'Cafe 10',
  'pastel', 'Pastél', 'Pastel de choclo', 'Ñoquis', 'Nube', 'Ñu', 'Zapallo', 'alfajor',
  'Alfajor de maicena', 'ÁRBOL', 'arbol', 'Empanada de pino', 'empanada de queso',
  'Hamburguesa', 'hamburguesa XL', 'Helado 1/2 litro', 'Helado 1 litro', 'Jugo natural',
];

const expected = [...NAMES].sort((a, b) => {
  const c = new Intl.Collator('es-CL').compare(a, b);
  return c !== 0 ? c : (a < b ? -1 : a > b ? 1 : 0);
});

test('collation es-CL-x-icu en PostgreSQL coincide con Intl.Collator es-CL', async () => {
  const client = new pg.Client();
  await client.connect();
  try {
    const { rows } = await client.query(
      `select n from unnest($1::text[]) as n
       order by n collate "es-CL-x-icu", n collate "C"`,
      [NAMES],
    );
    assert.deepEqual(rows.map((r) => r.n), expected);
  } finally {
    await client.end();
  }
});
