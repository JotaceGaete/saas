/**
 * plan-change-preview — batería de tests unitarios
 * Ejecutar: npx vitest run supabase/functions/plan-change-preview/lib.test.ts
 *
 * Cubre:
 *   A. computePlanChange (CL/AR — con prorrateo)
 *   B. buildIntlUsdPreview (INTL/USD — sin prorrateo)
 *   C. applyTrialOverride
 *   D. resolveBusinessCountryCode
 *   E. resolveUseIntlUsd / getPlanCatalog
 *   F. Casos edge y detección de bugs
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  computePlanChange,
  buildIntlUsdPreview,
  applyTrialOverride,
  resolveBusinessCountryCode,
  resolveUseIntlUsd,
  getPlanCatalog,
  parseSafeDate,
  PLAN_CATALOG_CL,
  PLAN_CATALOG_AR,
  MS_PER_DAY,
  type PlanChangeResult,
} from './lib';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de fecha
// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-04-02T12:00:00.000Z').getTime();
const daysFromNow = (d: number) => new Date(NOW + d * MS_PER_DAY).toISOString();
const daysAgo = (d: number) => new Date(NOW - d * MS_PER_DAY).toISOString();

// Fija toda la API de Date (Date.now() y new Date()) para resultados deterministas
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

// ─────────────────────────────────────────────────────────────────────────────
// A. computePlanChange — CLP/ARS con prorrateo
// ─────────────────────────────────────────────────────────────────────────────

describe('computePlanChange', () => {

  // ── A1. Sin suscripción (planExpiresAt = null) ──────────────────────────────

  describe('sin suscripción activa (planExpiresAt = null)', () => {

    it('A1-a: starter → pro CL — cobra precio completo, sin crédito', () => {
      const r = computePlanChange('starter', null, 'pro', PLAN_CATALOG_CL);
      expect(r.changeType).toBe('upgrade');
      expect(r.creditAmount).toBe(0);
      expect(r.finalAmount).toBe(5990);
      expect(r.daysRemaining).toBe(0);
      expect(r.currentPlanPrice).toBe(0);
      expect(r.targetPlanPrice).toBe(5990);
      // explanation: starter.price=0, condición `currentPlanPrice > 0` falla → creditAmount=0
    });

    it('A1-b: starter → business CL — cobra precio completo', () => {
      const r = computePlanChange('starter', null, 'business', PLAN_CATALOG_CL);
      expect(r.changeType).toBe('upgrade');
      expect(r.creditAmount).toBe(0);
      expect(r.finalAmount).toBe(9990);
    });

    it('A1-c: starter → pro AR — cobra precio completo ARS', () => {
      const r = computePlanChange('starter', null, 'pro', PLAN_CATALOG_AR);
      expect(r.creditAmount).toBe(0);
      expect(r.finalAmount).toBe(8990);
      expect(r.targetPlanPrice).toBe(8990);
    });

    it('A1-d: pro → business CL sin planExpiresAt — sin crédito', () => {
      const r = computePlanChange('pro', null, 'business', PLAN_CATALOG_CL);
      expect(r.changeType).toBe('upgrade');
      expect(r.daysRemaining).toBe(0);
      expect(r.creditAmount).toBe(0);
      expect(r.finalAmount).toBe(9990);
      // effectiveAt debe ser now (no hay fecha de vencimiento)
      expect(r.effectiveAt).toBe(new Date(NOW).toISOString());
    });

  });

  // ── A2. Plan pagado activo — prorrateo ──────────────────────────────────────

  describe('plan pagado activo (prorrateo CL)', () => {

    it('A2-a: pro → business CL, 15 días restantes', () => {
      // credit = floor((5990/30) * 15) = floor(2995) = 2995
      // final  = floor(9990 - 2995) = 6995
      const r = computePlanChange('pro', daysFromNow(15), 'business', PLAN_CATALOG_CL);
      expect(r.changeType).toBe('upgrade');
      expect(r.daysRemaining).toBe(15);
      expect(r.creditAmount).toBe(2995);
      expect(r.finalAmount).toBe(6995);
      expect(r.effectiveAt).toBe(daysFromNow(15));
    });

    it('A2-b: pro → business CL, 30 días restantes (período completo)', () => {
      // credit = floor((5990/30) * 30) = 5990
      // final  = floor(9990 - 5990) = 4000
      const r = computePlanChange('pro', daysFromNow(30), 'business', PLAN_CATALOG_CL);
      expect(r.creditAmount).toBe(5990);
      expect(r.finalAmount).toBe(4000);
      expect(r.daysRemaining).toBe(30);
    });

    it('A2-c: pro → business CL, 35 días restantes — crédito clampeado a 30 días', () => {
      // remainingDaysFraction = min(35, 30) = 30 → mismo resultado que 30 días
      const r = computePlanChange('pro', daysFromNow(35), 'business', PLAN_CATALOG_CL);
      expect(r.daysRemaining).toBe(30);
      expect(r.creditAmount).toBe(5990);
      expect(r.finalAmount).toBe(4000);
    });

    it('A2-d: pro → business CL, 0.5 días restantes (12 horas)', () => {
      // remainingMs = 12h = 0.5 * MS_PER_DAY
      // remainingDaysFraction ≈ 0.5
      // credit = floor((5990/30) * 0.5) = floor(99.83) = 99
      // final  = floor(9990 - 99) = 9891
      const halfDay = new Date(NOW + 12 * 60 * 60 * 1000).toISOString();
      const r = computePlanChange('pro', halfDay, 'business', PLAN_CATALOG_CL);
      expect(r.daysRemaining).toBe(0);
      expect(r.creditAmount).toBe(99);
      expect(r.finalAmount).toBe(9891);
    });

    it('A2-e: pro → business AR, 20 días restantes', () => {
      // credit = floor((8990/30) * 20) = floor(5993.33) = 5993
      // final  = floor(13990 - 5993) = 7997
      const r = computePlanChange('pro', daysFromNow(20), 'business', PLAN_CATALOG_AR);
      expect(r.changeType).toBe('upgrade');
      expect(r.creditAmount).toBe(5993);
      expect(r.finalAmount).toBe(7997);
    });

    it('A2-f: pro → business AR, 1 día restante', () => {
      // credit = floor((8990/30) * 1) = floor(299.67) = 299
      // final  = floor(13990 - 299) = 13691
      const r = computePlanChange('pro', daysFromNow(1), 'business', PLAN_CATALOG_AR);
      expect(r.creditAmount).toBe(299);
      expect(r.finalAmount).toBe(13691);
    });

    it('A2-g: crédito nunca supera precio del plan actual (clamp)', () => {
      // Con >30 días, credit = currentPlanPrice. Nunca puede ser mayor.
      const r = computePlanChange('pro', daysFromNow(60), 'business', PLAN_CATALOG_CL);
      expect(r.creditAmount).toBeLessThanOrEqual(PLAN_CATALOG_CL.pro.price);
    });

    it('A2-h: finalAmount nunca es negativo', () => {
      const r = computePlanChange('business', daysFromNow(30), 'pro', PLAN_CATALOG_CL);
      expect(r.finalAmount).toBeGreaterThanOrEqual(0);
    });

  });

  // ── A3. Renovación (mismo plan) ─────────────────────────────────────────────

  describe('renovación (mismo plan)', () => {

    it('A3-a: pro → pro CL, 15 días restantes — no hay crédito, cobra completo', () => {
      const r = computePlanChange('pro', daysFromNow(15), 'pro', PLAN_CATALOG_CL);
      expect(r.changeType).toBe('renewal');
      expect(r.creditAmount).toBe(0);
      expect(r.finalAmount).toBe(5990);
      expect(r.effectiveAt).toBe(daysFromNow(15));
    });

    it('A3-b: business → business AR, 10 días restantes', () => {
      const r = computePlanChange('business', daysFromNow(10), 'business', PLAN_CATALOG_AR);
      expect(r.changeType).toBe('renewal');
      expect(r.creditAmount).toBe(0);
      expect(r.finalAmount).toBe(13990);
    });

    it('A3-c: starter → starter — gratis', () => {
      const r = computePlanChange('starter', null, 'starter', PLAN_CATALOG_CL);
      expect(r.changeType).toBe('renewal');
      expect(r.finalAmount).toBe(0);
    });

  });

  // ── A4. Downgrade (plan inferior) ───────────────────────────────────────────

  describe('downgrade', () => {

    it('A4-a: business → pro CL, 15 días — sin cargo, programado al vencimiento', () => {
      const expiry = daysFromNow(15);
      const r = computePlanChange('business', expiry, 'pro', PLAN_CATALOG_CL);
      expect(r.changeType).toBe('downgrade');
      expect(r.finalAmount).toBe(0);
      expect(r.creditAmount).toBe(0);
      expect(r.effectiveAt).toBe(expiry);
      expect(r.scheduledChange).toEqual({ targetPlanSlug: 'pro', effectiveAt: expiry });
      expect(r.message).toMatch(/vencer tu plan actual/);
    });

    it('A4-b: business → starter CL — downgrade a free', () => {
      const expiry = daysFromNow(10);
      const r = computePlanChange('business', expiry, 'starter', PLAN_CATALOG_CL);
      expect(r.changeType).toBe('downgrade');
      expect(r.finalAmount).toBe(0);
      expect(r.targetPlanPrice).toBe(0);
    });

    it('A4-c: pro → starter AR, 20 días — sin cargo', () => {
      const expiry = daysFromNow(20);
      const r = computePlanChange('pro', expiry, 'starter', PLAN_CATALOG_AR);
      expect(r.changeType).toBe('downgrade');
      expect(r.finalAmount).toBe(0);
      expect(r.scheduledChange?.targetPlanSlug).toBe('starter');
    });

    it('A4-d: downgrade sin planExpiresAt — scheduledChange es undefined', () => {
      // Si no hay fecha de vencimiento, no se puede programar el downgrade
      const r = computePlanChange('business', null, 'pro', PLAN_CATALOG_CL);
      expect(r.changeType).toBe('downgrade');
      expect(r.scheduledChange).toBeUndefined();
      expect(r.effectiveAt).toBeUndefined();
    });

  });

  // ── A5. Plan vencido / expirado ─────────────────────────────────────────────

  describe('plan vencido (planExpiresAt en el pasado)', () => {

    it('A5-a: plan expirado ayer → pro CL — sin crédito, cobra completo', () => {
      const r = computePlanChange('pro', daysAgo(1), 'business', PLAN_CATALOG_CL);
      expect(r.changeType).toBe('upgrade');
      expect(r.daysRemaining).toBe(0);
      expect(r.creditAmount).toBe(0);
      expect(r.finalAmount).toBe(9990);
      // effectiveAt = now (exp < now)
      expect(r.effectiveAt).toBe(new Date(NOW).toISOString());
    });

    it('A5-b: plan expirado hace 30 días → business AR — cobra completo', () => {
      const r = computePlanChange('pro', daysAgo(30), 'business', PLAN_CATALOG_AR);
      expect(r.creditAmount).toBe(0);
      expect(r.finalAmount).toBe(13990);
    });

  });

});

// ─────────────────────────────────────────────────────────────────────────────
// B. buildIntlUsdPreview — INTL/USD sin prorrateo
// ─────────────────────────────────────────────────────────────────────────────

describe('buildIntlUsdPreview', () => {

  it('B1: starter → pro INTL — $6, sin crédito', () => {
    const r = buildIntlUsdPreview('starter', 'pro', null, null, null);
    expect(r.changeType).toBe('upgrade');
    expect(r.creditAmount).toBe(0);
    expect(r.finalAmount).toBe(6);
    expect(r.targetPlanPrice).toBe(6);
    expect(r.prorationFormulaVersion).toBe('intl-static-usd');
  });

  it('B2: pro → business INTL — $10, sin crédito', () => {
    const r = buildIntlUsdPreview('pro', 'business', null, null, null);
    expect(r.creditAmount).toBe(0);
    expect(r.finalAmount).toBe(10);
  });

  it('B3: business → pro INTL — downgrade, sin cargo', () => {
    const r = buildIntlUsdPreview('business', 'pro', daysFromNow(15), null, null);
    expect(r.changeType).toBe('downgrade');
    expect(r.finalAmount).toBe(0);
    expect(r.creditAmount).toBe(0);
    expect(r.message).toMatch(/vencer tu plan actual/);
  });

  it('B4: pro → pro INTL — renewal, $6', () => {
    const r = buildIntlUsdPreview('pro', 'pro', null, null, null);
    expect(r.changeType).toBe('renewal');
    expect(r.finalAmount).toBe(6);
    expect(r.creditAmount).toBe(0);
  });

  it('B5: starter → business INTL — $10', () => {
    const r = buildIntlUsdPreview('starter', 'business', null, null, null);
    expect(r.finalAmount).toBe(10);
  });

  it('B6: buildIntlUsdPreview NO parchea effectiveAt por trial (delegado a applyTrialOverride)', () => {
    // FIX-2: patch isActiveProTrial eliminado de buildIntlUsdPreview.
    // effectiveAt = planExpiresAt cuando está en el futuro (sin importar si hay trial).
    const r = buildIntlUsdPreview('pro', 'pro', daysFromNow(15), daysFromNow(7), null);
    expect(r.effectiveAt).toBe(new Date(NOW + 15 * MS_PER_DAY).toISOString());
    expect(r.creditAmount).toBe(0);
    expect(r.finalAmount).toBe(6);
  });

  it('B6b: flujo completo INTL trial pro → pro (buildIntlUsdPreview + applyTrialOverride)', () => {
    const raw = buildIntlUsdPreview('pro', 'pro', daysFromNow(15), daysFromNow(7), null);
    const r = applyTrialOverride(raw, daysFromNow(7));
    expect(r.effectiveAt).toBe(new Date(NOW).toISOString());
    expect(r.creditAmount).toBe(0);
    expect(r.finalAmount).toBe(6);
    expect(r.daysRemaining).toBe(0);
  });

  it('B6c: flujo completo INTL trial pro → business (antes no cubría este caso)', () => {
    // Antes del fix, trial-pro → business INTL no aplicaba ningún patch.
    const raw = buildIntlUsdPreview('pro', 'business', daysFromNow(15), daysFromNow(7), null);
    const r = applyTrialOverride(raw, daysFromNow(7));
    expect(r.effectiveAt).toBe(new Date(NOW).toISOString());
    expect(r.daysRemaining).toBe(0);
    expect(r.finalAmount).toBe(10);
  });

  it('B7: planExpiresAt futuro sin trial activo — effectiveAt = planExpiresAt', () => {
    const r = buildIntlUsdPreview('pro', 'pro', daysFromNow(15), daysAgo(1), null);
    expect(r.effectiveAt).toBe(new Date(NOW + 15 * MS_PER_DAY).toISOString());
  });

  it('B8: plan inexistente INTL — targetPrice = 0', () => {
    const r = buildIntlUsdPreview('pro', 'gold' as any, null, null, null);
    expect(r.targetPlanPrice).toBe(0);
    expect(r.finalAmount).toBe(0);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// C. applyTrialOverride — lógica de trial para CL/AR
// ─────────────────────────────────────────────────────────────────────────────

describe('applyTrialOverride', () => {

  const baseUpgrade: PlanChangeResult = {
    currentPlanSlug: 'pro',
    currentPlanPrice: 8990,
    targetPlanSlug: 'business',
    targetPlanPrice: 13990,
    daysRemaining: 20,
    remainingDaysFraction: 20,
    creditAmount: 5993,
    finalAmount: 7997,
    changeType: 'upgrade',
    effectiveAt: daysFromNow(20),
    prorationFormulaVersion: '2024-03-exact-time',
  };

  const baseRenewal: PlanChangeResult = {
    ...baseUpgrade,
    targetPlanSlug: 'pro',
    targetPlanPrice: 8990,
    finalAmount: 8990,
    changeType: 'renewal',
    creditAmount: 0,
  };

  const baseDowngrade: PlanChangeResult = {
    ...baseUpgrade,
    targetPlanSlug: 'pro',
    targetPlanPrice: 8990,
    finalAmount: 0,
    changeType: 'downgrade',
    creditAmount: 0,
  };

  it('C1: trial activo → upgrade — resetea crédito y cobra precio completo', () => {
    const r = applyTrialOverride(baseUpgrade, daysFromNow(7), NOW);
    expect(r.creditAmount).toBe(0);
    expect(r.daysRemaining).toBe(0);
    expect(r.remainingDaysFraction).toBe(0);
    expect(r.finalAmount).toBe(13990); // targetPlanPrice
    expect(r.effectiveAt).toBe(new Date(NOW).toISOString());
  });

  it('C2: trial activo → renewal (pro→pro) — cobra precio completo sin crédito', () => {
    const r = applyTrialOverride(baseRenewal, daysFromNow(7), NOW);
    expect(r.creditAmount).toBe(0);
    expect(r.finalAmount).toBe(8990);
    expect(r.effectiveAt).toBe(new Date(NOW).toISOString());
  });

  it('C3: trial activo → downgrade — finalAmount sigue siendo 0', () => {
    const r = applyTrialOverride(baseDowngrade, daysFromNow(7), NOW);
    expect(r.changeType).toBe('downgrade');
    expect(r.finalAmount).toBe(0);
    expect(r.creditAmount).toBe(0);
  });

  it('C4: trial ya expirado — no aplica override, devuelve preview original', () => {
    const r = applyTrialOverride(baseUpgrade, daysAgo(1), NOW);
    // Debe ser idéntico al input
    expect(r.creditAmount).toBe(5993);
    expect(r.finalAmount).toBe(7997);
    expect(r.daysRemaining).toBe(20);
  });

  it('C5: trialExpiresAt = null — no aplica override', () => {
    const r = applyTrialOverride(baseUpgrade, null, NOW);
    expect(r.creditAmount).toBe(5993);
    expect(r.finalAmount).toBe(7997);
  });

  it('C6: datos inconsistentes — planExpiresAt + trialExpiresAt ambos activos', () => {
    // Escenario real que causaba el bug reportado:
    // trial_expires_at=+7d Y plan_expires_at=+20d → computePlanChange da crédito erróneo
    // applyTrialOverride DEBE ganar y resetear todo
    const inconsistentResult = computePlanChange('pro', daysFromNow(20), 'business', PLAN_CATALOG_AR);
    expect(inconsistentResult.creditAmount).toBeGreaterThan(0); // confirma que hay crédito sin override

    const r = applyTrialOverride(inconsistentResult, daysFromNow(7), NOW);
    expect(r.creditAmount).toBe(0);
    expect(r.daysRemaining).toBe(0);
    expect(r.finalAmount).toBe(13990);
  });

  it('C7: trialExpiresAt exactamente = NOW — no es activo (0 ms restantes)', () => {
    const exactNow = new Date(NOW).toISOString();
    const r = applyTrialOverride(baseUpgrade, exactNow, NOW);
    // new Date(exactNow).getTime() > NOW → false (igual, no mayor)
    expect(r.creditAmount).toBe(5993); // no override
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// D. resolveBusinessCountryCode
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveBusinessCountryCode', () => {

  it('D1: country_code explícito "AR" → "AR"', () => {
    expect(resolveBusinessCountryCode({ country_code: 'AR' })).toBe('AR');
  });

  it('D2: country_code explícito "CL" → "CL"', () => {
    expect(resolveBusinessCountryCode({ country_code: 'CL' })).toBe('CL');
  });

  it('D3: country_code en minúsculas → normalizado', () => {
    expect(resolveBusinessCountryCode({ country_code: 'ar' })).toBe('AR');
    expect(resolveBusinessCountryCode({ country_code: 'cl' })).toBe('CL');
  });

  it('D4: sin country_code, country="ARGENTINA" → "AR"', () => {
    expect(resolveBusinessCountryCode({ country: 'ARGENTINA' })).toBe('AR');
  });

  it('D5: sin country_code, country="Chile" → "CL" (case insensitive)', () => {
    expect(resolveBusinessCountryCode({ country: 'Chile' })).toBe('CL');
  });

  it('D6: sin country_code ni country, currency="ARS" → "AR"', () => {
    expect(resolveBusinessCountryCode({ currency: 'ARS' })).toBe('AR');
  });

  it('D7: sin country_code ni country, currency="CLP" → "CL"', () => {
    expect(resolveBusinessCountryCode({ currency: 'CLP' })).toBe('CL');
  });

  it('D8: todo null → fallback "CL"', () => {
    expect(resolveBusinessCountryCode({ country_code: null, country: null, currency: null })).toBe('CL');
  });

  it('D9: country_code desconocido → fallback "CL"', () => {
    expect(resolveBusinessCountryCode({ country_code: 'ZZ' })).toBe('CL');
  });

  it('D10: country_code "MX" → "MX" (INTL válido)', () => {
    expect(resolveBusinessCountryCode({ country_code: 'MX' })).toBe('MX');
  });

  it('D11: country "BRAZIL" (inglés) → "BR"', () => {
    expect(resolveBusinessCountryCode({ country: 'BRAZIL' })).toBe('BR');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// E. resolveUseIntlUsd / getPlanCatalog
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveUseIntlUsd', () => {

  it('E1: CL sin provider → false (usa prorrateo CLP)', () => {
    expect(resolveUseIntlUsd('CL', undefined)).toBe(false);
  });

  it('E2: AR sin provider → false (usa prorrateo ARS)', () => {
    expect(resolveUseIntlUsd('AR', undefined)).toBe(false);
  });

  it('E3: MX sin provider → true (país INTL)', () => {
    expect(resolveUseIntlUsd('MX', undefined)).toBe(true);
  });

  it('E4: CL con provider=paypal → true (PayPal siempre INTL USD)', () => {
    expect(resolveUseIntlUsd('CL', 'paypal')).toBe(true);
  });

  it('E5: AR con provider=manual → true', () => {
    expect(resolveUseIntlUsd('AR', 'manual')).toBe(true);
  });

  it('E6: CL con provider=mercadopago → false', () => {
    expect(resolveUseIntlUsd('CL', 'mercadopago')).toBe(false);
  });

  it('E7: CL con provider=lemonsqueezy → true', () => {
    expect(resolveUseIntlUsd('CL', 'lemonsqueezy')).toBe(true);
  });

});

describe('getPlanCatalog', () => {

  it('F1: CL → PLAN_CATALOG_CL', () => {
    expect(getPlanCatalog('CL')).toBe(PLAN_CATALOG_CL);
  });

  it('F2: AR → PLAN_CATALOG_AR', () => {
    expect(getPlanCatalog('AR')).toBe(PLAN_CATALOG_AR);
  });

  it('F3: MX → null (INTL)', () => {
    expect(getPlanCatalog('MX')).toBeNull();
  });

  it('F4: undefined → CL (fallback)', () => {
    expect(getPlanCatalog(undefined)).toBe(PLAN_CATALOG_CL);
  });

  it('F5: provider=manual → null (fuerza INTL USD sin prorrateo)', () => {
    expect(getPlanCatalog('CL', 'manual')).toBeNull();
  });

  it('F6: provider=lemonsqueezy → null', () => {
    expect(getPlanCatalog('AR', 'lemonsqueezy')).toBeNull();
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// F. Casos edge y detección de bugs
// ─────────────────────────────────────────────────────────────────────────────

describe('casos edge', () => {

  it('G1: planExpiresAt inválido → tratado como null, sin NaN [FIX-1]', () => {
    // parseSafeDate('not-a-date') = null → misma ruta que planExpiresAt=null
    const r = computePlanChange('pro', 'not-a-date', 'business', PLAN_CATALOG_CL);
    expect(Number.isNaN(r.creditAmount)).toBe(false);
    expect(Number.isNaN(r.finalAmount)).toBe(false);
    expect(r.creditAmount).toBe(0);
    expect(r.finalAmount).toBe(9990); // cobra precio completo
    expect(r.daysRemaining).toBe(0);
  });

  it('G2: plan "control" normalizado explícitamente a "starter" [FIX-3]', () => {
    // Antes: catalog['control'] = undefined → price = 0 (silencioso).
    // Ahora: se normaliza a 'starter' al entrar en computePlanChange.
    const r = computePlanChange('control', null, 'pro', PLAN_CATALOG_CL);
    expect(r.changeType).toBe('upgrade');
    expect(r.currentPlanSlug).toBe('starter'); // normalizado, no 'control'
    expect(r.currentPlanPrice).toBe(0);        // starter.price = 0 (explícito)
    expect(r.creditAmount).toBe(0);
    expect(r.finalAmount).toBe(5990);
  });

  it('G3: targetPlanSlug = plan inexistente → targetPlanPrice = 0', () => {
    const r = computePlanChange('pro', daysFromNow(15), 'gold' as any, PLAN_CATALOG_CL);
    expect(r.targetPlanPrice).toBe(0);
    // changeType: PLAN_ORDER['gold'] = undefined = 0, PLAN_ORDER['pro'] = 1
    // targetOrder(0) < currentOrder(1) → downgrade
    expect(r.changeType).toBe('downgrade');
    expect(r.finalAmount).toBe(0);
  });

  it('G4: trial pro → business CL con planExpiresAt activo (el bug original)', () => {
    // Replica exacta del escenario que causaba total incorrecto:
    // trial activo (7 días) + plan_expires_at (20 días) → computePlanChange calcula crédito
    // applyTrialOverride debe corregirlo a creditAmount=0, finalAmount=9990
    const rawPreview = computePlanChange('pro', daysFromNow(20), 'business', PLAN_CATALOG_CL);

    // Sin override: tiene crédito incorrecto
    expect(rawPreview.creditAmount).toBeGreaterThan(0);

    // Con override (isActiveTrial=true): todo correcto
    const fixed = applyTrialOverride(rawPreview, daysFromNow(7), NOW);
    expect(fixed.creditAmount).toBe(0);
    expect(fixed.finalAmount).toBe(9990);
    expect(fixed.daysRemaining).toBe(0);
  });

  it('G5: trial pro → pro CL (renovación desde trial)', () => {
    const rawPreview = computePlanChange('pro', null, 'pro', PLAN_CATALOG_CL);
    const fixed = applyTrialOverride(rawPreview, daysFromNow(7), NOW);
    expect(fixed.changeType).toBe('renewal');
    expect(fixed.creditAmount).toBe(0);
    expect(fixed.finalAmount).toBe(5990);
    expect(fixed.effectiveAt).toBe(new Date(NOW).toISOString());
  });

  it('G6: trial business → pro CL (downgrade desde trial)', () => {
    const rawPreview = computePlanChange('business', null, 'pro', PLAN_CATALOG_CL);
    const fixed = applyTrialOverride(rawPreview, daysFromNow(7), NOW);
    expect(fixed.changeType).toBe('downgrade');
    expect(fixed.finalAmount).toBe(0); // downgrade siempre 0
    expect(fixed.creditAmount).toBe(0);
  });

  it('G7: CL business con provider=paypal → buildIntlUsdPreview (USD, no CLP)', () => {
    // Un negocio CL pagando con PayPal obtiene precios USD, no CLP
    // Esto es INTENCIONAL (PayPal cobra en USD) pero debe estar documentado
    const r = buildIntlUsdPreview('starter', 'pro', null, null, null);
    expect(r.targetPlanPrice).toBe(6); // USD, no 5990 CLP
    expect(r.prorationFormulaVersion).toBe('intl-static-usd');
  });

  it('G8: días restantes = 0 exacto (expira exactamente ahora)', () => {
    const expiresNow = new Date(NOW).toISOString();
    const r = computePlanChange('pro', expiresNow, 'business', PLAN_CATALOG_CL);
    expect(r.daysRemaining).toBe(0);
    expect(r.creditAmount).toBe(0);
    expect(r.finalAmount).toBe(9990);
    // effectiveAt = now (exp <= now)
    expect(r.effectiveAt).toBe(new Date(NOW).toISOString());
  });

  it('G9: remainingDaysFraction es fracción correcta (no integer overflow)', () => {
    // 15.5 días restantes
    const halfDay = new Date(NOW + 15.5 * MS_PER_DAY).toISOString();
    const r = computePlanChange('pro', halfDay, 'business', PLAN_CATALOG_CL);
    expect(r.daysRemaining).toBe(15); // floor(15.5) = 15
    // credit = floor((5990/30) * 15.5) = floor(3094.83) = 3094
    expect(r.creditAmount).toBe(3094);
    expect(r.finalAmount).toBe(6896); // 9990 - 3094
  });

  it('G10: uprgade starter → pro CL, starter.price=0 — sin crédito aunque haya días', () => {
    // Aunque queden días de starter, como su precio es 0 no genera crédito
    const r = computePlanChange('starter', daysFromNow(20), 'pro', PLAN_CATALOG_CL);
    expect(r.currentPlanPrice).toBe(0);
    expect(r.creditAmount).toBe(0); // condición: currentPlanPrice > 0 falla
    expect(r.finalAmount).toBe(5990);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// G. Invariantes matemáticas del sistema
// ─────────────────────────────────────────────────────────────────────────────

describe('invariantes matemáticas', () => {

  it('INV1: finalAmount siempre >= 0 para upgrade', () => {
    [0, 1, 15, 29, 30].forEach(days => {
      const r = computePlanChange('pro', days > 0 ? daysFromNow(days) : null, 'business', PLAN_CATALOG_CL);
      expect(r.finalAmount).toBeGreaterThanOrEqual(0);
    });
  });

  it('INV2: creditAmount siempre >= 0', () => {
    [0, 1, 15, 30].forEach(days => {
      const r = computePlanChange('pro', days > 0 ? daysFromNow(days) : null, 'business', PLAN_CATALOG_CL);
      expect(r.creditAmount).toBeGreaterThanOrEqual(0);
    });
  });

  it('INV3: creditAmount + finalAmount <= targetPlanPrice (para upgrades)', () => {
    [1, 10, 15, 20, 30].forEach(days => {
      const r = computePlanChange('pro', daysFromNow(days), 'business', PLAN_CATALOG_CL);
      if (r.changeType === 'upgrade') {
        expect(r.creditAmount + r.finalAmount).toBeLessThanOrEqual(r.targetPlanPrice + 1);
        // +1 por rounding de floor
      }
    });
  });

  it('INV4: downgrade siempre finalAmount = 0', () => {
    const r = computePlanChange('business', daysFromNow(10), 'pro', PLAN_CATALOG_CL);
    expect(r.changeType).toBe('downgrade');
    expect(r.finalAmount).toBe(0);
  });

  it('INV5: INTL siempre creditAmount = 0', () => {
    const cases = [
      ['starter', 'pro'], ['pro', 'business'], ['business', 'pro'], ['pro', 'pro'],
    ] as const;
    cases.forEach(([from, to]) => {
      const r = buildIntlUsdPreview(from, to, daysFromNow(15), null, null);
      expect(r.creditAmount).toBe(0);
    });
  });

  it('INV6: applyTrialOverride siempre devuelve creditAmount = 0 cuando trial activo', () => {
    const result: PlanChangeResult = {
      currentPlanSlug: 'pro', currentPlanPrice: 8990,
      targetPlanSlug: 'business', targetPlanPrice: 13990,
      daysRemaining: 20, remainingDaysFraction: 20,
      creditAmount: 5993, finalAmount: 7997,
      changeType: 'upgrade', prorationFormulaVersion: '2024-03-exact-time',
    };
    const r = applyTrialOverride(result, daysFromNow(5), NOW);
    expect(r.creditAmount).toBe(0);
    expect(r.daysRemaining).toBe(0);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// H. parseSafeDate [FIX-1]
// ─────────────────────────────────────────────────────────────────────────────

describe('parseSafeDate', () => {

  it('H1: ISO string válida → epoch ms finito', () => {
    const ms = parseSafeDate('2026-04-02T12:00:00.000Z');
    expect(ms).toBe(new Date('2026-04-02T12:00:00.000Z').getTime());
    expect(Number.isFinite(ms!)).toBe(true);
  });

  it('H2: string inválida → null', () => {
    expect(parseSafeDate('not-a-date')).toBeNull();
  });

  it('H3: string vacía → null', () => {
    expect(parseSafeDate('')).toBeNull();
  });

  it('H4: null → null', () => {
    expect(parseSafeDate(null)).toBeNull();
  });

  it('H5: undefined → null', () => {
    expect(parseSafeDate(undefined)).toBeNull();
  });

  it('H6: fecha parcial "2026-04-02" → ms válido (medianoche UTC)', () => {
    const ms = parseSafeDate('2026-04-02');
    expect(ms).not.toBeNull();
    expect(Number.isFinite(ms!)).toBe(true);
  });

  it('H7: NaN no puede propagarse desde una fecha inválida', () => {
    // Garantiza que la función no retorna NaN nunca
    const cases = ['invalid', 'undefined', '99999-99-99', '2026-13-45'];
    cases.forEach(val => {
      const result = parseSafeDate(val);
      expect(result === null || Number.isFinite(result as number)).toBe(true);
    });
  });

});
