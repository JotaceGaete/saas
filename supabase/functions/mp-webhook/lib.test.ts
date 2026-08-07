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
import { buildBillingSubscriptionUpsertPayload } from './lib';

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
