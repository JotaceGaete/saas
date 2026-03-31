import { BILLING_STATUSES, normalizeBillingStatusFromApi } from './billingStatuses';
import { getPlanLabel, getPlanLimits } from '../../constants/plans';
import { getTrialDaysLeft } from '../../constants/trial';
import { getTrialRemainingPercent } from './subscriptionCardModel';
import { normalizePlanSlugForBilling } from './billingSubscriptionsClient';

function formatEsCL(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Vista para `UnifiedSubscriptionCard`.
 * Fechas: prioridad `billing_subscriptions`; si `_displaySource === 'legacy_wa_businesses'`,
 * las mismas columnas vienen de `wa_businesses` (trial_expires_at → trial_ends_at, plan_expires_at → next_billing_date).
 */
function mergeLegacySubscriptionState({ subscriptionState, business, billingSubscriptionRow }) {
  if (!billingSubscriptionRow || billingSubscriptionRow._displaySource !== 'legacy_wa_businesses') {
    return subscriptionState;
  }
  const raw = subscriptionState?.billing_status;
  if (normalizeBillingStatusFromApi(raw) === BILLING_STATUSES.PENDING_PAYMENT) {
    return subscriptionState;
  }
  const trialEndsAt = billingSubscriptionRow.trial_ends_at;
  const planSlug =
    normalizePlanSlugForBilling(billingSubscriptionRow.plan_slug)
    || normalizePlanSlugForBilling(business?.planSlug)
    || 'starter';
  const isPaid = planSlug === 'pro' || planSlug === 'business';
  const trialEndMs = trialEndsAt ? new Date(trialEndsAt).getTime() : NaN;
  const trialActive = Number.isFinite(trialEndMs) && trialEndMs > Date.now();
  if (trialActive && isPaid) {
    const hasScheduled = business?.scheduledPlanSlug && business.scheduledPlanSlug !== 'starter';
    return {
      ...subscriptionState,
      billing_status: hasScheduled
        ? BILLING_STATUSES.TRIAL_WITH_SUBSCRIPTION
        : BILLING_STATUSES.TRIAL_WITHOUT_SUBSCRIPTION,
    };
  }
  return subscriptionState;
}

export function buildUnifiedSubscriptionViewModel({
  business,
  subscriptionState,
  currentPlanSlug,
  billingSubscriptionRow,
}) {
  if (!business?.id) return null;

  const effectiveSubscriptionState = mergeLegacySubscriptionState({
    subscriptionState,
    business,
    billingSubscriptionRow,
  });

  const rawStatus = effectiveSubscriptionState?.billing_status;
  const normalizedStatus = normalizeBillingStatusFromApi(rawStatus);
  const billingMode = effectiveSubscriptionState?.billing_mode === 'manual' ? 'manual' : 'subscription';

  const fromRow = normalizePlanSlugForBilling(billingSubscriptionRow?.plan_slug);
  const fromSlug = normalizePlanSlugForBilling(currentPlanSlug) || currentPlanSlug || 'starter';
  const planSlug =
    billingSubscriptionRow?._displaySource === 'legacy_wa_businesses' && fromRow
      ? fromRow
      : fromSlug;
  const planLabel = getPlanLabel(planSlug);
  const limits = getPlanLimits(planSlug);
  const limitsLine = [
    limits.maxProducts == null ? 'Productos ilimitados' : `Hasta ${limits.maxProducts} productos`,
    limits.maxOrdersPerMonth == null ? 'pedidos ilimitados' : `${limits.maxOrdersPerMonth} pedidos/mes`,
  ].join(' · ');

  const trialEndsAt = billingSubscriptionRow?.trial_ends_at || null;
  const nextBillingDate = billingSubscriptionRow?.next_billing_date || null;

  const now = Date.now();
  const trialEndMs = trialEndsAt ? new Date(trialEndsAt).getTime() : NaN;
  const trialIsActive = Number.isFinite(trialEndMs) && trialEndMs > now;

  const nextBillMs = nextBillingDate ? new Date(nextBillingDate).getTime() : NaN;
  const hasFutureNextBilling = Number.isFinite(nextBillMs) && nextBillMs > now;

  const isPaidTier = planSlug === 'pro' || planSlug === 'business';

  if (normalizedStatus === BILLING_STATUSES.PENDING_PAYMENT) {
    return {
      layout: 'pending',
      normalizedStatus,
      rawStatus,
      billingMode,
      planLabel,
      limitsLine,
      title: 'Estamos confirmando tu pago',
      subtitle: billingMode === 'manual'
        ? 'Cuando se confirme el pago manual, tu plan quedará activo por 30 días.'
        : 'Cuando el proveedor acredite el pago, tu plan se actualizará automáticamente. No necesitas repetir el cobro.',
    };
  }

  if (trialIsActive && isPaidTier) {
    const daysLeft = getTrialDaysLeft(trialEndsAt);
    const progressPercent = getTrialRemainingPercent(trialEndsAt);
    const trialEndLabel = formatEsCL(trialEndsAt);

    let subscriptionNote = null;
    if (hasFutureNextBilling && nextBillingDate) {
      subscriptionNote = billingMode === 'manual'
        ? `Vigencia del plan actual hasta: ${formatEsCL(nextBillingDate)}. Renovación manual.`
        : `Próximo cobro según suscripción: ${formatEsCL(nextBillingDate)}.`;
    }

    return {
      layout: 'trial',
      normalizedStatus,
      rawStatus,
      billingMode,
      planLabel,
      limitsLine,
      days_left: daysLeft,
      trial_end: trialEndLabel,
      progressPercent,
      showTrialBadge: true,
      subscriptionNote,
      ctaLabel: billingMode === 'manual' ? 'Activar plan por 30 días' : 'Activar suscripción ahora',
      footerCopy: billingMode === 'manual'
        ? 'Al pagar hoy, activas 30 días de plan al finalizar tu prueba actual. La renovación se realiza manualmente.'
        : 'Al pagar hoy, el mes contratado se sumará al final de tu prueba actual. No pierdes tus días gratis.',
    };
  }

  if (planSlug === 'starter' || !isPaidTier) {
    return {
      layout: 'starter',
      normalizedStatus,
      rawStatus,
      billingMode,
      planLabel,
      limitsLine,
      title: `Plan ${planLabel}`,
      subtitle: 'Incluye límites de productos y pedidos. Subí de plan cuando necesites más capacidad.',
    };
  }

  if (hasFutureNextBilling && nextBillingDate) {
    const nextLabel = formatEsCL(nextBillingDate);
    return {
      layout: 'paid',
      normalizedStatus,
      rawStatus,
      billingMode,
      planLabel,
      limitsLine,
      next_billing_date: nextLabel,
      title: billingMode === 'manual' ? `Plan ${planLabel} activo (pago manual)` : `Plan ${planLabel} activo`,
      subtitle: billingMode === 'manual'
        ? `Vigente hasta ${nextLabel}. Renovación manual desde Planes.`
        : `Próxima renovación: ${nextLabel}.`,
    };
  }

  return {
    layout: 'default',
    normalizedStatus,
    rawStatus,
    billingMode,
    planLabel,
    limitsLine,
    title: `Plan ${planLabel}`,
    subtitle: billingMode === 'manual'
      ? 'Las fechas del ciclo manual aparecerán cuando el pago quede sincronizado en el servidor.'
      : 'Las fechas de facturación aparecerán cuando la suscripción esté sincronizada en el servidor.',
  };
}
