// Fixtures para las pruebas contra Postgres (solo walinka_test). Todos los ids son aleatorios
// para que las pruebas no se pisen entre sí.
import { randomBytes, randomUUID, randomInt } from 'node:crypto';
import { seal } from '../../lib/secrets.mjs';
import { operationIdFor } from '../../lib/emit.mjs';

export const TEST_MASTER_KEY = randomBytes(32);

export const CFG = Object.freeze({
  host: process.env.FISCAL_TEST_PG_HOST ?? '/home/pgtest/pg/sock',
  port: Number(process.env.FISCAL_TEST_PG_PORT ?? 5544),
  user: process.env.FISCAL_TEST_PG_USER ?? 'postgres',
  database: process.env.FISCAL_TEST_PG_DB ?? 'walinka_test',
});

export async function setEmissionControl(c, enabled) {
  await c.query(
    `insert into fiscal.dte39_emission_control (singleton, enabled, payment_voucher_policy_approved)
     values (true, $1, true)
     on conflict (singleton) do update set enabled = excluded.enabled`,
    [enabled],
  );
}

async function ensureCashSession(c, businessId, userId) {
  const id = randomUUID();
  await c.query(
    `insert into public.crm_cash_sessions (id, business_id, date, opened_at, status, opened_by)
     values ($1, $2, current_date, now(), 'open', $3)`,
    [id, businessId, userId],
  );
  return id;
}

// Crea un comercio + venta pagada con una línea verificada y pagos según opciones.
export async function makeFixture(c, opts = {}) {
  const o = {
    cash: true,
    point: false,
    status: 'pagada',
    paid: true,
    issuerEnabled: true,
    issuerVerified: true,
    taxVerified: true,
    discount: 0,
    total: 2380,
    withCredentials: true,
    ...opts,
  };
  const businessId = randomUUID();
  const userId = randomUUID();
  const saleId = randomUUID();

  await c.query(`insert into auth.users (id, email) values ($1, $2)`, [userId, `t-${userId}@test.local`]);
  await c.query(
    `insert into public.wa_businesses (id, user_id, name, whatsapp, country_code, currency)
     values ($1, $2, 'Negocio prueba', '+56900000000', 'CL', 'CLP')`,
    [businessId, userId],
  );
  await c.query(
    `insert into fiscal.issuers (business_id, issuer_rut, provider, enabled, verified)
     values ($1, '76123456-7', 'dtecore', $2, $3)`,
    [businessId, o.issuerEnabled, o.issuerVerified],
  );
  if (o.withCredentials) {
    const rec = seal({ apiKey: `TEST-API-KEY-${businessId}` }, { key: TEST_MASTER_KEY, businessId });
    await c.query(
      `insert into fiscal.business_credentials (business_id, provider, key_version, ciphertext, iv, auth_tag)
       values ($1, 'dtecore', 1, $2, $3, $4)`,
      [businessId, rec.ciphertext, rec.iv, rec.authTag],
    );
  }
  await c.query(
    `insert into public.crm_invoices (id, business_id, invoice_number, status, paid_at, total, subtotal, discount_amount)
     values ($1, $2, $3, $4, $5, $6, $6, $7)`,
    [saleId, businessId, randomInt(1, 2_000_000_000), o.status, o.paid ? new Date() : null, o.total, o.discount],
  );
  const item = await c.query(
    `insert into public.crm_invoice_items (invoice_id, name, unit_price, quantity, subtotal, sort_order)
     values ($1, 'Café', 1190, 2, $2, 1) returning id`,
    [saleId, o.total],
  );
  const itemId = item.rows[0].id;
  if (o.taxVerified) {
    await c.query(
      `insert into fiscal.line_tax_verifications
         (business_id, sale_id, invoice_item_id, category, verified, evidence, verified_at, line_fingerprint)
       select $1, $2, i.id, 'IVA_AFECTO_19', true, 'Verificado por contador, prueba', now(),
              md5(jsonb_build_array(i.product_id, i.name, i.description, i.unit_price, i.quantity,
                    i.discount_pct, i.subtotal, i.sort_order, i.discount_type)::text)
         from public.crm_invoice_items i where i.id = $3`,
      [businessId, saleId, itemId],
    );
  }
  if (o.cash) {
    await c.query(
      `insert into public.crm_payments (business_id, invoice_id, amount, payment_method, payment_status, payment_number)
       values ($1, $2, $3, 'cash', 'received', 1)`,
      [businessId, saleId, o.total],
    );
  }
  if (o.point) {
    // Cobro Point real: payment_method = 'mercado_pago' (verificado en producción, solo lectura).
    await c.query(
      `insert into public.crm_payments (business_id, invoice_id, amount, payment_method, payment_status, payment_number)
       values ($1, $2, $3, 'mercado_pago', 'received', 2)`,
      [businessId, saleId, o.total],
    );
  }
  if (o.otherMethod) {
    await c.query(
      `insert into public.crm_payments (business_id, invoice_id, amount, payment_method, payment_status, payment_number)
       values ($1, $2, $3, $4, 'received', 3)`,
      [businessId, saleId, o.total, o.otherMethod],
    );
  }
  if (o.point) {
    const session = await ensureCashSession(c, businessId, userId);
    await c.query(
      `insert into public.crm_pos_point_operations
         (business_id, created_by, cash_session_id, terminal_id, external_reference, create_idempotency_key,
          sale_idempotency_key, sale_snapshot, amount, currency, mp_status, mp_order_id, mp_payment_id,
          finalized_at, crm_invoice_id)
       values ($1, $2, $3, 'T1', $4, $5, $6, '{}'::jsonb, $7, 'CLP', 'processed', 'ORD-' || $4, 'PAY-' || $4,
               now(), $8)`,
      [businessId, userId, session, randomUUID(), randomUUID(), `sk-${saleId}`, o.total, saleId],
    );
  }

  return {
    businessId,
    userId,
    saleId,
    itemId,
    operationId: operationIdFor(businessId, saleId),
  };
}

export async function otherUser(c) {
  const id = randomUUID();
  await c.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `o-${id}@test.local`]);
  return id;
}
