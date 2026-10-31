// Mapeo compartido entre almacenes (Postgres y supabase-js). Ambos reciben las mismas
// respuestas JSON de las RPC del ledger y las convierten aquí, así no pueden divergir.

import { FiscalError } from './errors.mjs';

// Respuesta de public.crm_fiscal_emission_context(business, sale).
export function mapEmissionContext(raw) {
  if (!raw || typeof raw !== 'object') throw new FiscalError('CONTEXT_INVALID');
  return {
    issuer: raw.issuer
      ? { issuerRut: raw.issuer.issuer_rut, enabled: raw.issuer.enabled, verified: raw.issuer.verified }
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
  return { id: raw.id, status: raw.status, folio: raw.folio, pdfBase64: raw.pdf_base64 ?? null };
}

// Convierte los errores de los RPC (FISCAL_* o 'Invalid fiscal ...') en FiscalError.
export function mapRpcError(err) {
  const msg = err?.message ?? '';
  const m = /FISCAL_[A-Z_]+/.exec(msg);
  if (m) return new FiscalError(m[0], msg);
  if (/^Invalid fiscal/.test(msg)) return new FiscalError('INVALID_FISCAL_ARGUMENT', msg);
  return err;
}
