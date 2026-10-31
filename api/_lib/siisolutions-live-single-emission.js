// Server-only, single-use manual DTE 39 emission against the PRODUCTION host.
// Not reachable by HTTP. Invoked only by a trusted operator script with the
// service-role client. Disabled unless every gate below passes; the gate is
// NOT armed in any environment by this change.
//
// Never touches fiscal.pos_dte39_outbox, fiscal.operations or
// crm_point_fiscal_outbox. Never calls crm_fiscal_register_pending.
import { normalizeCrmFiscalSale } from './siisolutions-crm-bridge.js';
import { assessBoletaEligibility } from './siisolutions-payment-eligibility.js';
import { buildBoletaPayload, SII_BASE_URL, SII_EMISSION_PATHS } from './siisolutions-adapter.js';
import { operationIdForSale } from './siisolutions-issuance-state.js';
import { normalizeDteCoreIssuanceResponse } from './siisolutions-dtecore-response.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRODUCTION_ORIGIN = SII_BASE_URL; // fixed; never read from the environment
const SEND_TIMEOUT_MS = 15000;
const DOCS_TIMEOUT_MS = 12000;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Content check for provider bytes before any `issued` state. Fail-closed:
 * the XML must decode to a DTE whose <Folio> equals the assigned folio, and
 * the PDF must start with the %PDF- signature. Does not prove SII acceptance.
 */
export function validateDocumentBytes({ folio, xmlBase64, pdfBase64 }) {
  if (typeof xmlBase64 !== 'string' || typeof pdfBase64 !== 'string' ||
      xmlBase64.length % 4 !== 0 || pdfBase64.length % 4 !== 0 ||
      !BASE64.test(xmlBase64) || !BASE64.test(pdfBase64)) return false;
  const xml = Buffer.from(xmlBase64, 'base64').toString('latin1');
  const pdf = Buffer.from(pdfBase64, 'base64');
  if (!xml.includes('<DTE') || !xml.includes('</DTE>')) return false;
  const folioMatch = xml.match(/<Folio>\s*(\d+)\s*<\/Folio>/);
  if (!folioMatch || Number(folioMatch[1]) !== folio) return false;
  return pdf.subarray(0, 5).toString('latin1') === '%PDF-';
}

const safeFolio = value => (Number.isSafeInteger(value) && value > 0 ? value : null);

/**
 * Pure mapping from one provider outcome to a ledger state. Only `issued` when
 * XML and PDF bytes are present (inline or retrieved and matching the folio).
 * Any ambiguity is `unknown`, with the folio kept when the provider assigned one.
 */
export function classifyLiveIssuance({
  networkError = false, statusCode, body = null, retrievedDocuments = null,
}) {
  if (networkError || !Number.isInteger(statusCode) || statusCode >= 500) {
    return { state: 'unknown', folio: null, reason: 'PROVIDER_OUTCOME_UNKNOWN' };
  }
  if (statusCode === 409) {
    return { state: 'unknown', folio: safeFolio(body?.folioExistente), reason: 'PROVIDER_OPERATION_ALREADY_EXISTS' };
  }
  if (statusCode < 200 || statusCode >= 300) {
    return { state: 'unknown', folio: null, reason: 'PROVIDER_REJECTED_UNVERIFIED' };
  }
  let normalized;
  try {
    normalized = normalizeDteCoreIssuanceResponse(body, { expectedSimulation: false });
  } catch (error) {
    const reason = /environment mismatch/.test(error.message) ? 'ENVIRONMENT_MISMATCH' : 'RESPONSE_INVALID';
    return { state: 'unknown', folio: safeFolio(body?.folio), reason };
  }
  const folio = normalized.folio;
  const inlineXml = typeof body.xmlBase64 === 'string' && body.xmlBase64.length > 0 ? body.xmlBase64 : null;
  const inlinePdf = typeof body.pdfBase64 === 'string' && body.pdfBase64.length > 0 ? body.pdfBase64 : null;
  if (inlineXml && inlinePdf) {
    if (validateDocumentBytes({ folio, xmlBase64: inlineXml, pdfBase64: inlinePdf })) {
      return { state: 'issued', folio, xmlBase64: inlineXml, pdfBase64: inlinePdf };
    }
    return { state: 'unknown', folio, reason: 'DOCUMENT_BYTES_INVALID' };
  }
  if (retrievedDocuments && retrievedDocuments.folio === folio &&
      validateDocumentBytes({ folio, xmlBase64: retrievedDocuments.xmlBase64, pdfBase64: retrievedDocuments.pdfBase64 })) {
    return { state: 'issued', folio, xmlBase64: retrievedDocuments.xmlBase64, pdfBase64: retrievedDocuments.pdfBase64 };
  }
  return { state: 'unknown', folio, reason: 'FOLIO_ASSIGNED_DOCUMENTS_NOT_RETRIEVED' };
}

function armedGate(env, { businessId, saleId }) {
  return env.SIISOLUTIONS_LIVE_SINGLE_EMISSION === 'armed' &&
    env.SIISOLUTIONS_LIVE_SINGLE_BUSINESS_ID === businessId &&
    env.SIISOLUTIONS_LIVE_SINGLE_SALE_ID === saleId;
}

function loadVerifiedIssuer(env, businessId) {
  let records;
  try {
    records = JSON.parse(env.SIISOLUTIONS_PILOT_ISSUERS_JSON || '');
  } catch {
    return null;
  }
  const record = records && Object.hasOwn(records, businessId) ? records[businessId] : null;
  if (!record || record.verified !== true ||
      typeof record.operator_rut !== 'string' || !/^\d{7,8}-[0-9Kk]$/.test(record.operator_rut) ||
      typeof record.api_key !== 'string' || !record.api_key.trim()) return null;
  return { operatorRut: record.operator_rut, apiKey: record.api_key };
}

/**
 * Creates the single-use emission function. `admin` must be a service-role
 * Supabase client. `retrieveDocuments` is optional and must be injected only
 * after the DTECore document envelope is verified against the OpenAPI.
 */
export function createLiveSingleEmission({
  admin, env = process.env, fetchImpl = fetch, retrieveDocuments = null,
}) {
  if (!admin?.from || !admin?.rpc) throw new Error('Trusted service-role client required');
  return async function issueLiveSingleBoleta({ businessId, saleId, authorizationId, amount }) {
    if (![businessId, saleId, authorizationId].every(v => typeof v === 'string' && UUID.test(v))) {
      return { state: 'blocked', reason: 'IDENTITY_REQUIRED' };
    }
    if (!Number.isSafeInteger(amount) || amount <= 0) return { state: 'blocked', reason: 'AMOUNT_REQUIRED' };
    if (!armedGate(env, { businessId, saleId })) return { state: 'blocked', reason: 'LIVE_NOT_ARMED' };

    const issuer = loadVerifiedIssuer(env, businessId);
    if (!issuer) return { state: 'blocked', reason: 'ISSUER_NOT_AUTHORIZED' };

    const [invoiceRes, itemsRes, paymentsRes, businessRes] = await Promise.all([
      admin.from('crm_invoices').select('*').eq('id', saleId).eq('business_id', businessId).maybeSingle(),
      admin.from('crm_invoice_items').select('*').eq('invoice_id', saleId),
      admin.from('crm_payments').select('*').eq('invoice_id', saleId).eq('business_id', businessId),
      admin.from('wa_businesses').select('id,user_id,currency,country_code').eq('id', businessId).maybeSingle(),
    ]);
    if (invoiceRes.error || !invoiceRes.data) return { state: 'blocked', reason: 'INVOICE_NOT_FOUND' };
    if (itemsRes.error || paymentsRes.error || businessRes.error) return { state: 'blocked', reason: 'SALE_READ_FAILED' };
    if (businessRes.data?.country_code !== 'CL' || businessRes.data?.currency !== 'CLP') {
      return { state: 'blocked', reason: 'BUSINESS_UNSUPPORTED' };
    }
    const invoice = invoiceRes.data;
    if (Number(invoice.total) !== amount) return { state: 'blocked', reason: 'AMOUNT_MISMATCH' };

    const normalized = normalizeCrmFiscalSale({
      invoice: { ...invoice, currency: 'CLP' }, items: itemsRes.data, payments: paymentsRes.data,
    });
    if (!normalized.ready) return { state: 'blocked', reason: normalized.reason };
    if (normalized.payment.method !== 'cash') return { state: 'blocked', reason: 'CASH_ONLY' };

    const received = (paymentsRes.data || []).filter(p =>
      p.payment_status === 'received' && !p.voided_at && p.payment_method === 'cash');
    if (received.length !== 1) return { state: 'blocked', reason: 'CASH_RECEIPT_NOT_VERIFIED' };
    // Receipt must have been recorded by the business owner, not by a client flag.
    if (!businessRes.data.user_id || received[0].created_by !== businessRes.data.user_id) {
      return { state: 'blocked', reason: 'CASH_RECEIPT_NOT_VERIFIED' };
    }

    const check = assessBoletaEligibility({
      sale: normalized.sale,
      payment: { ...normalized.payment, received_by_cashier: true },
      businessId, issuerBusinessId: businessId,
    });
    if (!check.eligible) return { state: 'blocked', reason: check.reason };

    const operationId = operationIdForSale(businessId, saleId);
    // Build and validate the full payload BEFORE consuming the authorization.
    const payload = buildBoletaPayload({
      id: operationId, operatorRut: issuer.operatorRut, total: normalized.sale.total,
      paymentMethod: check.method, items: normalized.sale.items,
    });

    // Atomic: claim + consume. If this does not return true, nothing is sent.
    // A thrown error here is ambiguous (the commit may have happened), so we stop.
    let began;
    try {
      const { data, error } = await admin.rpc('crm_begin_manual_single_emission', {
        p_authorization_id: authorizationId, p_business_id: businessId,
        p_sale_id: saleId, p_amount: amount, p_operation_id: operationId,
      });
      began = !error && data === true;
    } catch {
      return { state: 'blocked', reason: 'BEGIN_OUTCOME_UNKNOWN', operationId };
    }
    if (!began) return { state: 'blocked', reason: 'AUTHORIZATION_REJECTED', operationId };

    let outcome;
    let body = null;
    try {
      const response = await fetchImpl(`${PRODUCTION_ORIGIN}${SII_EMISSION_PATHS[39]}`, {
        method: 'POST',
        headers: { 'x-api-key': issuer.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        redirect: 'error',
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      body = await response.json().catch(() => null);
      let documents = null;
      const provisional = classifyLiveIssuance({ statusCode: response.status, body });
      if (provisional.state === 'unknown' && provisional.folio && retrieveDocuments) {
        documents = await retrieveDocuments({ folio: provisional.folio, timeoutMs: DOCS_TIMEOUT_MS })
          .catch(() => null);
      }
      outcome = classifyLiveIssuance({ statusCode: response.status, body, retrievedDocuments: documents });
    } catch {
      outcome = classifyLiveIssuance({ networkError: true });
    }

    try {
      const { data, error } = await admin.rpc('crm_finalize_fiscal_issuance', {
        p_business_id: businessId, p_sale_id: saleId, p_operation_id: operationId,
        p_status: outcome.state, p_folio: outcome.folio ?? null,
        p_xml_base64: outcome.xmlBase64 ?? null, p_pdf_base64: outcome.pdfBase64 ?? null,
      });
      if (error || data !== true) {
        return { state: 'unknown', folio: outcome.folio ?? null, operationId, reason: 'FINALIZE_FAILED_RECONCILE' };
      }
    } catch {
      return { state: 'unknown', folio: outcome.folio ?? null, operationId, reason: 'FINALIZE_FAILED_RECONCILE' };
    }
    return { state: outcome.state, folio: outcome.folio ?? null, operationId, reason: outcome.reason ?? null };
  };
}
