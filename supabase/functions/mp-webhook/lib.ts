/**
 * mp-webhook/lib.ts
 * Función pura extraída de index.ts para poder testearla en Vitest/Node.
 * Sin dependencias de Deno ni de Supabase — solo construye el payload de
 * sincronización de billing_subscriptions a partir de datos ya resueltos.
 */

export interface MpPaymentForBillingSync {
  currency_id?: string;
  transaction_amount?: number;
}

export interface BuildBillingSubscriptionUpsertPayloadInput {
  businessId: string;
  planSlug: string;
  payment: MpPaymentForBillingSync;
  mpStatus: string;
  countryHint: string;
  currentPeriodStartsAt: string;
  currentPeriodEndsAt: string;
}

export interface BillingSubscriptionUpsertPayload {
  business_id: string;
  provider: 'mercado_pago';
  provider_subscription_id: null;
  plan_slug: string;
  currency_code: string;
  amount: number | null;
  interval_unit: 'month';
  status: 'active';
  provider_status: string;
  trial_ends_at: null;
  current_period_starts_at: string;
  current_period_ends_at: string;
}

/**
 * Mercado Pago en este flujo representa pagos individuales (no una
 * suscripción/preapproval), por eso provider_subscription_id siempre es null.
 * currency_code cae a ARS/CLP según countryHint solo si el pago de MP no
 * trae currency_id (no debería ocurrir en la práctica, pero la columna es
 * NOT NULL en billing_subscriptions).
 */
export function buildBillingSubscriptionUpsertPayload({
  businessId,
  planSlug,
  payment,
  mpStatus,
  countryHint,
  currentPeriodStartsAt,
  currentPeriodEndsAt,
}: BuildBillingSubscriptionUpsertPayloadInput): BillingSubscriptionUpsertPayload {
  return {
    business_id: businessId,
    provider: 'mercado_pago',
    provider_subscription_id: null,
    plan_slug: planSlug,
    currency_code: payment.currency_id ?? (countryHint === 'AR' ? 'ARS' : 'CLP'),
    amount: typeof payment.transaction_amount === 'number' ? payment.transaction_amount : null,
    interval_unit: 'month',
    status: 'active',
    provider_status: mpStatus,
    trial_ends_at: null,
    current_period_starts_at: currentPeriodStartsAt,
    current_period_ends_at: currentPeriodEndsAt,
  };
}
