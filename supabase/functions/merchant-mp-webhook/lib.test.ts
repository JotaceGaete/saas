/**
 * merchant-mp-webhook — batería de tests unitarios de lib.ts.
 * Ejecutar: npx vitest run supabase/functions/merchant-mp-webhook/lib.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  parseWebhookNotification,
  isValidOrderIdHint,
  isKnownMpPaymentStatus,
  parseExternalReference,
  validateReferenceMatch,
  amountsMatch,
  isNonRetryableRpcError,
} from './lib';

const BUSINESS_ID = '22222222-2222-2222-2222-222222222222';
const ORDER_ID = '33333333-3333-3333-3333-333333333333';
const OTHER_ORDER_ID = '99999999-9999-9999-9999-999999999999';

describe('parseWebhookNotification', () => {
  it('type=payment con data.id -> ok', () => {
    expect(parseWebhookNotification({ type: 'payment', data: { id: '12345' } })).toEqual({ dataId: '12345' });
  });
  it('type=payment con data.id numérico -> se convierte a string', () => {
    expect(parseWebhookNotification({ type: 'payment', data: { id: 12345 } })).toEqual({ dataId: '12345' });
  });
  it('type distinto de payment (incluye merchant_order, no soportado en esta fase) -> null', () => {
    expect(parseWebhookNotification({ type: 'merchant_order', data: { id: '1' } })).toBeNull();
    expect(parseWebhookNotification({ type: 'topic_merchant_order_wh', data: { id: '1' } })).toBeNull();
  });
  it('sin data.id -> null', () => {
    expect(parseWebhookNotification({ type: 'payment', data: {} })).toBeNull();
    expect(parseWebhookNotification({ type: 'payment' })).toBeNull();
  });
  it('body vacío/malformado -> null', () => {
    expect(parseWebhookNotification({})).toBeNull();
    expect(parseWebhookNotification(null)).toBeNull();
  });
});

describe('isValidOrderIdHint', () => {
  it('UUID válido -> true', () => {
    expect(isValidOrderIdHint(ORDER_ID)).toBe(true);
  });
  it('null / no-UUID -> false', () => {
    expect(isValidOrderIdHint(null)).toBe(false);
    expect(isValidOrderIdHint('no-es-un-uuid')).toBe(false);
    expect(isValidOrderIdHint('')).toBe(false);
  });
});

describe('isKnownMpPaymentStatus', () => {
  it('acepta el vocabulario real de la Payments API de MP', () => {
    for (const s of ['pending', 'approved', 'authorized', 'in_process', 'in_mediation', 'rejected', 'cancelled', 'refunded', 'charged_back']) {
      expect(isKnownMpPaymentStatus(s)).toBe(true);
    }
  });
  it('rechaza un status inventado', () => {
    expect(isKnownMpPaymentStatus('inventado')).toBe(false);
    expect(isKnownMpPaymentStatus('')).toBe(false);
  });
});

describe('parseExternalReference — formato estricto walinka:merchant:<business_id>:<order_id>', () => {
  it('formato correcto -> parsea business_id/order_id', () => {
    expect(parseExternalReference(`walinka:merchant:${BUSINESS_ID}:${ORDER_ID}`)).toEqual({ businessId: BUSINESS_ID, orderId: ORDER_ID });
  });
  it('formato de billing (waP:...) -> null, nunca se confunde con merchant', () => {
    expect(parseExternalReference(`waP:${ORDER_ID}:${BUSINESS_ID}:pro`)).toBeNull();
  });
  it('formato legado de billing (businessId:planSlug) -> null', () => {
    expect(parseExternalReference(`${BUSINESS_ID}:pro`)).toBeNull();
  });
  it('malformada (ids no son UUID) -> null', () => {
    expect(parseExternalReference('walinka:merchant:no-es-uuid:tampoco')).toBeNull();
  });
  it('null/undefined/vacío -> null', () => {
    expect(parseExternalReference(null)).toBeNull();
    expect(parseExternalReference(undefined)).toBeNull();
    expect(parseExternalReference('')).toBeNull();
  });
  it('prefijo correcto pero con basura extra -> null (match exacto, no parcial)', () => {
    expect(parseExternalReference(`walinka:merchant:${BUSINESS_ID}:${ORDER_ID}:extra`)).toBeNull();
    expect(parseExternalReference(`xwalinka:merchant:${BUSINESS_ID}:${ORDER_ID}`)).toBeNull();
  });
});

describe('validateReferenceMatch', () => {
  const parsed = { businessId: BUSINESS_ID, orderId: ORDER_ID };
  it('coincide business_id y order_id -> true', () => {
    expect(validateReferenceMatch(parsed, BUSINESS_ID, ORDER_ID)).toBe(true);
  });
  it('order_id no coincide (referencia de otro pedido) -> false', () => {
    expect(validateReferenceMatch(parsed, BUSINESS_ID, OTHER_ORDER_ID)).toBe(false);
  });
  it('business_id no coincide (referencia de otro negocio) -> false', () => {
    expect(validateReferenceMatch(parsed, '11111111-1111-1111-1111-111111111111', ORDER_ID)).toBe(false);
  });
});

describe('amountsMatch — sin drift de punto flotante', () => {
  it('montos exactamente iguales -> true', () => {
    expect(amountsMatch(1990, 1990)).toBe(true);
    expect(amountsMatch(19.9, 19.9)).toBe(true);
  });
  it('montos distintos -> false (detecta manipulación)', () => {
    expect(amountsMatch(1990, 1)).toBe(false);
    expect(amountsMatch(100, 100.01)).toBe(false);
  });
  it('NaN/Infinity -> false, nunca pasa por accidente', () => {
    expect(amountsMatch(NaN, 100)).toBe(false);
    expect(amountsMatch(100, NaN)).toBe(false);
    expect(amountsMatch(Infinity, Infinity)).toBe(false);
  });
  it('suma de decimales que en float puro fallaría (0.1+0.2 style) -> compara correctamente', () => {
    expect(amountsMatch(0.1 + 0.2, 0.3)).toBe(true);
  });
});

describe('isNonRetryableRpcError', () => {
  it('reconoce los 3 códigos no-reintentables de la RPC', () => {
    expect(isNonRetryableRpcError('AMOUNT_CURRENCY_MISMATCH')).toBe(true);
    expect(isNonRetryableRpcError('ORDER_BUSINESS_MISMATCH')).toBe(true);
    expect(isNonRetryableRpcError('MISSING_REQUIRED_PARAMETER')).toBe(true);
  });
  it('cualquier otro mensaje (fallo transitorio real) -> false, se debe reintentar', () => {
    expect(isNonRetryableRpcError('connection refused')).toBe(false);
    expect(isNonRetryableRpcError('timeout')).toBe(false);
  });
  it('null/undefined -> false', () => {
    expect(isNonRetryableRpcError(null)).toBe(false);
    expect(isNonRetryableRpcError(undefined)).toBe(false);
  });
});
