// Manejador HTTP del emisor, sin dependencia del runtime. index.ts solo lo conecta a Deno.
// Reglas:
//  - Entrada estricta: solo {action, saleId}. Cualquier otro campo se rechaza (nunca se acepta
//    business_id, folio, medioPago ni montos del cliente).
//  - Autenticación por usuario: resolveUser(authHeader) debe devolver el id del usuario o null.
//  - Respuestas sin secretos. emit no devuelve XML ni PDF; reprint devuelve el PDF al dueño.
//  - lookup y sii-status son consultas: nunca emiten. lookup no cambia la venta; sii-status solo
//    registra el estado SII de una boleta ya emitida. Mismo control de tenant, rol y lista de
//    empresas autorizadas que emit (lib/emit.mjs).
//  - Errores: códigos estables; nunca stack traces ni mensajes internos.

import { FiscalError } from './errors.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_FIELDS = new Set(['action', 'saleId']);
const ACTIONS = new Set(['emit', 'reprint', 'status', 'lookup', 'sii-status']);

const STATUS_BY_CODE = {
  SALE_NOT_FOUND: 404,
  NOT_ISSUED: 404,
  FISCAL_ROLE_REQUIRED: 403,
  ALREADY_IN_PROGRESS: 409,
  NOT_EMITTABLE_IN_STATE: 409,
  UNKNOWN_REQUIRES_RECONCILIATION: 409,
  FISCAL_CROSS_PIPELINE_CONFLICT: 409,
  // La operación está en 'sending' y la recuperación debe decidir. El cliente NO debe reintentar
  // la emisión: un reintento daría 409 NOT_EMITTABLE_IN_STATE, que es lo correcto.
  PERSIST_PENDING_RECOVERY: 409,
  // Venta Point antigua: emisión retroactiva automática bloqueada. No es reintentable.
  FISCAL_RETROACTIVE_BLOCKED: 409,
  PROVIDER_NOT_READY: 503,
  SALE_NOT_SAME_DAY: 409,
  FISCAL_SALE_NOT_SAME_DAY: 409,
  CREDENTIALS_MISSING: 503,
  // Configuración de proveedor o credencial inválida: no es reintentable hasta corregir la configuración.
  CREDENTIAL_INVALID: 503,
  FISCAL_PROVIDER_MISMATCH: 503,
  // Negocio o RUT fuera de la lista de empresas autorizadas del servidor.
  FISCAL_BUSINESS_NOT_ALLOWED: 403,
  // lookup solo aplica a ventas con resultado desconocido.
  NOT_UNKNOWN: 409,
  // Migración H: el propietario no ha confirmado el RUT para la credencial vigente. No es
  // reintentable hasta que lo confirme en Configuración.
  FISCAL_RUT_NOT_CONFIRMED: 409,
  FISCAL_DOCUMENT_ISSUER_MISMATCH: 409,
  FISCAL_FOLIO_DUPLICATE: 409,
};

export function statusFor(err) {
  if (err instanceof FiscalError) return STATUS_BY_CODE[err.code] ?? 422;
  return 500;
}

function fail(status, code) {
  return { status, body: { error: code } };
}

export function createHttpHandler({ emitter, resolveUser }) {
  return async function handle({ method, authHeader, body }) {
    if (method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED');

    const userId = authHeader ? await resolveUser(authHeader) : null;
    if (!userId) return fail(401, 'UNAUTHENTICATED');

    if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'BAD_REQUEST');
    for (const key of Object.keys(body)) {
      if (!ALLOWED_FIELDS.has(key)) return fail(400, 'UNKNOWN_FIELD');
    }
    if (!ACTIONS.has(body.action)) return fail(400, 'UNKNOWN_ACTION');
    if (typeof body.saleId !== 'string' || !UUID.test(body.saleId)) return fail(400, 'INVALID_SALE_ID');

    try {
      if (body.action === 'emit') {
        const r = await emitter.emitSale({ actorUserId: userId, saleId: body.saleId });
        const out = { status: r.status };
        if (r.folio != null) out.folio = r.folio;
        if (r.alreadyIssued) out.alreadyIssued = true;
        if (r.medioPago) out.medioPago = r.medioPago;
        if (r.folioHint) out.folioHint = r.folioHint;
        return { status: r.status === 'issued' ? 200 : 202, body: out };
      }
      if (body.action === 'status') {
        return { status: 200, body: await emitter.status({ actorUserId: userId, saleId: body.saleId }) };
      }
      if (body.action === 'lookup') {
        return { status: 200, body: await emitter.lookupOperation({ actorUserId: userId, saleId: body.saleId }) };
      }
      if (body.action === 'sii-status') {
        return { status: 200, body: await emitter.refreshSiiStatus({ actorUserId: userId, saleId: body.saleId }) };
      }
      const r = await emitter.reprint({ actorUserId: userId, saleId: body.saleId });
      return { status: 200, body: { folio: r.folio, pdfBase64: r.pdfBase64 } };
    } catch (err) {
      if (err instanceof FiscalError) return fail(statusFor(err), err.code);
      // Error no clasificado: se registra en el servidor, no se expone al cliente.
      console.error('fiscal-emit internal error', err?.name ?? 'Error');
      return fail(500, 'INTERNAL');
    }
  };
}
