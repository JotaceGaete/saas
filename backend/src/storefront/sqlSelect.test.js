import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRpcSql } from './sqlSelect.js';

test('RPC con argumentos nombrados y valores parametrizados', () => {
  const q = buildRpcSql('storefront_list_products', { p_business_id: 'b1', p_limit: 25, p_q: null });
  assert.equal(q.text, 'select * from public.storefront_list_products(p_business_id => $1, p_limit => $2, p_q => $3)');
  assert.deepEqual(q.values, ['b1', 25, null]);
});

test('rechaza nombres de función y de argumento no válidos', () => {
  assert.throws(() => buildRpcSql('x; drop table y', {}));
  assert.throws(() => buildRpcSql('ok', { 'p_a"--': 1 }));
});
