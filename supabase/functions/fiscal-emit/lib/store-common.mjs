// Mapeo compartido entre almacenes (Postgres y supabase-js). Ambos reciben las mismas
// respuestas JSON de las RPC del ledger y las convierten aquí, así no pueden divergir.

import { FiscalError } from './errors.mjs';

// Respuesta de public.crm_fiscal_emission_context(business, sale).
export function mapEmissionContext(raw) {
  if (!raw || typeof raw !== 'object') throw new FiscalError('CONTEXT_INVALID');
  return {
    issuer: raw.issuer
      ? {
          issuerRut: raw.issuer.issuer_rut, enabled: raw.issuer.enabled, verified: raw.issuer.verified,
          sucursal: raw.issuer.sucursal_nombre && raw.issuer.sucursal_codigo
            ? { nombre: raw.issuer.sucursal_nombre, codigo: raw.issuer.sucursal_codigo } : null,
          // Resolución SII del emisor (migración F), para imprimir la boleta. null si falta.
          resolucion: raw.issuer.resolucion_numero && raw.issuer.resolucion_fecha
            ? { numero: Number(raw.issuer.resolucion_numero), fecha: String(raw.issuer.resolucion_fecha).slice(0, 10) } : null,
        }
      : null,
    emissionEnabled: raw.emission_enabled === true,
    taxLinesVerified: raw.tax_lines_verified === true,
    lines: (raw.lines ?? []).map((l) => ({
      id: l.id,
      name: l.name,
      unitPrice: Number(l.unit_price),
      quantity: Number(l.quantity),
      discountPct: Number(l.discount_pct ?? 0),
      category: l.category ?? null,
    })),
    payments: (raw.payments ?? []).map((p) => ({
      method: p.method,
      amount: Number(p.amount),
      status: p.status,
      voided: p.voided === true,
    })),
    pointOps: (raw.point_ops ?? []).map((o) => ({
      mpStatus: o.mp_status,
      mpOrderId: o.mp_order_id,
      mpPaymentId: o.mp_payment_id,
      finalizedAt: o.finalized_at,
      currency: o.currency,
      amount: Number(o.amount),
    })),
  };
}

// Respuesta de public.crm_fiscal_get_credentials(business). Los bytes llegan en base64.
export function mapCredentialRecord(raw) {
  if (!raw) return null;
  return {
    provider: raw.provider,
    keyVersion: raw.key_version,
    ciphertext: Buffer.from(raw.ciphertext, 'base64'),
    iv: Buffer.from(raw.iv, 'base64'),
    authTag: Buffer.from(raw.auth_tag, 'base64'),
  };
}

// Respuesta de public.crm_fiscal_get_issuance(business, sale).
export function mapIssuance(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    status: raw.status,
    folio: raw.folio,
    pdfBase64: raw.pdf_base64 ?? null,
    // Campos de la migración E. Sin ella, quedan en sus valores neutros.
    hasXml: raw.has_xml === true,
    errorCode: raw.error_code ?? null,
    siiStatus: raw.sii_status ?? 'unverified',
    siiTrackId: raw.sii_track_id ?? null,
    siiCheckedAt: raw.sii_checked_at ?? null,
    issuedAt: raw.issued_at ?? null,
  };
}

// Error de infraestructura del almacén (red, PostgREST, función inexistente, etc.). No es un
// rechazo de dominio: el emisor lo trata como "no sé si se escribió" y reintenta solo si es seguro.
export class StoreError extends Error {
  constructor(code, message = 'store request failed') {
    super(message);
    this.name = 'StoreError';
    this.code = code;
  }
}

// Convierte los errores de los RPC (FISCAL_* o 'Invalid fiscal ...') en FiscalError.
// Usado por el almacén Postgres (pg), donde el mensaje llega tal cual de la base.
export function mapRpcError(err) {
  const msg = err?.message ?? '';
  const m = /FISCAL_[A-Z_]+/.exec(msg);
  if (m) return new FiscalError(m[0], msg);
  if (/^Invalid fiscal/.test(msg)) return new FiscalError('INVALID_FISCAL_ARGUMENT', msg);
  return err;
}

// Error devuelto por PostgREST / supabase-js: { message, code, details, hint }.
// Solo los errores del ledger (mensaje FISCAL_* o 'Invalid fiscal') son de dominio. Todo lo demás
// (PGRST202 función no encontrada, PGRST116 varias filas, red, permisos) es StoreError sin
// detalles internos. Nunca se expone el mensaje crudo del proveedor de base de datos.
export function mapPostgrestError(error) {
  const msg = String(error?.message ?? '');
  const m = /FISCAL_[A-Z_]+/.exec(msg);
  if (m) return new FiscalError(m[0], msg);
  if (/^Invalid fiscal/.test(msg)) return new FiscalError('INVALID_FISCAL_ARGUMENT', msg);
  const code = String(error?.code ?? '');
  if (code === 'PGRST116') return new StoreError('STORE_UNEXPECTED_ROWS');
  if (code === 'PGRST202') return new StoreError('STORE_FUNCTION_MISSING');
  if (code === '42501') return new StoreError('STORE_PERMISSION_DENIED');
  return new StoreError('STORE_UNAVAILABLE');
}

// Respuesta de public.crm_fiscal_actor_role(business, user): 'fiscal_owner' | ... | null.
export function mapActorRole(raw) {
  if (raw == null) return null;
  return ['fiscal_owner', 'fiscal_operator', 'fiscal_viewer', 'fiscal_reconciler'].includes(raw) ? raw : null;
}

// Respuesta de public.crm_fiscal_list_stale_sending(before): arreglo de filas vencidas.
export function mapStaleList(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new StoreError('STORE_UNEXPECTED_SHAPE');
  return raw.map((r) => ({
    businessId: r.business_id,
    saleId: r.sale_id,
    operationId: r.operation_id,
    hasReceipt: r.has_receipt === true,
  }));
}
