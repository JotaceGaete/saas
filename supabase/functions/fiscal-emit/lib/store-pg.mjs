// Almacén Postgres del emisor. Solo lee/escribe mediante las RPC del ledger y SELECT puntuales.
// Cada operación de escritura usa `set local role service_role` dentro de su transacción,
// igual que el emisor desplegado con la service key.
//
// GUARDA: createPgStore se niega a conectar salvo que la base sea local y se llame *_test.
// Nunca apunta a producción; no hay forma de desactivar la guarda desde código de test.

import pg from 'pg';
import { FiscalError } from './errors.mjs';

const LOCAL_HOSTS = new Set(['', 'localhost', '127.0.0.1', '::1']);

export function assertLocalTestConfig(cfg) {
  const host = cfg.host ?? '';
  const isSocket = typeof host === 'string' && host.startsWith('/');
  if (!isSocket && !LOCAL_HOSTS.has(host)) {
    throw new Error('REFUSED: non-local database host');
  }
  if (!/_test$/.test(String(cfg.database ?? ''))) {
    throw new Error('REFUSED: database name must end with _test');
  }
  return cfg;
}

// Los RPC lanzan 'FISCAL_<CODIGO>' (guardas del ledger) o 'Invalid fiscal ...' (argumentos).
function mapDbError(err) {
  const msg = err?.message ?? '';
  const m = /FISCAL_[A-Z_]+/.exec(msg);
  if (m) return new FiscalError(m[0], msg);
  if (/^Invalid fiscal/.test(msg)) return new FiscalError('INVALID_FISCAL_ARGUMENT', msg);
  return err;
}

export function createPgStore(cfg) {
  const pool = new pg.Pool({ max: 10, ...assertLocalTestConfig(cfg) });

  async function run(fn) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('set local role service_role');
      const out = await fn(client);
      await client.query('commit');
      return out;
    } catch (err) {
      await client.query('rollback').catch(() => {});
      throw mapDbError(err);
    } finally {
      client.release();
    }
  }

  const one = async (sql, params) => (await run((c) => c.query(sql, params))).rows[0] ?? null;
  const rows = async (sql, params) => (await run((c) => c.query(sql, params))).rows;

  return {
    end: () => pool.end(),

    async loadSaleById(saleId) {
      const r = await one(
        `select id, business_id, status, paid_at, total, discount_amount
           from public.crm_invoices where id = $1`,
        [saleId],
      );
      return r && {
        id: r.id,
        businessId: r.business_id,
        status: r.status,
        paidAt: r.paid_at,
        total: Number(r.total),
        discountAmount: Number(r.discount_amount ?? 0),
      };
    },

    async loadBusiness(businessId) {
      const r = await one(`select id, user_id, country_code from public.wa_businesses where id = $1`, [businessId]);
      return r && { id: r.id, userId: r.user_id, countryCode: r.country_code };
    },

    async getIssuance(businessId, saleId) {
      const r = await one(
        `select id, status, folio, pdf_base64 from public.crm_fiscal_issuances
          where business_id = $1 and sale_id = $2 and dte_type = 39`,
        [businessId, saleId],
      );
      return r && { id: r.id, status: r.status, folio: r.folio, pdfBase64: r.pdf_base64 };
    },

    async loadIssuer(businessId) {
      const r = await one(
        `select issuer_rut, enabled, verified from fiscal.issuers where business_id = $1`,
        [businessId],
      );
      return r && { issuerRut: r.issuer_rut, enabled: r.enabled, verified: r.verified };
    },

    async loadEmissionEnabled() {
      const r = await one(
        `select exists(select 1 from fiscal.dte39_emission_control where singleton and enabled) as ok`,
        [],
      );
      return Boolean(r?.ok);
    },

    async taxLinesVerified(businessId, saleId) {
      const r = await one(`select fiscal.sale_tax_lines_verified($1, $2) as ok`, [businessId, saleId]);
      return Boolean(r?.ok);
    },

    async loadLines(saleId) {
      const rs = await rows(
        `select i.id, i.name, i.unit_price, i.quantity, i.discount_pct, t.category
           from public.crm_invoice_items i
           left join lateral (
             select category from fiscal.line_tax_verifications v
              where v.invoice_item_id = i.id and v.verified is true
              order by v.created_at desc limit 1
           ) t on true
          where i.invoice_id = $1
          order by i.sort_order nulls last, i.id`,
        [saleId],
      );
      return rs.map((r) => ({
        id: r.id,
        name: r.name,
        unitPrice: Number(r.unit_price),
        quantity: Number(r.quantity),
        discountPct: Number(r.discount_pct ?? 0),
        category: r.category ?? null,
      }));
    },

    async loadPayments(saleId) {
      const rs = await rows(
        `select payment_method, amount, payment_status, voided_at
           from public.crm_payments where invoice_id = $1`,
        [saleId],
      );
      return rs.map((r) => ({
        method: r.payment_method,
        amount: Number(r.amount),
        status: r.payment_status,
        voided: r.voided_at != null,
      }));
    },

    async loadPointOps(businessId, saleId) {
      const rs = await rows(
        `select mp_status, mp_order_id, mp_payment_id, finalized_at, currency, amount
           from public.crm_pos_point_operations
          where business_id = $1 and crm_invoice_id = $2`,
        [businessId, saleId],
      );
      return rs.map((r) => ({
        mpStatus: r.mp_status,
        mpOrderId: r.mp_order_id,
        mpPaymentId: r.mp_payment_id,
        finalizedAt: r.finalized_at,
        currency: r.currency,
        amount: Number(r.amount),
      }));
    },

    async loadCredentialRecord(businessId) {
      const r = await one(
        `select provider, key_version, ciphertext, iv, auth_tag
           from fiscal.business_credentials where business_id = $1`,
        [businessId],
      );
      return r && {
        provider: r.provider,
        keyVersion: r.key_version,
        ciphertext: r.ciphertext,
        iv: r.iv,
        authTag: r.auth_tag,
      };
    },

    async claim(businessId, saleId, operationId) {
      const r = await one(`select public.crm_claim_fiscal_issuance($1, $2, $3, 39) as ok`, [
        businessId,
        saleId,
        operationId,
      ]);
      return Boolean(r?.ok);
    },

    async finalize(businessId, saleId, operationId, out) {
      const r = await one(
        `select public.crm_finalize_fiscal_issuance($1, $2, $3, $4, $5, $6, $7) as ok`,
        [businessId, saleId, operationId, out.status, out.folio ?? null, out.xmlBase64 ?? null, out.pdfBase64 ?? null],
      );
      return Boolean(r?.ok);
    },

    async markFailed(businessId, saleId, operationId, errorCode) {
      const r = await one(`select public.crm_fiscal_mark_failed($1, $2, $3, $4) as ok`, [
        businessId,
        saleId,
        operationId,
        errorCode,
      ]);
      return Boolean(r?.ok);
    },

    async reconcile(businessId, saleId, operationId, ev) {
      const r = await one(
        `select public.crm_reconcile_fiscal_issuance($1, $2, $3, $4, $5, $6) as ok`,
        [businessId, saleId, operationId, ev.folio, ev.xmlBase64, ev.pdfBase64],
      );
      return Boolean(r?.ok);
    },
  };
}
