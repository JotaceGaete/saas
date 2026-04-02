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
 * Prioridad: current_period (subscription-state o fila) → plan_expires_at (negocio) → trial.
 */
function pickDisplayDateIso({ subscriptionState, billingSubscriptionRow, business }) {
  const cp = subscriptionState?.current_period_ends_at
    || billingSubscriptionRow?.current_period_ends_at
    || billingSubscriptionRow?.next_billing_date
    || null;
  if (cp) return { iso: cp, role: 'current_period' };

  const pe = business?.planExpiresAt || null;
  if (pe) return { iso: pe, role: 'plan_expires' };

  const te = subscriptionState?.trial_ends_at
    || billingSubscriptionRow?.trial_ends_at
    || business?.trialExpiresAt
    || null;
  if (te) return { iso: te, role: 'trial' };

  return { iso: null, role: null };
}

function buildPaidCardSubtitle({
  dateRole,
  billingMode,
  nextLabel,
  isFuture,
  normalizedStatus,
}) {
  if (normalizedStatus === BILLING_STATUSES.CANCELLED) {
    return `Suscripción cancelada. Fecha de referencia: ${nextLabel}.`;
  }
  if (dateRole === 'current_period') {
    if (billingMode === 'manual') {
      return `Vigente hasta ${nextLabel}. Renovación manual desde Planes.`;
    }
    return isFuture
      ? `Próxima renovación: ${nextLabel}.`
      : `Período de facturación (referencia): ${nextLabel}.`;
  }
  if (dateRole === 'plan_expires') {
    return isFuture
      ? `Plan vigente hasta ${nextLabel}.`
      : `Vigencia registrada hasta ${nextLabel}.`;
  }
  return isFuture
    ? `Fin de prueba: ${nextLabel}.`
    : `Prueba finalizada el ${nextLabel}.`;
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
      ...(hasScheduled
        ? { has_paid_subscription: true, activates_after_trial: true }
        : {}),
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
  const hasPaidSubscription = effectiveSubscriptionState?.has_paid_subscription === true;
  const activatesAfterTrial = effectiveSubscriptionState?.activates_after_trial === true
    || normalizedStatus === BILLING_STATUSES.TRIAL_WITH_SUBSCRIPTION;

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

  const trialEndsAt = subscriptionState?.trial_ends_at
    || billingSubscriptionRow?.trial_ends_at
    || business?.trialExpiresAt
    || null;
  /** Próximo ciclo / renovación tras la prueba (misma prioridad que subscription-state). */
  const nextPeriodAfterTrial = subscriptionState?.current_period_ends_at
    || billingSubscriptionRow?.current_period_ends_at
    || billingSubscriptionRow?.next_billing_date
    || null;

  const now = Date.now();
  const trialEndMs = trialEndsAt ? new Date(trialEndsAt).getTime() : NaN;
  const trialIsActive = Number.isFinite(trialEndMs) && trialEndMs > now;

  const nextBillMs = nextPeriodAfterTrial ? new Date(nextPeriodAfterTrial).getTime() : NaN;
  const hasFutureNextBilling = Number.isFinite(nextBillMs) && nextBillMs > now;

  const isPaidTier = planSlug === 'pro' || planSlug === 'business';

  // Solo forzar layout 'pending' si el plan operativo NO es de pago.
  // Si isPaidTier=true, el pending_payment es de un checkout abandonado/fallido con fila
  // APPROVAL_PENDING huérfana; mostrar el estado real del plan activo en su lugar.
  if (normalizedStatus === BILLING_STATUSES.PENDING_PAYMENT && !isPaidTier) {
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
    if (hasFutureNextBilling && nextPeriodAfterTrial) {
      subscriptionNote = billingMode === 'manual'
        ? `Vigencia del plan actual hasta: ${formatEsCL(nextPeriodAfterTrial)}. Renovación manual.`
        : `Próximo cobro según suscripción: ${formatEsCL(nextPeriodAfterTrial)}.`;
    }

    const isTrialWithPaidSubscription = activatesAfterTrial && hasPaidSubscription;
    const manualExpiryNote = nextPeriodAfterTrial
      ? `Tu plan vence el ${formatEsCL(nextPeriodAfterTrial)}.`
      : 'Tu plan se activará al finalizar tu prueba actual.';
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
      subscriptionNote: isTrialWithPaidSubscription
        ? (billingMode === 'manual' ? manualExpiryNote : 'Ya tienes tu plan pagado. Se activará al finalizar tu prueba actual.')
        : subscriptionNote,
      showActivateCta: !isTrialWithPaidSubscription,
      ctaLabel: isTrialWithPaidSubscription
        ? 'Ver planes'
        : (billingMode === 'manual' ? 'Activar plan por 30 días' : 'Activar suscripción ahora'),
      footerCopy: isTrialWithPaidSubscription
        ? (
          billingMode === 'manual'
            ? 'Tu pago ya fue confirmado. No perderás días gratis: tu ciclo de 30 días comenzará al finalizar la prueba.'
            : 'Tu pago ya fue confirmado. No perderás días gratis: el período contratado comenzará al finalizar la prueba.'
        )
        : (billingMode === 'manual'
          ? 'Al pagar hoy, activas 30 días de plan al finalizar tu prueba actual. La renovación se realiza manualmente.'
          : 'Al pagar hoy, el mes contratado se sumará al final de tu prueba actual. No pierdes tus días gratis.'),
      trialWithSubscription: isTrialWithPaidSubscription,
      hasPaidSubscription,
      activatesAfterTrial,
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

  const { iso: displayIso, role: dateRole } = pickDisplayDateIso({
    subscriptionState,
    billingSubscriptionRow,
    business,
  });
  const displayMs = displayIso ? new Date(displayIso).getTime() : NaN;
  const hasValidDisplayDate = Number.isFinite(displayMs);
  const isFutureDisplay = hasValidDisplayDate && displayMs > now;

  if (isPaidTier && hasValidDisplayDate && displayIso) {
    const nextLabel = formatEsCL(displayIso);
    const title =
      billingMode === 'manual'
        ? `Plan ${planLabel} activo (pago manual)`
        : normalizedStatus === BILLING_STATUSES.CANCELLED
          ? `Plan ${planLabel} (cancelado)`
          : `Plan ${planLabel} activo`;
    const subtitle = buildPaidCardSubtitle({
      dateRole,
      billingMode,
      nextLabel,
      isFuture: isFutureDisplay,
      normalizedStatus,
    });
    let dateHint = 'Renovación / facturación';
    if (dateRole === 'plan_expires') dateHint = 'Vigencia del plan';
    else if (dateRole === 'trial') dateHint = 'Calendario de prueba';

    return {
      layout: 'paid',
      normalizedStatus,
      rawStatus,
      billingMode,
      planLabel,
      limitsLine,
      next_billing_date: nextLabel,
      date_context: dateRole,
      date_hint: dateHint,
      title,
      subtitle,
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
