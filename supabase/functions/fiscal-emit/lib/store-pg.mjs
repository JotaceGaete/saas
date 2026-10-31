// Almacén Postgres del emisor (pruebas y uso con conexión directa). Usa las mismas RPC que el
// almacén de supabase-js, con `set local role service_role` dentro de cada transacción.
//
// GUARDA: createPgStore se niega a conectar salvo que la base sea local y se llame *_test.

import pg from 'pg';
import { mapCredentialRecord, mapEmissionContext, mapIssuance, mapRpcError } from './store-common.mjs';

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
      throw mapRpcError(err);
    } finally {
      client.release();
    }
  }

  const scalar = async (sql, params, col) => {
    const r = await run((c) => c.query(sql, params));
    return r.rows[0]?.[col] ?? null;
  };

  return {
    end: () => pool.end(),

    async loadSaleById(saleId) {
      const r = (await run((c) => c.query(
        `select id, business_id, status, paid_at, total, discount_amount
           from public.crm_invoices where id = $1`,
        [saleId],
      ))).rows[0];
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
      const r = (await run((c) => c.query(
        `select id, user_id, country_code from public.wa_businesses where id = $1`, [businessId],
      ))).rows[0];
      return r && { id: r.id, userId: r.user_id, countryCode: r.country_code };
    },

    async getIssuance(businessId, saleId) {
      return mapIssuance(await scalar(
        `select public.crm_fiscal_get_issuance($1, $2) as j`, [businessId, saleId], 'j',
      ));
    },

    async loadEmissionContext(businessId, saleId) {
      return mapEmissionContext(await scalar(
        `select public.crm_fiscal_emission_context($1, $2) as j`, [businessId, saleId], 'j',
      ));
    },

    async loadCredentialRecord(businessId) {
      return mapCredentialRecord(await scalar(
        `select public.crm_fiscal_get_credentials($1) as j`, [businessId], 'j',
      ));
    },

    async claim(businessId, saleId, operationId) {
      return Boolean(await scalar(
        `select public.crm_claim_fiscal_issuance($1, $2, $3, 39) as ok`, [businessId, saleId, operationId], 'ok',
      ));
    },

    async finalize(businessId, saleId, operationId, out) {
      return Boolean(await scalar(
        `select public.crm_finalize_fiscal_issuance($1, $2, $3, $4, $5, $6, $7) as ok`,
        [businessId, saleId, operationId, out.status, out.folio ?? null, out.xmlBase64 ?? null, out.pdfBase64 ?? null],
        'ok',
      ));
    },

    async markFailed(businessId, saleId, operationId, errorCode) {
      return Boolean(await scalar(
        `select public.crm_fiscal_mark_failed($1, $2, $3, $4) as ok`,
        [businessId, saleId, operationId, errorCode], 'ok',
      ));
    },

    async reconcileWithEvidence(businessId, saleId, operationId, ev) {
      return Boolean(await scalar(
        `select public.crm_fiscal_reconcile_with_evidence($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) as ok`,
        [businessId, saleId, operationId, ev.outcome, ev.folio ?? null, ev.xmlBase64 ?? null, ev.pdfBase64 ?? null,
         ev.reviewer, ev.reason, ev.evidenceReference, ev.providerStatus, ev.checkedAt],
        'ok',
      ));
    },
  };
}

