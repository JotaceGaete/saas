// Tratamiento tributario de productos (migración G, 20261104_fiscal_product_tax_category.sql)
// contra Postgres real (solo walinka_test). Nunca apunta a producción.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { assertLocalTestConfig } from '../../lib/store-pg.mjs';
import { CFG, makeFixture, setEmissionControl } from './fixtures.mjs';

let c;
let savedControl;
before(async () => {
  c = new pg.Client(assertLocalTestConfig(CFG));
  await c.connect();
  savedControl = (await c.query(`select enabled from fiscal.dte39_emission_control where singleton`)).rows[0]?.enabled ?? false;
  await setEmissionControl(c, true);
});
after(async () => { await setEmissionControl(c, savedControl); await c.end(); });

async function product(businessId, { name = 'Producto', price = 1190, tax = null } = {}) {
  const r = await c.query(
    `insert into public.wa_products (business_id, name, price, tax_treatment) values ($1, $2, $3, $4) returning id`,
    [businessId, name, price, tax]);
  return r.rows[0].id;
}

// Venta sin verificación manual del piloto: las categorías salen del producto o del negocio.
async function saleWith(lines, { defaultCategory = null } = {}) {
  const total = lines.reduce((a, l) => a + l.price * (l.qty ?? 1), 0);
  const f = await makeFixture(c, { taxVerified: false, total });
  await c.query(`delete from public.crm_invoice_items where invoice_id = $1`, [f.saleId]);
  await c.query(`update fiscal.issuers set default_tax_category = $2 where business_id = $1`, [f.businessId, defaultCategory]);
  let i = 0;
  for (const l of lines) {
    const productId = l.tax === 'manual' ? null : await product(f.businessId, { name: l.name ?? `P${i}`, price: l.price, tax: l.tax ?? null });
    await c.query(
      `insert into public.crm_invoice_items (invoice_id, product_id, name, unit_price, quantity, subtotal, sort_order)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [f.saleId, productId, l.name ?? `P${i}`, l.price, l.qty ?? 1, l.price * (l.qty ?? 1), i + 1]);
    i += 1;
  }
  return f;
}

const verified = async (f) => (await c.query(`select fiscal.sale_tax_lines_verified($1, $2) as v`, [f.businessId, f.saleId])).rows[0].v;
const context = async (f) => (await c.query(`select public.crm_fiscal_emission_context($1, $2) as x`, [f.businessId, f.saleId])).rows[0].x;
const claim = (f) => c.query(`select public.crm_fiscal_claim_with_credentials($1, $2, $3) as r`, [f.businessId, f.saleId, f.operationId]);

test('compatibilidad: productos existentes sin tratamiento y negocio sin categoría -> no se emite', async () => {
  const f = await saleWith([{ price: 2380 }]);
  assert.equal(await verified(f), false);
  await assert.rejects(claim(f), /FISCAL_TAX_LINES_NOT_VERIFIED/);
});

test('categoría por defecto del negocio cubre productos sin tratamiento y artículos manuales', async () => {
  const f = await saleWith([{ price: 1190 }, { price: 1190, tax: 'manual', name: 'Artículo manual' }], { defaultCategory: 'IVA_AFECTO_19' });
  assert.equal(await verified(f), true);
  const ctx = await context(f);
  assert.deepEqual(ctx.lines.map((l) => l.category), ['IVA_AFECTO_19', 'IVA_AFECTO_19']);
  const r = await claim(f);
  assert.equal(r.rows[0].r.claimed, true);
});

test('el producto manda sobre la categoría por defecto', async () => {
  const f = await saleWith([{ price: 1190, tax: 'EXENTO' }, { price: 1190 }], { defaultCategory: 'IVA_AFECTO_19' });
  const ctx = await context(f);
  assert.deepEqual(ctx.lines.map((l) => l.category), ['EXENTO', 'IVA_AFECTO_19']);
});

test('venta mixta (afecto + exento) no se reclama: la base exige todas afectas', async () => {
  const f = await saleWith([{ price: 1190, tax: 'IVA_AFECTO_19' }, { price: 1190, tax: 'EXENTO' }]);
  assert.equal(await verified(f), false);
  await assert.rejects(claim(f), /FISCAL_TAX_LINES_NOT_VERIFIED/);
  const n = await c.query(`select count(*)::int as n from public.crm_fiscal_issuances where sale_id = $1`, [f.saleId]);
  assert.equal(n.rows[0].n, 0);
});

test('venta con un producto no afecto o totalmente exenta no se reclama', async () => {
  for (const tax of ['NO_AFECTO', 'EXENTO']) {
    const f = await saleWith([{ price: 2380, tax }]);
    await assert.rejects(claim(f), /FISCAL_TAX_LINES_NOT_VERIFIED/);
  }
});

test('un producto de OTRO negocio no presta su categoría', async () => {
  const f = await saleWith([{ price: 2380 }]);
  const other = await makeFixture(c);
  const foreign = await product(other.businessId, { tax: 'IVA_AFECTO_19' });
  await c.query(`update public.crm_invoice_items set product_id = $2 where invoice_id = $1`, [f.saleId, foreign]);
  assert.equal(await verified(f), false);
});

test('la verificación manual del piloto sigue valiendo y tiene prioridad', async () => {
  const f = await makeFixture(c); // con verificación manual IVA_AFECTO_19 de su línea
  assert.equal(await verified(f), true);
  const ctx = await context(f);
  assert.equal(ctx.lines[0].category, 'IVA_AFECTO_19');
});

test('valores inválidos se rechazan en la base', async () => {
  const f = await makeFixture(c);
  await assert.rejects(product(f.businessId, { tax: 'IVA_10' }), /wa_products_tax_treatment_check/);
  await assert.rejects(c.query(`update fiscal.issuers set default_tax_category = 'OTRO' where business_id = $1`, [f.businessId]),
    /issuers_default_tax_category_check/);
});

test('cambiar el tratamiento de un producto queda auditado', async () => {
  const f = await makeFixture(c);
  const id = await product(f.businessId);
  await c.query(`update public.wa_products set tax_treatment = 'EXENTO' where id = $1`, [id]);
  await c.query(`update public.wa_products set name = 'Otro nombre' where id = $1`, [id]); // no audita
  const r = await c.query(
    `select outcome, detail->>'from' as f, detail->>'to' as t from fiscal.admin_audit
      where business_id = $1 and action = 'tax_product_set' and detail->>'product_id' = $2`, [f.businessId, id]);
  assert.deepEqual(r.rows, [{ outcome: 'EXENTO', f: null, t: 'EXENTO' }]);
});

test('categoría por defecto: RPC con auditoría; requiere emisor', async () => {
  const f = await makeFixture(c);
  await c.query(`select public.crm_fiscal_set_tax_default($1, $2, 'IVA_AFECTO_19')`, [f.businessId, f.userId]);
  const s = (await c.query(`select public.crm_fiscal_connection_status($1) as s`, [f.businessId])).rows[0].s;
  assert.equal(s.defaultTaxCategory, 'IVA_AFECTO_19');
  await assert.rejects(c.query(`select public.crm_fiscal_set_tax_default($1, $2, 'IVA_10')`, [f.businessId, f.userId]), /FISCAL_TAX_INVALID/);
  await assert.rejects(c.query(`select public.crm_fiscal_set_tax_default($1, $2, 'IVA_AFECTO_19')`, [randomUUID(), f.userId]), /FISCAL_CREDENTIALS_REQUIRED/);
  for (const role of ['anon', 'authenticated']) {
    const p = await c.query(`select has_function_privilege($1, 'public.crm_fiscal_set_tax_default(uuid,uuid,text)', 'execute') as ok`, [role]);
    assert.equal(p.rows[0].ok, false);
  }
});

test('emitir con categoría por defecto no cambia la numeración interna de la venta', async () => {
  const f = await saleWith([{ price: 2380 }], { defaultCategory: 'IVA_AFECTO_19' });
  const before = (await c.query(`select invoice_number from public.crm_invoices where id = $1`, [f.saleId])).rows[0].invoice_number;
  await claim(f);
  const after = (await c.query(`select invoice_number from public.crm_invoices where id = $1`, [f.saleId])).rows[0].invoice_number;
  assert.equal(after, before);
});
