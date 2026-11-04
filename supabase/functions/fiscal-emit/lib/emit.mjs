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
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = () => new Date(),
}) {
  if (!store || !provider) throw new Error('store and provider are required');
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
  async function status({ actorUserId, saleId }) {
    const { sale, business, role } = await loadAuthorizedSale(actorUserId, saleId, 'reprint');
    const row = await store.getIssuance(sale.businessId, sale.id);
    const out = {
      state: row?.status ?? 'none',
      folio: row?.folio ?? null,
      siiStatus: row?.status === 'issued' || row?.status === 'cancelled' ? (row.siiStatus ?? 'unverified') : null,
      siiTrackId: row?.siiTrackId ?? null,
      hasPdf: Boolean(row?.pdfBase64),
      hasXml: Boolean(row?.hasXml),
      canEmit: false,
      blockedReason: null,
      // Resolución SII del emisor para imprimir la boleta (o su reimpresión). null si no está.
      resolucion: null,
    };
    const resolucionOf = async () => {
      try {
        return (await store.loadEmissionContext(sale.businessId, sale.id))?.issuer?.resolucion ?? null;
      } catch {
        return null;
      }
    };
    if (row?.status === 'unknown' || row?.status === 'failed') out.errorCode = row.errorCode ?? null;
    if (row && row.status !== 'pending') {
      if (row.status === 'issued' || row.status === 'cancelled') out.resolucion = await resolucionOf();
      out.blockedReason = row.status === 'issued' ? 'ALREADY_ISSUED'
        : row.status === 'unknown' ? 'UNKNOWN_REQUIRES_RECONCILIATION'
          : row.status === 'sending' ? 'ALREADY_IN_PROGRESS' : 'NOT_EMITTABLE_IN_STATE';
      return out;
    }
    if (!authorizeAction(role, 'emit')) { out.blockedReason = 'FISCAL_ROLE_REQUIRED'; return out; }
    if (provider.ready === false) { out.blockedReason = 'PROVIDER_NOT_READY'; return out; }
    try {
      const ctx = await store.loadEmissionContext(sale.businessId, sale.id);
      out.resolucion = ctx.issuer?.resolucion ?? null;
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

  // Superficie pública: emit, reprint y status. No hay reconcile aquí (lib/reconciler.mjs).
  return Object.freeze({ emitSale, reprint, status });
}
