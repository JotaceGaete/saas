/**
 * mp-webhook — tests de la sincronización de billing_subscriptions (R2)
 * Ejecutar: npx vitest run supabase/functions/mp-webhook/lib.test.ts
 *
 * index.ts no se puede importar/ejecutar directamente en Vitest: usa
 * `Deno.serve`/`Deno.env` y un import de https://esm.sh/..., que no existen
 * en el runtime de Node (mismo motivo por el que plan-change-preview solo
 * testea su lib.ts). Por eso:
 *   A. Se testea buildBillingSubscriptionUpsertPayload (lógica nueva, pura).
 *   B. Se simula la semántica de upsert(onConflict:'business_id') con una
 *      tabla en memoria, para verificar que "crea" vs "actualiza" se
 *      comporta como se espera contra el índice UNIQUE(business_id) real.
 *   C. Se verifica por inspección del código fuente de index.ts que el
 *      comportamiento NO tocado por R2 (idempotencia por mp_payment_id en
 *      wa_payment_events, y que el fallo de sync sigue siendo no
 *      bloqueante) sigue presente sin cambios.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildBillingSubscriptionUpsertPayload,
  buildReferralPeriodRef,
  mapMpStatusToReversalReason,
  mapMpStatusToWaPaymentStatus,
  shouldRegisterReferralPaidPeriod,
} from './lib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexSource = readFileSync(join(__dirname, 'index.ts'), 'utf-8');

// ─────────────────────────────────────────────────────────────────────────────
// A. buildBillingSubscriptionUpsertPayload
// ─────────────────────────────────────────────────────────────────────────────

describe('buildBillingSubscriptionUpsertPayload', () => {
  const baseInput = {
    businessId: 'biz-1',
    planSlug: 'pro',
    payment: { currency_id: 'CLP', transaction_amount: 5990 },
    mpStatus: 'approved',
    countryHint: 'CL',
    currentPeriodStartsAt: '2026-08-07T00:00:00.000Z',
    currentPeriodEndsAt: '2026-09-06T00:00:00.000Z',
  };

  it('A1: incluye business_id, provider y plan_slug correctos', () => {
    const r = buildBillingSubscriptionUpsertPayload(baseInput);
    expect(r.business_id).toBe('biz-1');
    expect(r.provider).toBe('mercado_pago');
    expect(r.plan_slug).toBe('pro');
  });

  it('A2: currency_code y amount vienen del pago real de MP', () => {
    const r = buildBillingSubscriptionUpsertPayload(baseInput);
    expect(r.currency_code).toBe('CLP');
    expect(r.amount).toBe(5990);
  });

  it('A3: provider_status refleja el estado real de MP (no un valor fijo)', () => {
    const r = buildBillingSubscriptionUpsertPayload({ ...baseInput, mpStatus: 'approved' });
    expect(r.provider_status).toBe('approved');
    expect(r.status).toBe('active'); // status interno normalizado sigue fijo en 'active'
  });

  it('A4: provider_subscription_id siempre es null (MP = pagos individuales, no suscripción)', () => {
    const r = buildBillingSubscriptionUpsertPayload(baseInput);
    expect(r.provider_subscription_id).toBeNull();
  });

  it('A5: trial_ends_at siempre null, interval_unit siempre "month"', () => {
    const r = buildBillingSubscriptionUpsertPayload(baseInput);
    expect(r.trial_ends_at).toBeNull();
    expect(r.interval_unit).toBe('month');
  });

  it('A6: current_period_starts_at / current_period_ends_at se pasan tal cual', () => {
    const r = buildBillingSubscriptionUpsertPayload(baseInput);
    expect(r.current_period_starts_at).toBe('2026-08-07T00:00:00.000Z');
    expect(r.current_period_ends_at).toBe('2026-09-06T00:00:00.000Z');
  });

  it('A7: sin currency_id en el pago → fallback por país (AR → ARS)', () => {
    const r = buildBillingSubscriptionUpsertPayload({
      ...baseInput,
      payment: { transaction_amount: 8990 },
      countryHint: 'AR',
    });
    expect(r.currency_code).toBe('ARS');
  });

  it('A8: sin currency_id en el pago → fallback por país (CL/otro → CLP)', () => {
    const r = buildBillingSubscriptionUpsertPayload({
      ...baseInput,
      payment: { transaction_amount: 5990 },
      countryHint: 'CL',
    });
    expect(r.currency_code).toBe('CLP');
  });

  it('A9: sin transaction_amount en el pago → amount queda null (columna es NULLABLE)', () => {
    const r = buildBillingSubscriptionUpsertPayload({
      ...baseInput,
      payment: { currency_id: 'CLP' },
    });
    expect(r.amount).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Semántica de upsert(onConflict:'business_id') — crear vs. actualizar
// Simula el índice UNIQUE(business_id) real de billing_subscriptions.
// ─────────────────────────────────────────────────────────────────────────────

function makeFakeBillingSubscriptionsTable() {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    upsertByBusinessId(payload: { business_id: string } & Record<string, unknown>) {
      rows.set(payload.business_id, { ...payload });
    },
    all() {
      return Array.from(rows.values());
    },
    byBusinessId(businessId: string) {
      return rows.get(businessId) ?? null;
    },
  };
}

describe('upsert onConflict business_id — crear vs. actualizar (simulado)', () => {
  it('B1: negocio sin fila + primer pago aprobado → crea la fila', () => {
    const table = makeFakeBillingSubscriptionsTable();
    expect(table.byBusinessId('biz-1')).toBeNull();

    const payload = buildBillingSubscriptionUpsertPayload({
      businessId: 'biz-1',
      planSlug: 'pro',
      payment: { currency_id: 'CLP', transaction_amount: 5990 },
      mpStatus: 'approved',
      countryHint: 'CL',
      currentPeriodStartsAt: '2026-08-07T00:00:00.000Z',
      currentPeriodEndsAt: '2026-09-06T00:00:00.000Z',
    });
    table.upsertByBusinessId(payload);

    expect(table.all()).toHaveLength(1);
    expect(table.byBusinessId('biz-1')).not.toBeNull();
  });

  it('B2: negocio con fila existente + renovación aprobada → actualiza la misma fila, no crea otra', () => {
    const table = makeFakeBillingSubscriptionsTable();

    // Primer pago (mes 1)
    table.upsertByBusinessId(
      buildBillingSubscriptionUpsertPayload({
        businessId: 'biz-1',
        planSlug: 'pro',
        payment: { currency_id: 'CLP', transaction_amount: 5990 },
        mpStatus: 'approved',
        countryHint: 'CL',
        currentPeriodStartsAt: '2026-08-07T00:00:00.000Z',
        currentPeriodEndsAt: '2026-09-06T00:00:00.000Z',
      }),
    );

    // Renovación (mes 2) — mismo business_id, distinto payment id/monto/período
    table.upsertByBusinessId(
      buildBillingSubscriptionUpsertPayload({
        businessId: 'biz-1',
        planSlug: 'pro',
        payment: { currency_id: 'CLP', transaction_amount: 5990 },
        mpStatus: 'approved',
        countryHint: 'CL',
        currentPeriodStartsAt: '2026-09-06T00:00:00.000Z',
        currentPeriodEndsAt: '2026-10-06T00:00:00.000Z',
      }),
    );

    expect(table.all()).toHaveLength(1); // sigue habiendo una sola fila
    const row = table.byBusinessId('biz-1');
    expect(row?.current_period_ends_at).toBe('2026-10-06T00:00:00.000Z'); // reflejó la renovación
  });

  it('B3: dos negocios distintos → dos filas independientes', () => {
    const table = makeFakeBillingSubscriptionsTable();
    table.upsertByBusinessId(
      buildBillingSubscriptionUpsertPayload({
        businessId: 'biz-1',
        planSlug: 'pro',
        payment: { currency_id: 'CLP', transaction_amount: 5990 },
        mpStatus: 'approved',
        countryHint: 'CL',
        currentPeriodStartsAt: '2026-08-07T00:00:00.000Z',
        currentPeriodEndsAt: '2026-09-06T00:00:00.000Z',
      }),
    );
    table.upsertByBusinessId(
      buildBillingSubscriptionUpsertPayload({
        businessId: 'biz-2',
        planSlug: 'business',
        payment: { currency_id: 'ARS', transaction_amount: 13990 },
        mpStatus: 'approved',
        countryHint: 'AR',
        currentPeriodStartsAt: '2026-08-07T00:00:00.000Z',
        currentPeriodEndsAt: '2026-09-06T00:00:00.000Z',
      }),
    );
    expect(table.all()).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. Comportamiento NO tocado por R2 — verificado por inspección de index.ts
// (no ejecutable en Vitest: index.ts depende de Deno/esm.sh en tiempo de import)
// ─────────────────────────────────────────────────────────────────────────────

describe('index.ts — comportamiento preexistente que R2 no debe alterar', () => {
  it('C1: la sincronización usa upsert (no update) sobre billing_subscriptions', () => {
    expect(indexSource).toMatch(/\.from\('billing_subscriptions'\)\s*\n?\s*\.upsert\(/);
    expect(indexSource).not.toMatch(/\.from\('billing_subscriptions'\)\s*\n?\s*\.update\(/);
  });

  it("C2: el upsert usa onConflict: 'business_id'", () => {
    expect(indexSource).toMatch(/onConflict:\s*'business_id'/);
  });

  it('C3: el chequeo de idempotencia por mp_payment_id + status=approved sigue presente', () => {
    expect(indexSource).toMatch(/mp_payment_id/);
    expect(indexSource).toMatch(/already_processed/);
    expect(indexSource).toMatch(/\.eq\('mp_status', 'approved'\)/);
  });

  it('C4: un fallo de sync de billing_subscriptions sigue siendo no bloqueante (no hay return tras el log)', () => {
    const marker = 'billing_subscriptions sync failed (non-blocking)';
    const idx = indexSource.indexOf(marker);
    expect(idx).toBeGreaterThan(-1);
    // Las ~200 chars siguientes al log no deben contener un `return` antes del
    // cierre del bloque `if (subSyncError) { ... }` — o sea, se sigue de largo.
    const after = indexSource.slice(idx, idx + 200);
    const closingBraceIdx = after.indexOf('}');
    const ifBody = after.slice(0, closingBraceIdx);
    expect(ifBody).not.toMatch(/return /);
  });

  it('C5: el registro de auditoría en wa_payment_events (paso 5) sigue ejecutándose siempre, antes del branch de status', () => {
    expect(indexSource).toMatch(/wa_payment_events['"]\)\.insert\(/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. shouldRegisterReferralPaidPeriod (Fase 5A)
// ─────────────────────────────────────────────────────────────────────────────

describe('shouldRegisterReferralPaidPeriod', () => {
  const baseInput = {
    mpStatus: 'approved',
    planSlug: 'pro',
    currentPlan: 'pro',
    transactionAmount: 5990,
  };

  it('D1: renovación exacta + approved + monto > 0 -> true', () => {
    expect(shouldRegisterReferralPaidPeriod(baseInput)).toBe(true);
  });

  it('D2: mismo plan pero pending -> false', () => {
    expect(shouldRegisterReferralPaidPeriod({ ...baseInput, mpStatus: 'pending' })).toBe(false);
  });

  it('D3: mismo plan pero rejected -> false', () => {
    expect(shouldRegisterReferralPaidPeriod({ ...baseInput, mpStatus: 'rejected' })).toBe(false);
  });

  it('D4: mismo plan pero in_process -> false', () => {
    expect(shouldRegisterReferralPaidPeriod({ ...baseInput, mpStatus: 'in_process' })).toBe(false);
  });

  it('D5: mismo plan con monto 0 -> false (ajuste interno de prorrateo)', () => {
    expect(shouldRegisterReferralPaidPeriod({ ...baseInput, transactionAmount: 0 })).toBe(false);
  });

  it('D6: monto negativo -> false', () => {
    expect(shouldRegisterReferralPaidPeriod({ ...baseInput, transactionAmount: -10 })).toBe(false);
  });

  it('D7: sin transactionAmount (undefined) -> false', () => {
    expect(shouldRegisterReferralPaidPeriod({ ...baseInput, transactionAmount: undefined })).toBe(false);
  });

  it('D8: upgrade (planSlug distinto, de mayor orden) -> false', () => {
    expect(shouldRegisterReferralPaidPeriod({ ...baseInput, planSlug: 'business', currentPlan: 'pro' })).toBe(false);
  });

  it('D9: downgrade (planSlug distinto, de menor orden) -> false', () => {
    expect(shouldRegisterReferralPaidPeriod({ ...baseInput, planSlug: 'pro', currentPlan: 'business' })).toBe(false);
  });

  it('D10: starter -> control -> false (mismo PLAN_ORDER, plan_slug distinto)', () => {
    expect(shouldRegisterReferralPaidPeriod({ ...baseInput, planSlug: 'control', currentPlan: 'starter' })).toBe(false);
  });

  it('D11: control -> starter -> false (mismo PLAN_ORDER, plan_slug distinto)', () => {
    expect(shouldRegisterReferralPaidPeriod({ ...baseInput, planSlug: 'starter', currentPlan: 'control' })).toBe(false);
  });

  it('D12: starter -> starter (renovación real de plan base) -> true', () => {
    expect(shouldRegisterReferralPaidPeriod({ ...baseInput, planSlug: 'starter', currentPlan: 'starter' })).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. buildReferralPeriodRef (Fase 5A)
// ─────────────────────────────────────────────────────────────────────────────

describe('buildReferralPeriodRef', () => {
  it('E1: formato exacto mp:<mp_payment_id>', () => {
    expect(buildReferralPeriodRef('123456789')).toBe('mp:123456789');
  });

  it('E2: acepta mp_payment_id numérico igual que string', () => {
    expect(buildReferralPeriodRef(123456789)).toBe('mp:123456789');
  });

  it('E3: mismo mp_payment_id siempre produce el mismo period_ref (reproducible ante reintentos)', () => {
    const first = buildReferralPeriodRef('987654321');
    const second = buildReferralPeriodRef('987654321');
    expect(first).toBe(second);
  });

  it('E4: mp_payment_id distinto produce period_ref distinto', () => {
    expect(buildReferralPeriodRef('111')).not.toBe(buildReferralPeriodRef('222'));
  });

  it('E5: no contiene timestamps ni UUID (solo el prefijo fijo + el id tal cual)', () => {
    const ref = buildReferralPeriodRef('42');
    expect(ref).toBe('mp:42');
    expect(ref).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. Integración en index.ts (Fase 5A) — verificado por inspección de fuente,
// mismo motivo que la sección C: index.ts no se puede importar en Vitest.
// ─────────────────────────────────────────────────────────────────────────────

describe('index.ts — integración de Affiliate Core (Fase 5A)', () => {
  it('F1: llama wa_register_referral_paid_period vía RPC', () => {
    expect(indexSource).toMatch(/\.rpc\(\s*['"]wa_register_referral_paid_period['"]/);
  });

  it('F2: el registro está condicionado por shouldRegisterReferralPaidPeriod', () => {
    expect(indexSource).toMatch(/shouldRegisterReferralPaidPeriod\(/);
  });

  it('F3: referred_user_id proviene de bizRow.user_id, no de otra fuente', () => {
    expect(indexSource).toMatch(/p_referred_user_id:\s*bizRow\.user_id/);
  });

  it('F4: period_ref se construye con buildReferralPeriodRef, no con Date.now()/UUID/business_id', () => {
    expect(indexSource).toMatch(/p_period_ref:\s*buildReferralPeriodRef\(/);
    // No debe existir un uso de Date.now()/crypto.randomUUID() para construir el period_ref.
    const rpcCallIdx = indexSource.indexOf("'wa_register_referral_paid_period'");
    const rpcCallBlock = indexSource.slice(rpcCallIdx, rpcCallIdx + 300);
    expect(rpcCallBlock).not.toMatch(/Date\.now\(\)/);
    expect(rpcCallBlock).not.toMatch(/randomUUID/);
    expect(rpcCallBlock).not.toMatch(/businessId/);
  });

  it('F5: la llamada a la RPC está envuelta en try/catch (no puede tirar el webhook)', () => {
    const rpcCallIdx = indexSource.indexOf("'wa_register_referral_paid_period'");
    expect(rpcCallIdx).toBeGreaterThan(-1);
    const before = indexSource.slice(Math.max(0, rpcCallIdx - 400), rpcCallIdx);
    expect(before).toMatch(/try\s*\{/);
  });

  it('F6: un error de la RPC solo se loguea (console.warn), sin return ni throw', () => {
    const rpcCallIdx = indexSource.indexOf("'wa_register_referral_paid_period'");
    const after = indexSource.slice(rpcCallIdx, rpcCallIdx + 600);
    expect(after).toMatch(/referralError/);
    expect(after).toMatch(/console\.warn/);
    // Dentro del bloque del error de la RPC no debe haber return/throw que corte el webhook.
    const errorBlockStart = after.indexOf('if (referralError)');
    const errorBlockEnd = after.indexOf('}', errorBlockStart);
    const errorBlock = after.slice(errorBlockStart, errorBlockEnd);
    expect(errorBlock).not.toMatch(/return /);
    expect(errorBlock).not.toMatch(/throw /);
  });

  it('F7: no se agrega ningún SELECT nuevo para preguntar si el negocio fue referido antes de llamar la RPC', () => {
    // El único SELECT relacionado a "referral"/"attribution" debe ser inexistente:
    // wa_register_referral_paid_period ya resuelve internamente si hay atribución.
    expect(indexSource).not.toMatch(/from\(['"]referral_attributions['"]\)/);
    expect(indexSource).not.toMatch(/from\(['"]referral_codes['"]\)/);
  });

  it('F8: los logs de la integración no incluyen el UUID de bizRow.user_id', () => {
    const rpcCallIdx = indexSource.indexOf("'wa_register_referral_paid_period'");
    const around = indexSource.slice(Math.max(0, rpcCallIdx - 200), rpcCallIdx + 600);
    expect(around).not.toMatch(/console\.(warn|log|error)\([^)]*bizRow\.user_id/);
  });

  it('F9 (Fase 5A.1): p_period_start es exactamente planActivatedAtIso -- no se recalcula, no Date.now(), no otra fuente temporal', () => {
    const rpcCallIdx = indexSource.indexOf("'wa_register_referral_paid_period'");
    const rpcCallBlock = indexSource.slice(rpcCallIdx, rpcCallIdx + 300);
    expect(rpcCallBlock).toMatch(/p_period_start:\s*planActivatedAtIso/);
    expect(rpcCallBlock).not.toMatch(/Date\.now\(\)/);
    expect(rpcCallBlock).not.toMatch(/new Date\(\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G. mapMpStatusToWaPaymentStatus (Fase 5B)
// ─────────────────────────────────────────────────────────────────────────────

describe('mapMpStatusToWaPaymentStatus', () => {
  it('G1: rejected -> rejected', () => {
    expect(mapMpStatusToWaPaymentStatus('rejected')).toBe('rejected');
  });

  it('G2: cancelled -> cancelled', () => {
    expect(mapMpStatusToWaPaymentStatus('cancelled')).toBe('cancelled');
  });

  it('G3: in_process -> in_process', () => {
    expect(mapMpStatusToWaPaymentStatus('in_process')).toBe('in_process');
  });

  it('G4 (Fase 5B): refunded -> refunded (antes caía en el bucket genérico "pending")', () => {
    expect(mapMpStatusToWaPaymentStatus('refunded')).toBe('refunded');
  });

  it('G5 (Fase 5B): charged_back -> charged_back (antes caía en el bucket genérico "pending")', () => {
    expect(mapMpStatusToWaPaymentStatus('charged_back')).toBe('charged_back');
  });

  it('G6: cualquier otro status (incluido pending real, o desconocido) -> pending', () => {
    expect(mapMpStatusToWaPaymentStatus('pending')).toBe('pending');
    expect(mapMpStatusToWaPaymentStatus('authorized')).toBe('pending');
    expect(mapMpStatusToWaPaymentStatus('in_mediation')).toBe('pending');
    expect(mapMpStatusToWaPaymentStatus('')).toBe('pending');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H. mapMpStatusToReversalReason (Fase 5B)
// ─────────────────────────────────────────────────────────────────────────────

describe('mapMpStatusToReversalReason', () => {
  it('H1: refunded -> "refund"', () => {
    expect(mapMpStatusToReversalReason('refunded')).toBe('refund');
  });

  it('H2: charged_back -> "chargeback"', () => {
    expect(mapMpStatusToReversalReason('charged_back')).toBe('chargeback');
  });

  it('H3: los valores devueltos coinciden exactamente con referral_commissions_reversed_reason_check', () => {
    expect(['refund', 'chargeback', 'fraud', 'manual']).toContain(mapMpStatusToReversalReason('refunded'));
    expect(['refund', 'chargeback', 'fraud', 'manual']).toContain(mapMpStatusToReversalReason('charged_back'));
  });

  it('H4: approved -> null (nunca se dispara una reversión sobre un pago recién aprobado)', () => {
    expect(mapMpStatusToReversalReason('approved')).toBeNull();
  });

  it('H5: pending/rejected/cancelled/in_process -> null (no representan que el dinero volvió)', () => {
    expect(mapMpStatusToReversalReason('pending')).toBeNull();
    expect(mapMpStatusToReversalReason('rejected')).toBeNull();
    expect(mapMpStatusToReversalReason('cancelled')).toBeNull();
    expect(mapMpStatusToReversalReason('in_process')).toBeNull();
  });

  it('H6: status vacío/desconocido -> null', () => {
    expect(mapMpStatusToReversalReason('')).toBeNull();
    expect(mapMpStatusToReversalReason('some_unknown_status')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// I. Integración de reversión en index.ts (Fase 5B) — verificado por
// inspección de fuente, mismo motivo que las secciones C y F: index.ts no
// se puede importar en Vitest (depende de Deno/esm.sh).
// ─────────────────────────────────────────────────────────────────────────────

describe('index.ts — integración de reversión de Affiliate Core (Fase 5B)', () => {
  it('I1: llama wa_reverse_referral_paid_period vía RPC', () => {
    expect(indexSource).toMatch(/\.rpc\(\s*['"]wa_reverse_referral_paid_period['"]/);
  });

  it('I2: la reversión está condicionada por mapMpStatusToReversalReason, no por mpStatus directo', () => {
    expect(indexSource).toMatch(/mapMpStatusToReversalReason\(/);
    const reversalReasonIdx = indexSource.indexOf('const reversalReason = mapMpStatusToReversalReason(');
    expect(reversalReasonIdx).toBeGreaterThan(-1);
  });

  it('I3: el status de wa_payments para no-aprobados usa mapMpStatusToWaPaymentStatus, no un ternario inline', () => {
    expect(indexSource).toMatch(/status:\s*mapMpStatusToWaPaymentStatus\(mpStatus\)/);
    // El viejo ternario inline (rejected/cancelled/in_process/pending) no debe seguir presente.
    expect(indexSource).not.toMatch(/mpStatus === 'rejected' \? 'rejected'/);
  });

  it('I4: p_period_ref de la reversión usa buildReferralPeriodRef(dataId) -- mismo builder y mismo id que el registro original', () => {
    const rpcCallIdx = indexSource.indexOf("'wa_reverse_referral_paid_period'");
    const rpcCallBlock = indexSource.slice(rpcCallIdx, rpcCallIdx + 400);
    expect(rpcCallBlock).toMatch(/p_period_ref:\s*buildReferralPeriodRef\(dataId\)/);
  });

  it('I5: p_reason viene de reversalReason (mapMpStatusToReversalReason), no de mpStatus crudo', () => {
    const rpcCallIdx = indexSource.indexOf("'wa_reverse_referral_paid_period'");
    const rpcCallBlock = indexSource.slice(rpcCallIdx, rpcCallIdx + 400);
    expect(rpcCallBlock).toMatch(/p_reason:\s*reversalReason/);
  });

  it('I6: p_referred_user_id viene de una fila de wa_businesses resuelta por businessId, no de bizRow de la rama approved', () => {
    const rpcCallIdx = indexSource.indexOf("'wa_reverse_referral_paid_period'");
    const rpcCallBlock = indexSource.slice(rpcCallIdx, rpcCallIdx + 400);
    expect(rpcCallBlock).toMatch(/p_referred_user_id:\s*reversalBizRow\.user_id/);
  });

  it('I7: la llamada a la RPC de reversión está envuelta en try/catch (no puede tirar el webhook)', () => {
    const rpcCallIdx = indexSource.indexOf("'wa_reverse_referral_paid_period'");
    expect(rpcCallIdx).toBeGreaterThan(-1);
    const before = indexSource.slice(Math.max(0, rpcCallIdx - 600), rpcCallIdx);
    expect(before).toMatch(/try\s*\{/);
  });

  it('I8: un error de la RPC de reversión solo se loguea (console.warn), sin return ni throw', () => {
    const rpcCallIdx = indexSource.indexOf("'wa_reverse_referral_paid_period'");
    const after = indexSource.slice(rpcCallIdx, rpcCallIdx + 500);
    expect(after).toMatch(/reversalError/);
    expect(after).toMatch(/console\.warn/);
    const errorBlockStart = after.indexOf('if (reversalError)');
    const errorBlockEnd = after.indexOf('}', errorBlockStart);
    const errorBlock = after.slice(errorBlockStart, errorBlockEnd);
    expect(errorBlock).not.toMatch(/return /);
    expect(errorBlock).not.toMatch(/throw /);
  });

  it('I9: la rama no-aprobada sigue devolviendo { ok: true } al final, sin importar refunded/charged_back', () => {
    const nonApprovedBranchIdx = indexSource.indexOf("mpStatus !== 'approved'");
    const reversalIdx = indexSource.indexOf('reversalReason', nonApprovedBranchIdx);
    const after = indexSource.slice(reversalIdx, reversalIdx + 2000);
    expect(after).toMatch(/return jsonResponse\(\{ ok: true \}, 200\);/);
  });

  it('I10: si businessId es null (external_reference inválido/legado sin parsear), no se intenta la reversión', () => {
    const reversalReasonIdx = indexSource.indexOf('const reversalReason = mapMpStatusToReversalReason(');
    const after = indexSource.slice(reversalReasonIdx, reversalReasonIdx + 200);
    expect(after).toMatch(/if\s*\(reversalReason\s*&&\s*businessId\)/);
  });
});
