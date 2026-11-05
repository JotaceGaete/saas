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

// Migración H: verificar identidad, aprobar y emitir exigen que el contrato de identidad de DTE
// Core esté marcado como verificado. En las pruebas se marca (proveedor simulado); en producción
// nace en false.
export async function setEmissionControl(c, enabled, identityContractVerified = true) {
  await c.query(
    `insert into fiscal.dte39_emission_control (singleton, enabled, payment_voucher_policy_approved,
                                                identity_contract_verified)
     values (true, $1, true, $2)
     on conflict (singleton) do update set enabled = excluded.enabled,
                                           identity_contract_verified = excluded.identity_contract_verified`,
    [enabled, identityContractVerified],
  );
}

export async function ensureIdentityContract(c, verified = true) {
  await c.query(
    `insert into fiscal.dte39_emission_control (singleton, enabled, payment_voucher_policy_approved, identity_contract_verified)
     values (true, false, true, $1)
     on conflict (singleton) do update set identity_contract_verified = excluded.identity_contract_verified`,
    [verified],
  );
}

// RUT válido (dígito verificador módulo 11) y distinto en cada llamada: la migración H impide que
// dos comercios independientes compartan RUT.
export function rutDv(body) {
  let sum = 0;
  let mul = 2;
  const digits = String(body);
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    sum += Number(digits[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const r = 11 - (sum % 11);
  return r === 11 ? '0' : r === 10 ? 'K' : String(r);
}
export function uniqueRut() {
  const body = randomInt(10_000_000, 99_999_999);
  return `${body}-${rutDv(body)}`;
}

// Verificación vigente sembrada directamente (como postgres, sin fila de auditoría) para que las
// pruebas previas a H no cambien sus conteos de fiscal.admin_audit.
export async function seedIdentity(c, businessId, actorUserId) {
  await c.query(
    `insert into fiscal.identity_checks (business_id, provider, key_version, credential_fp, expected_rut,
                                         observed_rut, outcome, actor_user_id, detail)
     select c.business_id, c.provider, c.key_version, fiscal.credential_fp(c.business_id), i.issuer_rut,
            i.issuer_rut, 'match', $2, '{"seeded": true}'::jsonb
       from fiscal.business_credentials c join fiscal.issuers i on i.business_id = c.business_id
      where c.business_id = $1`,
    [businessId, actorUserId],
  );
}

// RUT informado por el proveedor (simulado) registrado vía RPC; ninguna llamada real.
export async function verifyIdentity(c, businessId, actorUserId, observedRut) {
  const r = await c.query(
    `select public.crm_fiscal_record_identity_check($1, $2, $3, '{"simulated": true}'::jsonb) as res`,
    [businessId, actorUserId, observedRut],
  );
  return r.rows[0].res;
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
    issuerRut: null,
    identityVerified: true,
    ...opts,
  };
  o.issuerRut = o.issuerRut ?? uniqueRut();
  if (o.issuerVerified && !(o.withCredentials && o.identityVerified)) {
    throw new Error('fixture: un emisor aprobado exige credenciales con identidad verificada (migración H)');
  }
  const businessId = randomUUID();
  const userId = randomUUID();
  const saleId = randomUUID();

  await c.query(`insert into auth.users (id, email) values ($1, $2)`, [userId, `t-${userId}@test.local`]);
  await c.query(
    `insert into public.wa_businesses (id, user_id, name, whatsapp, country_code, currency)
     values ($1, $2, 'Negocio prueba', '+56900000000', 'CL', 'CLP')`,
    [businessId, userId],
  );
  // Credenciales antes que el emisor: guardar o cambiar la API key devuelve la solicitud a
  // revisión (migración F); un emisor verificado es uno aprobado por Walinka.
  if (o.withCredentials) {
    const rec = seal({ apiKey: `TEST-API-KEY-${businessId}` }, { key: TEST_MASTER_KEY, businessId });
    await c.query(
      `insert into fiscal.business_credentials (business_id, provider, key_version, ciphertext, iv, auth_tag)
       values ($1, 'dtecore', 1, $2, $3, $4)`,
      [businessId, rec.ciphertext, rec.iv, rec.authTag],
    );
  }
  await c.query(
    `insert into fiscal.issuers (business_id, issuer_rut, provider, enabled, verified, sucursal_nombre, sucursal_codigo,
                                 review_status, resolucion_numero, resolucion_fecha)
     values ($1, $4, 'dtecore', $2, $3, 'SUCURSAL DE PRUEBA', '1',
             case when $3::boolean then 'approved' else 'draft' end, 80, date '2014-08-22')`,
    [businessId, false, false, o.issuerRut],
  );
  // Migración H: aprobar exige identidad verificada, así que se verifica antes de aprobar.
  if (o.withCredentials && o.identityVerified) {
    await ensureIdentityContract(c);
    await seedIdentity(c, businessId, userId);
  }
  if (o.issuerEnabled || o.issuerVerified) {
    await c.query(
      `update fiscal.issuers set enabled = $2, verified = $3,
              review_status = case when $3::boolean then 'approved' else 'draft' end where business_id = $1`,
      [businessId, o.issuerEnabled, o.issuerVerified],
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
    issuerRut: o.issuerRut,
  };
}

export async function otherUser(c) {
  const id = randomUUID();
  await c.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `o-${id}@test.local`]);
  return id;
}
