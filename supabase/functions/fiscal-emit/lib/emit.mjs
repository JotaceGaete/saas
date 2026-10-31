// Orquestador del emisor fiscal único (F2.2 / F2.3).
//
// Reglas que hace cumplir:
//  - El business_id se deriva SIEMPRE de la venta. El navegador solo aporta saleId y el usuario
//    autenticado. Si el usuario no es dueño del comercio de la venta -> SALE_NOT_FOUND (sin
//    distinguir "no existe" de "es de otro", para no filtrar existencia entre tenants).
//  - Una venta emitida no vuelve a llamar al proveedor (idempotencia).
//  - Solo una llamada concurrente gana el reclamo (crm_claim_fiscal_issuance, bajo FOR UPDATE).
//  - Resultado válido = folio > 0 + XML + PDF. Cualquier otra cosa tras llamar al proveedor -> unknown.
//  - unknown nunca se reintenta automáticamente; solo reconciliación con evidencia.
//  - Reimpresión desde el PDF guardado, sin llamar al proveedor.

import { FiscalError, ProviderRejectedError, ProviderTimeoutError } from './errors.mjs';
import { evaluateEligibility } from './eligibility.mjs';
import { open as openSecret, parseMasterKey } from './secrets.mjs';

export const DEFAULT_TIMEOUT_MS = 20_000;

// Clave de operación determinista: la misma que usa el ledger P2 (WLK-<business>-<sale>).
export function operationIdFor(businessId, saleId) {
  return `WLK-${businessId}-${saleId}`;
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new ProviderTimeoutError(ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function validDocument(doc) {
  return (
    doc &&
    Number.isSafeInteger(doc.folio) &&
    doc.folio > 0 &&
    typeof doc.xmlBase64 === 'string' &&
    doc.xmlBase64.trim().length > 0 &&
    typeof doc.pdfBase64 === 'string' &&
    doc.pdfBase64.trim().length > 0
  );
}

export function createFiscalEmitter({
  store,
  provider,
  masterKey, // string base64 de 32 bytes (FISCAL_MASTER_KEY)
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  if (!store || !provider) throw new Error('store and provider are required');
  const key = typeof masterKey === 'string' || masterKey === undefined ? parseMasterKey(masterKey) : masterKey;

  // Carga la venta y comprueba que el usuario es dueño de su comercio.
  async function loadOwnedSale(actorUserId, saleId) {
    if (!saleId || !actorUserId) throw new FiscalError('SALE_NOT_FOUND');
    const sale = await store.loadSaleById(saleId);
    if (!sale) throw new FiscalError('SALE_NOT_FOUND');
    const business = await store.loadBusiness(sale.businessId);
    if (!business || business.userId !== actorUserId) throw new FiscalError('SALE_NOT_FOUND');
    return { sale, business };
  }

  async function emitSale({ actorUserId, saleId }) {
    const { sale, business } = await loadOwnedSale(actorUserId, saleId);
    const businessId = sale.businessId;
    const operationId = operationIdFor(businessId, sale.id);

    const existing = await store.getIssuance(businessId, sale.id);
    if (existing?.status === 'issued') {
      return { status: 'issued', folio: existing.folio, alreadyIssued: true, providerCalls: 0 };
    }
    if (existing?.status === 'unknown') {
      throw new FiscalError('UNKNOWN_REQUIRES_RECONCILIATION');
    }
    if (existing && existing.status !== 'pending') {
      throw new FiscalError('NOT_EMITTABLE_IN_STATE', `state ${existing.status}`);
    }

    if (provider.ready === false) {
      // Contrato del proveedor no verificado: se rechaza ANTES de reclamar, así la venta queda pending.
      throw new FiscalError('PROVIDER_NOT_READY');
    }

    const [issuer, emissionEnabled, taxLinesVerified, lines, payments, pointOps] = await Promise.all([
      store.loadIssuer(businessId),
      store.loadEmissionEnabled(),
      store.taxLinesVerified(businessId, sale.id),
      store.loadLines(sale.id),
      store.loadPayments(sale.id),
      store.loadPointOps(businessId, sale.id),
    ]);

    const { medioPago, montoPago, payload } = evaluateEligibility({
      sale,
      business,
      issuer,
      emissionEnabled,
      taxLinesVerified,
      lines,
      payments,
      pointOps,
      operationId,
    });

    const credRecord = await store.loadCredentialRecord(businessId);
    if (!credRecord) throw new FiscalError('CREDENTIALS_MISSING');
    const creds = openSecret(credRecord, { key, businessId });

    // Reclamo atómico. Si otro proceso ganó, nosotros no llamamos al proveedor.
    const claimed = await store.claim(businessId, sale.id, operationId);
    if (!claimed) throw new FiscalError('ALREADY_IN_PROGRESS');

    let doc;
    try {
      doc = await withTimeout(provider.emit({ payload, credentials: creds }), timeoutMs);
    } catch (err) {
      if (err instanceof ProviderRejectedError) {
        await store.markFailed(businessId, sale.id, operationId, 'PROVIDER_REJECTED');
        return { status: 'failed', providerCalls: 1, medioPago, montoPago };
      }
      // Timeout, red, excepción no clasificada: el proveedor pudo haber emitido. Es unknown.
      await store.finalize(businessId, sale.id, operationId, { status: 'unknown' });
      return { status: 'unknown', providerCalls: 1, medioPago, montoPago, reason: err?.code ?? 'ERROR' };
    }

    if (!validDocument(doc)) {
      // Respuesta sin folio, XML o PDF: no se puede marcar issued sin los tres.
      await store.finalize(businessId, sale.id, operationId, { status: 'unknown' });
      return { status: 'unknown', providerCalls: 1, medioPago, montoPago, reason: 'INCOMPLETE_DOCUMENT' };
    }

    // Si esta escritura falla, la fila queda 'sending' y el sistema se niega a reintentar: seguro.
    const ok = await store.finalize(businessId, sale.id, operationId, {
      status: 'issued',
      folio: doc.folio,
      xmlBase64: doc.xmlBase64,
      pdfBase64: doc.pdfBase64,
    });
    if (!ok) throw new FiscalError('PERSIST_FAILED', 'issued outcome could not be stored');
    return { status: 'issued', folio: doc.folio, providerCalls: 1, medioPago, montoPago };
  }

  // Devuelve el PDF ya guardado. Nunca llama al proveedor.
  async function reprint({ actorUserId, saleId }) {
    const { sale } = await loadOwnedSale(actorUserId, saleId);
    const row = await store.getIssuance(sale.businessId, sale.id);
    if (!row || row.status !== 'issued' || !row.pdfBase64) {
      throw new FiscalError('NOT_ISSUED');
    }
    return { folio: row.folio, pdfBase64: row.pdfBase64, providerCalls: 0 };
  }

  // Reconciliación manual de un unknown, con evidencia explícita. Nunca automática.
  async function reconcile({ actorUserId, saleId, evidence }) {
    const { sale } = await loadOwnedSale(actorUserId, saleId);
    const operationId = operationIdFor(sale.businessId, sale.id);
    const row = await store.getIssuance(sale.businessId, sale.id);
    if (!row || row.status !== 'unknown') throw new FiscalError('NOT_UNKNOWN');
    if (!evidence || typeof evidence.reason !== 'string' || evidence.reason.trim().length < 10) {
      throw new FiscalError('EVIDENCE_REQUIRED');
    }
    if (!validDocument(evidence)) throw new FiscalError('EVIDENCE_INCOMPLETE');
    const ok = await store.reconcile(sale.businessId, sale.id, operationId, evidence);
    if (!ok) throw new FiscalError('RECONCILE_REJECTED');
    return { status: 'issued', folio: evidence.folio, providerCalls: 0 };
  }

  return { emitSale, reprint, reconcile };
}
