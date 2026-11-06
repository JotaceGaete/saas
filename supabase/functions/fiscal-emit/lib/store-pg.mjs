// Almacén Postgres del emisor (pruebas y uso con conexión directa). Usa las mismas RPC que el
// almacén de supabase-js, con `set local role service_role` dentro de cada transacción.
//
// GUARDA: createPgStore se niega a conectar salvo que la base sea local y se llame *_test.

import pg from 'pg';
import { mapActorRole, mapCredentialRecord, mapEmissionContext, mapIssuance, mapRpcError, mapStaleList } from './store-common.mjs';

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

    // Reclamo con credenciales en una sola transacción SQL (ver crm_fiscal_claim_with_credentials).
    async claimWithCredentials(businessId, saleId, operationId) {
      const raw = await scalar(
        `select public.crm_fiscal_claim_with_credentials($1, $2, $3) as j`, [businessId, saleId, operationId], 'j',
      );
      return {
        claimed: raw?.claimed === true,
        credentials: raw?.claimed === true ? mapCredentialRecord(raw.credentials) : null,
      };
    },

    async releaseClaim(businessId, saleId, operationId) {
      return Boolean(await scalar(
        `select public.crm_fiscal_release_claim($1, $2, $3) as ok`, [businessId, saleId, operationId], 'ok',
      ));
    },

    async finalize(businessId, saleId, operationId, out) {
      if (out.errorCode) {
        return Boolean(await scalar(
          `select public.crm_finalize_fiscal_issuance(p_business_id => $1, p_sale_id => $2, p_operation_id => $3, p_status => $4,
             p_folio => $5, p_xml_base64 => $6, p_pdf_base64 => $7, p_error_code => $8) as ok`,
          [businessId, saleId, operationId, out.status, out.folio ?? null, out.xmlBase64 ?? null, out.pdfBase64 ?? null, out.errorCode],
          'ok',
        ));
      }
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

    async loadActorRole(businessId, userId) {
      return mapActorRole(await scalar(
        `select public.crm_fiscal_actor_role($1, $2) as r`, [businessId, userId], 'r',
      ));
    },

    async storeReceipt(businessId, saleId, operationId, doc) {
      return Boolean(await scalar(
        `select public.crm_fiscal_store_receipt($1, $2, $3, $4, $5, $6) as ok`,
        [businessId, saleId, operationId, doc.folio, doc.xmlBase64, doc.pdfBase64], 'ok',
      ));
    },

    async hasRole(businessId, userId, role) {
      return Boolean(await scalar(
        `select public.crm_fiscal_has_role($1, $2, $3) as ok`, [businessId, userId, role], 'ok',
      ));
    },

    async appendAudit(entry) {
      return Boolean(await scalar(
        `select public.crm_fiscal_audit_append($1, $2, $3, $4, $5, $6::jsonb) as ok`,
        [entry.businessId, entry.saleId ?? null, entry.actorUserId ?? null, entry.action, entry.outcome,
         JSON.stringify(entry.detail ?? {})],
        'ok',
      ));
    },


    async recordSiiStatus(businessId, saleId, { siiStatus, source, trackId = null, detail = null, actorUserId = null }) {
      return scalar(
        `select public.crm_fiscal_record_sii_status($1, $2, $3, $4, $5, $6, $7) as j`,
        [businessId, saleId, siiStatus, source, trackId, detail, actorUserId], 'j',
      );
    },

    async listStaleSending(before) {
      return mapStaleList(await scalar(
        `select public.crm_fiscal_list_stale_sending($1) as j`, [before.toISOString()], 'j',
      ));
    },

    async finalizeFromReceipt(businessId, saleId, operationId) {
      return Boolean(await scalar(
        `select public.crm_fiscal_finalize_from_receipt($1, $2, $3) as ok`,
        [businessId, saleId, operationId], 'ok',
      ));
    },

    async markStaleUnknown(businessId, saleId, operationId, before) {
      return Boolean(await scalar(
        `select public.crm_fiscal_mark_stale_unknown($1, $2, $3, $4) as ok`,
        [businessId, saleId, operationId, before.toISOString()], 'ok',
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

    // Reconciliación administrativa atómica: rol, revisor, evidencia y auditoría en una transacción.
    async reconcileAdmin(businessId, saleId, operationId, actorUserId, ev) {
      return Boolean(await scalar(
        `select public.crm_fiscal_reconcile_admin($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) as ok`,
        [businessId, saleId, operationId, actorUserId, ev.reviewerUserId, ev.outcome, ev.folio ?? null,
         ev.xmlBase64 ?? null, ev.pdfBase64 ?? null, ev.reviewer, ev.reason, ev.evidenceReference,
         ev.providerStatus, ev.checkedAt],
        'ok',
      ));
    },
  };
}

