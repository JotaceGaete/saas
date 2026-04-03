/**
 * plan-change-preview/lib.ts
 * Pure functions extracted from index.ts for unit testing.
 * No Deno or Supabase dependencies — safe to import in Vitest/Node.
 */

export const VALID_PLAN_SLUGS = ['starter', 'pro', 'business'] as const;
export type PlanSlug = (typeof VALID_PLAN_SLUGS)[number];

export const PLAN_ORDER: Record<string, number> = { starter: 0, control: 0, pro: 1, business: 2 };
export type PlanCatalog = Record<string, { displayName: string; price: number; durationDays: number }>;
export type ChangeType = 'upgrade' | 'renewal' | 'downgrade';

export const PLAN_CATALOG_CL: PlanCatalog = {
  starter:  { displayName: 'Starter',   price: 0,     durationDays: 30 },
  pro:      { displayName: 'Plan Pro',  price: 5990,  durationDays: 30 },
  business: { displayName: 'Plan Full', price: 9990,  durationDays: 30 },
};

export const PLAN_CATALOG_AR: PlanCatalog = {
  starter:  { displayName: 'Starter',       price: 0,     durationDays: 30 },
  pro:      { displayName: 'Plan Pro',      price: 8990,  durationDays: 30 },
  business: { displayName: 'Plan Business', price: 13990, durationDays: 30 },
};

export const INTL_USD_PRICES: Record<string, number> = { starter: 0, pro: 6, business: 10 };

export const PRORATION_FORMULA_VERSION = '2024-03-exact-time';
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Parsea una fecha ISO de forma segura.
 * Retorna epoch ms si la fecha es válida, null si es ausente o inválida.
 * Evita cascada de NaN en cálculos de prorrateo.
 */
export function parseSafeDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function getPlanCatalog(country: string | undefined, provider?: string): PlanCatalog | null {
  if (provider === 'manual' || provider === 'lemonsqueezy') return null;
  if (country && country !== 'CL' && country !== 'AR') return null;
  return country === 'AR' ? PLAN_CATALOG_AR : PLAN_CATALOG_CL;
}

export function normalizeCountryCode(value: string | undefined): string {
  const code = (value ?? '').toUpperCase().trim();
  if (!code) return 'CL';
  if (['AR', 'BO', 'BR', 'CL', 'CO', 'CR', 'EC', 'GT', 'MX', 'PA', 'PE', 'PY', 'UY'].includes(code)) return code;
  return 'CL';
}

export function resolveBusinessCountryCode(
  business: { country_code?: string | null; country?: string | null; currency?: string | null },
): string {
  if (business.country_code) return normalizeCountryCode(business.country_code ?? undefined);
  const countryRaw = (business.country ?? '').toUpperCase().trim();
  const countryAliases: Record<string, string> = {
    ARGENTINA: 'AR', CHILE: 'CL', BOLIVIA: 'BO', BRASIL: 'BR', BRAZIL: 'BR',
    COLOMBIA: 'CO', 'COSTA RICA': 'CR', ECUADOR: 'EC', GUATEMALA: 'GT',
    MEXICO: 'MX', PANAMA: 'PA', PERU: 'PE', PARAGUAY: 'PY', URUGUAY: 'UY',
  };
  if (countryRaw && countryAliases[countryRaw]) return countryAliases[countryRaw];
  if (countryRaw) return normalizeCountryCode(countryRaw);
  const currency = (business.currency ?? '').toUpperCase().trim();
  if (currency === 'ARS') return 'AR';
  if (currency === 'CLP') return 'CL';
  return 'CL';
}

export interface PlanChangeResult {
  currentPlanSlug: string;
  currentPlanPrice: number;
  targetPlanSlug: string;
  targetPlanPrice: number;
  daysRemaining: number;
  remainingDaysFraction: number;
  creditAmount: number;
  finalAmount: number;
  changeType: ChangeType;
  message?: string;
  effectiveAt?: string;
  scheduledChange?: { targetPlanSlug: string; effectiveAt: string };
  prorationFormulaVersion: string;
}

export function computePlanChange(
  currentPlanSlugRaw: string,
  planExpiresAt: string | null,
  targetPlanSlug: string,
  catalog: PlanCatalog,
): PlanChangeResult {
  // FIX-3: normalizar slug legacy 'control' a 'starter' de forma explícita.
  // Evita cálculo silencioso con catalog['control'] = undefined → price = 0.
  const currentPlanSlug = currentPlanSlugRaw === 'control' ? 'starter' : currentPlanSlugRaw;

  const now = Date.now();
  const currentOrder = PLAN_ORDER[currentPlanSlug] ?? 0;
  const targetOrder = PLAN_ORDER[targetPlanSlug] ?? 0;
  const currentPlanPrice = catalog[currentPlanSlug]?.price ?? 0;
  const targetPlanPrice = catalog[targetPlanSlug]?.price ?? 0;

  let changeType: ChangeType = 'renewal';
  if (targetOrder > currentOrder) changeType = 'upgrade';
  else if (targetOrder < currentOrder) changeType = 'downgrade';

  // FIX-1: parseSafeDate blinda contra fechas inválidas → null en vez de NaN.
  const expMs = parseSafeDate(planExpiresAt);
  const remainingMs = expMs !== null ? Math.max(0, expMs - now) : 0;

  const msPerPeriod = (catalog[currentPlanSlug]?.durationDays ?? 30) * MS_PER_DAY;
  const remainingDaysFraction = msPerPeriod > 0
    ? Math.min((remainingMs / msPerPeriod) * (catalog[currentPlanSlug]?.durationDays ?? 30), 30)
    : 0;
  const daysRemaining = Math.floor(remainingDaysFraction);

  let creditAmount = 0;
  if (changeType === 'upgrade' && currentPlanPrice > 0) {
    const rawCredit = (currentPlanPrice / 30) * remainingDaysFraction;
    creditAmount = Math.floor(rawCredit);
    creditAmount = Math.min(creditAmount, currentPlanPrice);
  }

  let finalAmount: number;
  if (changeType === 'upgrade') {
    finalAmount = Math.max(0, Math.floor(targetPlanPrice - creditAmount));
  } else if (changeType === 'renewal') {
    finalAmount = targetPlanPrice;
  } else {
    finalAmount = 0;
  }

  let effectiveAt: string | undefined;
  let scheduledChange: { targetPlanSlug: string; effectiveAt: string } | undefined;

  if (changeType === 'downgrade' && expMs !== null) {
    effectiveAt = new Date(expMs).toISOString();
    scheduledChange = { targetPlanSlug, effectiveAt };
  } else if (changeType === 'renewal' || changeType === 'upgrade') {
    effectiveAt = (expMs !== null && expMs > now)
      ? new Date(expMs).toISOString()
      : new Date(now).toISOString();
  }

  const message = changeType === 'downgrade'
    ? 'El cambio a un plan inferior se aplicará al vencer tu plan actual. No se realiza ningún cargo.'
    : undefined;

  return {
    currentPlanSlug,
    currentPlanPrice,
    targetPlanSlug,
    targetPlanPrice,
    daysRemaining,
    remainingDaysFraction,
    creditAmount,
    finalAmount,
    changeType,
    message,
    effectiveAt,
    scheduledChange,
    prorationFormulaVersion: PRORATION_FORMULA_VERSION,
  };
}

export function buildIntlUsdPreview(
  currentPlanSlug: string,
  targetPlanSlug: string,
  planExpiresAt: string | null,
  _trialExpiresAt: string | null, // FIX-2: trial override unificado en applyTrialOverride (handler)
  _scheduledPlanSlug: string | null,
): PlanChangeResult {
  const targetPrice = INTL_USD_PRICES[targetPlanSlug] ?? 0;
  const currentPrice = INTL_USD_PRICES[currentPlanSlug] ?? 0;
  const currentOrder = PLAN_ORDER[currentPlanSlug] ?? 0;
  const targetOrder = PLAN_ORDER[targetPlanSlug] ?? 0;
  let changeType: ChangeType = 'renewal';
  if (targetOrder > currentOrder) changeType = 'upgrade';
  else if (targetOrder < currentOrder) changeType = 'downgrade';

  const now = Date.now();
  // FIX-1: parseSafeDate blinda contra fechas inválidas.
  const expMs = parseSafeDate(planExpiresAt);
  let daysRemaining = 0;
  let effectiveAt: string | undefined;
  let scheduledChange: { targetPlanSlug: string; effectiveAt: string } | undefined;

  if (expMs !== null) {
    const remainingMs = Math.max(0, expMs - now);
    daysRemaining = Math.floor(remainingMs / MS_PER_DAY);
    if (changeType === 'downgrade') {
      effectiveAt = new Date(expMs).toISOString();
      scheduledChange = { targetPlanSlug, effectiveAt };
    } else {
      effectiveAt = expMs > now ? new Date(expMs).toISOString() : new Date(now).toISOString();
    }
  } else {
    effectiveAt = new Date(now).toISOString();
  }

  // FIX-2: el patch parcial isActiveProTrial (solo pro→pro) fue eliminado.
  // applyTrialOverride() en el handler cubre todos los casos de trial uniformemente.

  const message = changeType === 'downgrade'
    ? 'El cambio a un plan inferior se aplicará al vencer tu plan actual. No se realiza ningún cargo.'
    : undefined;

  return {
    currentPlanSlug,
    currentPlanPrice: currentPrice,
    targetPlanSlug,
    targetPlanPrice: targetPrice,
    daysRemaining,
    remainingDaysFraction: daysRemaining / 30,
    creditAmount: 0,
    finalAmount: changeType === 'downgrade' ? 0 : targetPrice,
    changeType,
    message,
    effectiveAt,
    scheduledChange,
    prorationFormulaVersion: 'intl-static-usd',
  };
}

/** Lógica de routing del handler: determina si aplica INTL USD o CLP/ARS. */
export function resolveUseIntlUsd(countryCode: string, providerHint: string | undefined): boolean {
  const normalizedProvider = String(providerHint || '').trim().toLowerCase();
  const useIntlUsdProviders = new Set(['paypal', 'dlocal_go', 'dlocal', 'manual', 'lemonsqueezy']);
  return (
    useIntlUsdProviders.has(normalizedProvider) ||
    (!!countryCode && countryCode !== 'CL' && countryCode !== 'AR')
  );
}

/**
 * FIX-2: Aplica override de trial sobre cualquier resultado (CL/AR o INTL/USD).
 * Cuando el trial está activo: creditAmount=0, daysRemaining=0, finalAmount=targetPlanPrice,
 * effectiveAt=now. Para downgrade en trial: finalAmount=0 (misma regla que plan pagado).
 */
export function applyTrialOverride(
  preview: PlanChangeResult,
  trialExpiresAt: string | null,
  now: number = Date.now(),
): PlanChangeResult {
  // FIX-1: parseSafeDate para blindar trialExpiresAt inválido.
  const trialExpMs = parseSafeDate(trialExpiresAt);
  const isActiveTrial = trialExpMs !== null && trialExpMs > now;
  if (!isActiveTrial) return preview;

  return {
    ...preview,
    creditAmount: 0,
    daysRemaining: 0,
    remainingDaysFraction: 0,
    finalAmount: preview.changeType === 'downgrade' ? 0 : preview.targetPlanPrice,
    effectiveAt: new Date(now).toISOString(),
  };
}
