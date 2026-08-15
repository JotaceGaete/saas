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

// ─────────────────────────────────────────────────────────────────────────────
// Affiliate Core (Fase 5A) — ¿esta aprobación de MP cuenta como un período
// mensual realmente pagado para wa_register_referral_paid_period()?
// ─────────────────────────────────────────────────────────────────────────────

export interface ShouldRegisterReferralPaidPeriodInput {
  mpStatus: string;
  planSlug: string;
  currentPlan: string;
  transactionAmount: number | null | undefined;
}

/**
 * true únicamente cuando el pago está aprobado, es exactamente el MISMO
 * plan que el negocio ya tenía (comparación de slug, no de PLAN_ORDER:
 * 'starter' y 'control' comparten orden pero son planes distintos -- un
 * cambio lateral entre ellos NO debe contar como renovación), y hubo un
 * cobro real (> 0). Excluye así, sin necesitar ninguna señal nueva:
 * pagos no aprobados, upgrades, downgrades, y los ajustes internos de
 * prorrateo a $0 (que además nunca llegan a mp-webhook -- se insertan
 * directo en wa_payments desde create-mp-preference).
 *
 * No decide nada sobre consecutividad de meses -- eso es explícitamente
 * de una fase posterior. Solo responde "¿este cobro es un mes real y
 * completo del mismo plan?".
 */
export function shouldRegisterReferralPaidPeriod({
  mpStatus,
  planSlug,
  currentPlan,
  transactionAmount,
}: ShouldRegisterReferralPaidPeriodInput): boolean {
  if (mpStatus !== 'approved') return false;
  if (planSlug !== currentPlan) return false;
  if (typeof transactionAmount !== 'number' || transactionAmount <= 0) return false;
  return true;
}

/**
 * period_ref estable para Affiliate Core: derivado exclusivamente del
 * mp_payment_id real de Mercado Pago (nunca de un timestamp ni de un UUID
 * generado acá), para que dos notificaciones del mismo cobro produzcan
 * siempre el mismo valor.
 */
export function buildReferralPeriodRef(mpPaymentId: string | number): string {
  return `mp:${mpPaymentId}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Affiliate Core (Fase 5B) — reversión: ¿esta notificación de MP sobre un
// pago ya procesado representa que el dinero volvió (refund/chargeback)?
// ─────────────────────────────────────────────────────────────────────────────

export type WaPaymentNonApprovedStatus =
  | 'pending'
  | 'rejected'
  | 'cancelled'
  | 'in_process'
  | 'refunded'
  | 'charged_back';

/**
 * wa_payments.status para una notificación de MP con status != 'approved'.
 * Antes de Fase 5B, 'refunded' y 'charged_back' (estados reales que MP
 * puede reportar sobre un pago que YA fue aprobado antes) caían en el
 * bucket genérico 'pending' -- mal etiquetados, indistinguibles de un pago
 * que simplemente nunca se aprobó. Se agregan como valores explícitos,
 * nunca se inventan valores nuevos para el resto (rejected/cancelled/
 * in_process/pending sin cambios).
 */
export function mapMpStatusToWaPaymentStatus(mpStatus: string): WaPaymentNonApprovedStatus {
  switch (mpStatus) {
    case 'rejected':
      return 'rejected';
    case 'cancelled':
      return 'cancelled';
    case 'in_process':
      return 'in_process';
    case 'refunded':
      return 'refunded';
    case 'charged_back':
      return 'charged_back';
    default:
      return 'pending';
  }
}

/**
 * Reason para wa_reverse_referral_paid_period() a partir del status de MP.
 * Devuelve null para cualquier status que NO represente una reversión de
 * dinero (pending/rejected/cancelled/in_process/approved) -- el llamador
 * usa ese null como guarda para no invocar la RPC de reversión en absoluto.
 * Los dos únicos valores devueltos ('refund'/'chargeback') coinciden
 * exactamente con referral_commissions_reversed_reason_check.
 */
export function mapMpStatusToReversalReason(mpStatus: string): 'refund' | 'chargeback' | null {
  if (mpStatus === 'refunded') return 'refund';
  if (mpStatus === 'charged_back') return 'chargeback';
  return null;
}
