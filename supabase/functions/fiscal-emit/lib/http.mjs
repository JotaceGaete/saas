// Manejador HTTP del emisor, sin dependencia del runtime. index.ts solo lo conecta a Deno.
// Reglas:
//  - Entrada estricta: solo {action, saleId}. Cualquier otro campo se rechaza (nunca se acepta
//    business_id, folio, medioPago ni montos del cliente).
//  - Autenticación por usuario: resolveUser(authHeader) debe devolver el id del usuario o null.
//  - Respuestas sin secretos. emit no devuelve XML ni PDF; reprint devuelve el PDF al dueño.
//  - Errores: códigos estables; nunca stack traces ni mensajes internos.

import { FiscalError } from './errors.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_FIELDS = new Set(['action', 'saleId']);
const ACTIONS = new Set(['emit', 'reprint']);

const STATUS_BY_CODE = {
  SALE_NOT_FOUND: 404,
  NOT_ISSUED: 404,
  ALREADY_IN_PROGRESS: 409,
  NOT_EMITTABLE_IN_STATE: 409,
  UNKNOWN_REQUIRES_RECONCILIATION: 409,
  FISCAL_CROSS_PIPELINE_CONFLICT: 409,
  PROVIDER_NOT_READY: 503,
  CREDENTIALS_MISSING: 503,
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
        return { status: r.status === 'issued' ? 200 : 202, body: out };
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
