// Orquestador del emisor fiscal único (F2.2 / F2.3).
//
// Reglas que hace cumplir:
//  - El business_id se deriva SIEMPRE de la venta. El navegador solo aporta saleId y el usuario
//    autenticado. Sin rol activo en el negocio -> SALE_NOT_FOUND (no se revela existencia).
//  - Rol: la acción exige un rol fiscal permitido (lib/authz.mjs). Rol insuficiente ->
//    FISCAL_ROLE_REQUIRED.
//  - Idempotencia: una venta emitida no vuelve a llamar al proveedor.
//  - Recibo antes de finalizar (write-ahead): la respuesta válida del proveedor se guarda antes de
//    marcar issued. Si la finalización falla, la recuperación la completa desde el recibo.
//  - Nunca se reintenta una llamada al proveedor. Tras una llamada sin resultado válido -> unknown.
//  - Un fallo de escritura que deja la fila en 'sending' NO se trata como fallo: queda para la
//    recuperación (lib/recovery.mjs), que no llama al proveedor.
//  - La reconciliación NO está aquí. Ver lib/reconciler.mjs (fuera de la API pública).

import { FiscalError, ProviderRejectedError, ProviderTimeoutError } from './errors.mjs';
import { evaluateEligibility } from './eligibility.mjs';
import { authorizeAction } from './authz.mjs';
import { validDocument } from './document.mjs';
import { open as openSecret, parseMasterKey } from './secrets.mjs';
import { expectedTotals } from './payload.mjs';
import { isAllowlist } from './allowlist.mjs';

export const DEFAULT_TIMEOUT_MS = 20_000;
// Reintentos acotados SOLO para errores de transporte/almacén (no FiscalError). Todas las
// escrituras reintentadas son idempotentes (mismo contenido o comprobación de estado).
export const PERSIST_ATTEMPTS = 3;

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

async function retryTransient(fn, attempts = PERSIST_ATTEMPTS) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof FiscalError) throw err; // respuesta definitiva del almacén
      last = err;
    }
  }
  throw last;
}

export function createFiscalEmitter({
  store,
  provider,
  masterKey, // string base64 de 32 bytes (FISCAL_MASTER_KEY)
  // Empresas autorizadas (lib/allowlist.mjs, FISCAL_ALLOWED_ISSUERS): id del negocio + RUT del
  // emisor. Obligatoria: sin ella el emisor no se construye (falla cerrado).
  allowedIssuers,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = () => new Date(),
}) {
  if (!store || !provider) throw new Error('store and provider are required');
  if (!isAllowlist(allowedIssuers)) throw new Error('allowedIssuers is required (fail-closed)');
  const key = typeof masterKey === 'string' || masterKey === undefined ? parseMasterKey(masterKey) : masterKey;

  async function readStatus(businessId, saleId) {
    try {
      return await retryTransient(() => store.getIssuance(businessId, saleId));
    } catch {
      return null;
    }
  }

  // Intenta escribir un estado terminal. Si la escritura no se confirma, lee el estado real:
  // si ya es el esperado (p. ej. la respuesta se perdió tras confirmar), cuenta como éxito.
  async function settle(businessId, saleId, write, expected) {
    let wrote = false;
    try {
      wrote = await retryTransient(write);
    } catch {
      wrote = false;
    }
    if (wrote) return true;
    const cur = await readStatus(businessId, saleId);
    if (!cur || cur.status !== expected.status) return false;
    return expected.folio === undefined || cur.folio === expected.folio;
  }

  // Tenant y rol, en este orden:
  //  1) La venta existe.
  //  2) El usuario tiene un rol fiscal activo EN EL NEGOCIO DE LA VENTA. Sin rol = no es miembro,
  //     y responde igual que una venta inexistente (SALE_NOT_FOUND).
  //  3) El rol permite la acción (FISCAL_ROLE_REQUIRED si no).
  // wa_businesses.user_id no concede acceso: solo siembra la fila fiscal_owner.
  async function loadAuthorizedSale(actorUserId, saleId, action) {
    if (!saleId || !actorUserId) throw new FiscalError('SALE_NOT_FOUND');
    const sale = await store.loadSaleById(saleId);
    if (!sale) throw new FiscalError('SALE_NOT_FOUND');
    const role = await store.loadActorRole(sale.businessId, actorUserId);
    if (!role) throw new FiscalError('SALE_NOT_FOUND');
    if (!authorizeAction(role, action)) throw new FiscalError('FISCAL_ROLE_REQUIRED');
    const business = await store.loadBusiness(sale.businessId);
    if (!business) throw new FiscalError('SALE_NOT_FOUND');
    return { sale, business, role };
  }

  // Empresa autorizada: el negocio de la venta y el RUT del emisor guardado en la base (nunca un
  // dato del cliente) deben estar juntos en la lista del servidor.
  const businessAllowed = (businessId, issuer) => allowedIssuers.permits(businessId, issuer?.issuerRut ?? null);
  function assertBusinessAllowed(businessId, issuer) {
    if (!businessAllowed(businessId, issuer)) throw new FiscalError('FISCAL_BUSINESS_NOT_ALLOWED');
  }

  // Credencial del comercio para CONSULTAS de solo lectura (operación, estado SII). La emisión no
  // usa este camino: lee la credencial dentro del reclamo atómico.
  async function readOnlyCredentials(businessId) {
    const record = await store.loadCredentialRecord(businessId);
    if (!record) throw new FiscalError('CREDENTIALS_MISSING');
    return openSecret(record, { key, businessId });
  }

  async function auditBestEffort(entry) {
    try {
      await store.appendAudit(entry);
    } catch {
      /* la consulta ya terminó; la falta de esta fila no cambia la venta */
    }
  }

  async function emitSale({ actorUserId, saleId }) {
    const { sale, business } = await loadAuthorizedSale(actorUserId, saleId, 'emit');
    const businessId = sale.businessId;
    const operationId = operationIdFor(businessId, sale.id);

    const existing = await store.getIssuance(businessId, sale.id);
    if (existing?.status === 'issued') {
      return { status: 'issued', folio: existing.folio, alreadyIssued: true, providerCalls: 0 };
    }
    if (existing?.status === 'unknown') throw new FiscalError('UNKNOWN_REQUIRES_RECONCILIATION');
    if (existing?.status === 'sending') throw new FiscalError('NOT_EMITTABLE_IN_STATE', 'sending: recovery pending');
    if (existing && existing.status !== 'pending') {
      throw new FiscalError('NOT_EMITTABLE_IN_STATE', `state ${existing.status}`);
    }

    if (provider.ready === false) {
      // Contrato no verificado: se rechaza ANTES de reclamar; la venta queda sin fila.
      throw new FiscalError('PROVIDER_NOT_READY');
    }

    const ctx = await store.loadEmissionContext(businessId, sale.id);
    // Antes del reclamo: un negocio fuera de la lista no crea fila ni llama al proveedor.
    assertBusinessAllowed(businessId, ctx.issuer);
    const { medioPago, montoPago, payload } = evaluateEligibility({
      sale,
      business,
      issuer: ctx.issuer,
      emissionEnabled: ctx.emissionEnabled,
      taxLinesVerified: ctx.taxLinesVerified,
      lines: ctx.lines,
      payments: ctx.payments,
      pointOps: ctx.pointOps,
      operationId,
      now: now(),
    });
    // Lo que el documento devuelto debe declarar: total y emisor. Un XML que no coincide no se
    // marca issued (queda unknown con su folio para revisión).
    const expect = { total: expectedTotals(payload).total, rutEmisor: ctx.issuer?.issuerRut ?? null };

    // Reclamo atómico con credenciales (pending -> sending) bajo el mismo candado que conectar,
    // reemplazar o desconectar. Las credenciales se leen DENTRO del reclamo: una emisión nunca usa
    // una clave que cambió durante su preparación. Si otro proceso ganó, no llamamos al proveedor.
    let claim;
    try {
      claim = await store.claimWithCredentials(businessId, sale.id, operationId);
    } catch (err) {
      // Mismo código público con cualquier almacén (SQL o memoria).
      if (err?.code === 'FISCAL_CREDENTIALS_MISSING') throw new FiscalError('CREDENTIALS_MISSING');
      // La base exige el RUT confirmado al pasar a sending (migración H). Puede cambiar entre la
      // lectura del contexto y el reclamo (p. ej. se reemplazó la API key): no hay fila ni llamada.
      if (err?.code === 'FISCAL_RUT_NOT_CONFIRMED') throw new FiscalError('FISCAL_RUT_NOT_CONFIRMED');
      throw err;
    }
    if (!claim.claimed) throw new FiscalError('ALREADY_IN_PROGRESS');

    let creds;
    try {
      creds = openSecret(claim.credentials, { key, businessId });
    } catch {
      // Falla ANTES de llamar al proveedor: se libera el reclamo para que la venta pueda reintentarse.
      const released = await store.releaseClaim(businessId, sale.id, operationId);
      if (!released) throw new FiscalError('PERSIST_PENDING_RECOVERY', 'claim not released; recovery will decide');
      throw new FiscalError('CREDENTIAL_INVALID');
    }

    // unknown conserva el folio si el proveedor lo informó (409 folioExistente, 2xx sin documentos
    // válidos). Ese folio es una pista para la reconciliación, no prueba de emisión.
    const markUnknown = async (reason, folio = null) => {
      const out = { status: 'unknown', errorCode: String(reason ?? 'ERROR').slice(0, 64) };
      if (Number.isSafeInteger(folio) && folio > 0) out.folio = folio;
      const ok = await settle(businessId, sale.id,
        () => store.finalize(businessId, sale.id, operationId, out),
        { status: 'unknown' });
      if (!ok) throw new FiscalError('PERSIST_PENDING_RECOVERY', 'state remains sending; recovery will decide');
      const r = { status: 'unknown', providerCalls: 1, medioPago, montoPago, reason };
      if (out.folio) r.folioHint = out.folio;
      return r;
    };

    let doc;
    try {
      doc = await withTimeout(provider.emit({ payload, credentials: creds, expect }), timeoutMs);
    } catch (err) {
      if (err instanceof ProviderRejectedError) {
        const ok = await settle(businessId, sale.id,
          () => store.markFailed(businessId, sale.id, operationId, 'PROVIDER_REJECTED'),
          { status: 'failed' });
        if (!ok) throw new FiscalError('PERSIST_PENDING_RECOVERY', 'state remains sending; recovery will decide');
        return { status: 'failed', providerCalls: 1, medioPago, montoPago };
      }
      // Timeout, red o error no clasificado: el proveedor pudo haber emitido. Es unknown, nunca failed.
      return markUnknown(err?.code ?? 'ERROR', err?.folio ?? null);
    }

    if (!validDocument(doc)) {
      // Sin folio, XML o PDF: no se puede marcar issued sin los tres.
      return markUnknown('INCOMPLETE_DOCUMENT');
    }

    // 1) Recibo write-ahead. El documento ya existe en el proveedor: guardarlo antes de finalizar
    //    permite completar la fila sin volver a llamar al proveedor si algo falla después.
    try {
      await retryTransient(() => store.storeReceipt(businessId, sale.id, operationId, doc));
    } catch (err) {
      if (err instanceof FiscalError && err.code === 'FISCAL_RECEIPT_CONFLICT') {
        // Ya hay un recibo distinto para esta operación: no elegimos cuál es válido. Queda unknown.
        return markUnknown('RECEIPT_CONFLICT');
      }
      if (err instanceof FiscalError && err.code === 'FISCAL_NOT_SENDING') {
        // La recuperación ya cambió la fila mientras llamábamos al proveedor. No se finaliza.
        const cur = await readStatus(businessId, sale.id);
        if (cur?.status === 'unknown') {
          return { status: 'unknown', providerCalls: 1, medioPago, montoPago, reason: 'STATE_CHANGED' };
        }
        throw new FiscalError('PERSIST_PENDING_RECOVERY', 'state changed during provider call');
      }
      // Fallo de almacén: se intenta finalizar igual con el documento en memoria.
    }

    // 2) Finalizar issued. Si la respuesta se perdió tras confirmar, settle lee el estado real.
    const issued = await settle(businessId, sale.id,
      () => store.finalize(businessId, sale.id, operationId, {
        status: 'issued', folio: doc.folio, xmlBase64: doc.xmlBase64, pdfBase64: doc.pdfBase64,
      }),
      { status: 'issued', folio: doc.folio });
    if (!issued) {
      // El documento existe en el proveedor. La fila queda en sending: la recuperación la
      // finaliza desde el recibo si existe, o la pasa a unknown. Nunca se reemite.
      throw new FiscalError('PERSIST_PENDING_RECOVERY', 'provider issued; local state pending recovery');
    }
    return { status: 'issued', folio: doc.folio, providerCalls: 1, medioPago, montoPago };
  }

  // Devuelve el PDF ya guardado. Nunca llama al proveedor.
  async function reprint({ actorUserId, saleId }) {
    const { sale } = await loadAuthorizedSale(actorUserId, saleId, 'reprint');
    const row = await store.getIssuance(sale.businessId, sale.id);
    if (!row || row.status !== 'issued' || !row.pdfBase64) throw new FiscalError('NOT_ISSUED');
    return { folio: row.folio, pdfBase64: row.pdfBase64, providerCalls: 0 };
  }

  // Estado fiscal de la venta para el TPV. Solo lectura: nunca reclama ni llama al proveedor.
  // canEmit es true solo si el rol permite emitir, la venta no tiene fila (o está pending), el
  // proveedor está activo y la venta pasa la elegibilidad completa. blockedReason explica por qué no.
  // liveAuthorized: el SERVIDOR autoriza la emisión real para este negocio (proveedor real activo,
  // empresa en la lista, emisor habilitado y verificado). El TPV en Preview solo usa el modo real
  // si lo recibe en true; aun así cada emisión vuelve a pasar todas las reglas del servidor.
  async function status({ actorUserId, saleId }) {
    const { sale, business, role } = await loadAuthorizedSale(actorUserId, saleId, 'reprint');
    const row = await store.getIssuance(sale.businessId, sale.id);
    let ctx = null;
    try {
      ctx = await store.loadEmissionContext(sale.businessId, sale.id);
    } catch {
      ctx = null;
    }
    const allowed = businessAllowed(sale.businessId, ctx?.issuer);
    const out = {
      state: row?.status ?? 'none',
      folio: row?.folio ?? null,
      siiStatus: row?.status === 'issued' || row?.status === 'cancelled' ? (row.siiStatus ?? 'unverified') : null,
      siiTrackId: row?.siiTrackId ?? null,
      hasPdf: Boolean(row?.pdfBase64),
      hasXml: Boolean(row?.hasXml),
      canEmit: false,
      blockedReason: null,
      liveAuthorized: provider.ready === true && provider.name === 'dtecore' && allowed
        && ctx?.issuer?.enabled === true && ctx?.issuer?.verified === true
        && ctx?.issuer?.rutConfirmed === true,
      // Migración H: el propietario confirmó el RUT para la credencial vigente.
      rutConfirmed: ctx?.issuer?.rutConfirmed === true,
      // Resolución SII del emisor para imprimir la boleta (o su reimpresión). null si no está.
      resolucion: null,
    };
    if (row?.status === 'unknown' || row?.status === 'failed') out.errorCode = row.errorCode ?? null;
    if (row && row.status !== 'pending') {
      if (row.status === 'issued' || row.status === 'cancelled') out.resolucion = ctx?.issuer?.resolucion ?? null;
      out.blockedReason = row.status === 'issued' ? 'ALREADY_ISSUED'
        : row.status === 'unknown' ? 'UNKNOWN_REQUIRES_RECONCILIATION'
          : row.status === 'sending' ? 'ALREADY_IN_PROGRESS' : 'NOT_EMITTABLE_IN_STATE';
      return out;
    }
    if (!ctx) { out.blockedReason = 'STATUS_UNAVAILABLE'; return out; }
    if (!allowed) { out.blockedReason = 'FISCAL_BUSINESS_NOT_ALLOWED'; return out; }
    if (!authorizeAction(role, 'emit')) { out.blockedReason = 'FISCAL_ROLE_REQUIRED'; return out; }
    if (provider.ready === false) { out.blockedReason = 'PROVIDER_NOT_READY'; return out; }
    out.resolucion = ctx.issuer?.resolucion ?? null;
    try {
      evaluateEligibility({
        sale, business, issuer: ctx.issuer, emissionEnabled: ctx.emissionEnabled,
        taxLinesVerified: ctx.taxLinesVerified, lines: ctx.lines, payments: ctx.payments,
        pointOps: ctx.pointOps, operationId: operationIdFor(sale.businessId, sale.id), now: now(),
      });
    } catch (err) {
      out.blockedReason = err instanceof FiscalError ? err.code : 'STATUS_UNAVAILABLE';
      return out;
    }
    out.canEmit = true;
    return out;
  }

  // Recuperación de un resultado desconocido: SOLO CONSULTA.
  //  - Nunca llama a provider.emit, nunca reclama, nunca cambia el estado de la venta: sigue en
  //    'unknown' pase lo que pase (una venta 'unknown' no se vuelve a emitir por ningún camino).
  //  - Pregunta a DTE Core por NUESTRO idBoletaOperacion y, si informa un folio, descarga XML y PDF
  //    de ese folio y los valida (tipo 39, folio, RUT del emisor, total de la venta, timbre, PDF).
  //  - Devuelve lo encontrado para que una persona decida la conciliación (lib/reconciler.mjs,
  //    fuera de la API pública). Deja registro en la auditoría.
  async function lookupOperation({ actorUserId, saleId }) {
    const { sale } = await loadAuthorizedSale(actorUserId, saleId, 'lookup');
    const businessId = sale.businessId;
    const ctx = await store.loadEmissionContext(businessId, sale.id);
    assertBusinessAllowed(businessId, ctx.issuer);
    const row = await store.getIssuance(businessId, sale.id);
    if (!row || row.status !== 'unknown') throw new FiscalError('NOT_UNKNOWN');
    if (provider.ready !== true || typeof provider.lookupOperation !== 'function') throw new FiscalError('PROVIDER_NOT_READY');
    const creds = await readOnlyCredentials(businessId);
    const operationId = operationIdFor(businessId, sale.id);

    const found = await provider.lookupOperation({ operationId, credentials: creds });
    const out = {
      state: 'unknown', // no cambia: esta acción no concilia
      result: ['found', 'not_found'].includes(found?.result) ? found.result : 'indeterminate',
      folio: null,
      folioHint: Number.isSafeInteger(row.folio) ? row.folio : null,
      documents: null,
      code: null,
    };
    if (out.result === 'indeterminate') out.code = String(found?.code ?? 'LOOKUP_UNRECOGNIZED').slice(0, 64);
    if (out.result === 'found') {
      out.folio = found.folio;
      if (out.folioHint != null && out.folioHint !== found.folio) out.code = 'FOLIO_HINT_MISMATCH';
      const expect = { total: Number(sale.total), rutEmisor: ctx.issuer?.issuerRut ?? null };
      let doc = null;
      try {
        doc = typeof provider.retrieveDocuments === 'function'
          ? await provider.retrieveDocuments({ folio: found.folio, credentials: creds, expect }) : null;
      } catch {
        doc = null;
      }
      out.documents = doc ? 'valid' : 'not_retrieved';
    }
    await auditBestEffort({
      businessId, saleId: sale.id, actorUserId, action: 'reconcile_attempt', outcome: `lookup_${out.result}`,
      detail: { operationId, folio: out.folio, folioHint: out.folioHint, documents: out.documents, code: out.code },
    });
    return out;
  }

  // Estado del SII de una boleta emitida, consultado a DTE Core. Solo lee al proveedor; en la base
  // solo escribe sii_status (crm_fiscal_record_sii_status), nunca folio, XML, PDF ni estado de emisión.
  // Si la respuesta no se reconoce, no escribe nada y la boleta sigue «sin verificar».
  async function refreshSiiStatus({ actorUserId, saleId }) {
    const { sale } = await loadAuthorizedSale(actorUserId, saleId, 'sii_status');
    const businessId = sale.businessId;
    const ctx = await store.loadEmissionContext(businessId, sale.id);
    assertBusinessAllowed(businessId, ctx.issuer);
    const row = await store.getIssuance(businessId, sale.id);
    if (!row || (row.status !== 'issued' && row.status !== 'cancelled') || !Number.isSafeInteger(row.folio)) {
      throw new FiscalError('NOT_ISSUED');
    }
    if (provider.ready !== true || typeof provider.getSiiStatus !== 'function') throw new FiscalError('PROVIDER_NOT_READY');
    const creds = await readOnlyCredentials(businessId);
    const r = await provider.getSiiStatus({ folio: row.folio, credentials: creds });
    const previous = row.siiStatus ?? 'unverified';
    if (r?.result !== 'ok') {
      return { folio: row.folio, siiStatus: previous, updated: false, code: String(r?.code ?? 'SII_STATUS_UNAVAILABLE').slice(0, 64) };
    }
    if (!r.siiStatus) {
      return { folio: row.folio, siiStatus: previous, updated: false, code: 'SII_STATUS_UNRECOGNIZED', rawState: r.rawState ?? null };
    }
    if (r.siiStatus === previous) return { folio: row.folio, siiStatus: previous, updated: false, rawState: r.rawState ?? null };
    try {
      await store.recordSiiStatus(businessId, sale.id, {
        siiStatus: r.siiStatus, source: 'provider_api', trackId: r.trackId ?? null,
        detail: r.rawState ? `estado=${r.rawState}` : null, actorUserId,
      });
    } catch (err) {
      if (err instanceof FiscalError && ['FISCAL_SII_STATUS_FINAL', 'FISCAL_SII_TRACK_MISMATCH'].includes(err.code)) {
        return { folio: row.folio, siiStatus: previous, updated: false, code: err.code, rawState: r.rawState ?? null };
      }
      throw err;
    }
    return { folio: row.folio, siiStatus: r.siiStatus, updated: true, rawState: r.rawState ?? null };
  }

  // Superficie pública: emit, reprint, status y las dos consultas. No hay reconcile aquí (lib/reconciler.mjs).
  return Object.freeze({ emitSale, reprint, status, lookupOperation, refreshSiiStatus });
}
