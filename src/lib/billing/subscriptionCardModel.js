import { TRIAL_DURATION_DAYS, getTrialDaysLeft } from '../../constants/trial';
import { getPlanLabel } from '../../constants/plans';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Porcentaje de prueba restante (0–100) para barra de progreso.
 */
export function getTrialRemainingPercent(trialEndsAtIso, now = new Date()) {
  if (!trialEndsAtIso) return 0;
  const end = new Date(trialEndsAtIso);
  if (Number.isNaN(end.getTime())) return 0;
  const remainingMs = end.getTime() - now.getTime();
  if (remainingMs <= 0) return 0;
  const refMs = TRIAL_DURATION_DAYS * DAY_MS;
  const pct = (remainingMs / refMs) * 100;
  return Math.min(100, Math.max(0, pct));
}

/**
 * Modelo de UI legado (helpers de trial / barra); la tarjeta principal usa UnifiedSubscriptionCard.
 * Evita mezclar `trialExpiresAt` con `planExpiresAt` o `scheduledChangeAt` en el mismo mensaje.
 */
export function buildSubscriptionCardModel({
  business,
  subscriptionState,
  currentPlanSlug,
}) {
  if (!business?.id) return null;

  const bs = subscriptionState?.billing_status
    ? String(subscriptionState.billing_status).trim().toLowerCase()
    : null;

  const planSlug = currentPlanSlug || 'starter';
  const planLabel = getPlanLabel(planSlug);
  const isPaidTier = planSlug === 'pro' || planSlug === 'business';

  const trialEndsAt = business?.trialExpiresAt || subscriptionState?.trial_ends_at || null;
  const planExpiresAt = business?.planExpiresAt || subscriptionState?.current_period_ends_at || null;
  const scheduledPlanSlug = business?.scheduledPlanSlug || null;
  const scheduledChangeAt =
    business?.scheduledChangeAt || subscriptionState?.subscription_starts_at || null;

  if (bs === 'pending_payment') {
    return {
      variant: 'pending_payment',
      title: 'Estamos confirmando tu pago',
      subtitle:
        'Tu compra puede tardar unos minutos. Cuando el proveedor acredite el pago, tu plan se actualizará automáticamente. No necesitas repetir el pago.',
      detail: null,
      showTrialBar: false,
      trialProgressPercent: 0,
    };
  }

  const trialEndDate = trialEndsAt ? new Date(trialEndsAt) : null;
  const trialIsActive = trialEndDate && !Number.isNaN(trialEndDate.getTime()) && trialEndDate > new Date();
  const hasActivePaidPeriod = planExpiresAt && new Date(planExpiresAt) > new Date();

  if (trialIsActive && isPaidTier && !hasActivePaidPeriod) {
    const daysLeft = getTrialDaysLeft(trialEndsAt);
    const daysWord = daysLeft === 1 ? '1 día' : `${daysLeft} días`;
    const title = `Estás en el periodo de prueba ${planLabel} (quedan ${daysWord})`;
    const pct = getTrialRemainingPercent(trialEndsAt);

    let subtitle =
      'Podés elegir un plan de pago cuando quieras; el período pagado se acumula al término de la prueba.';
    if (bs === 'trial_with_subscription' && scheduledChangeAt) {
      const d = new Date(scheduledChangeAt);
      const te = trialEndDate;
      const coherent =
        !Number.isNaN(d.getTime())
        && d > new Date()
        && (!te || Number.isNaN(te.getTime()) || d.getTime() >= te.getTime() - 60 * 60 * 1000);
      const formatted = !Number.isNaN(d.getTime())
        ? d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
        : '';
      subtitle = coherent && formatted
        ? `Tenés la suscripción lista: el cobro y el período facturado inician el ${formatted} (al finalizar la prueba).`
        : 'Tenés la suscripción lista: el cobro se realizará al finalizar la prueba.';
    }

    /** No usar `scheduledChangeAt` suelto: puede quedar desfasado respecto al fin de prueba real. */
    let detail = null;
    if (scheduledPlanSlug === 'starter' && trialEndsAt) {
      const d = new Date(trialEndsAt);
      if (!Number.isNaN(d.getTime()) && d > new Date()) {
        const formatted = d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
        detail = `Si no activás un plan de pago, pasarás a Starter al finalizar la prueba (${formatted}).`;
      }
    }

    return {
      variant: bs === 'trial_with_subscription' ? 'trial_scheduled' : 'trial',
      title,
      subtitle,
      detail: null,
      showTrialBar: true,
      trialProgressPercent: pct,
    };
  }

  if (planSlug === 'starter' || !isPaidTier) {
    return {
      variant: 'starter',
      title: `Plan ${planLabel} (gratuito)`,
      subtitle: 'Incluye límites de productos y pedidos. Subí de plan cuando necesites más capacidad.',
      detail: null,
      showTrialBar: false,
      trialProgressPercent: 0,
    };
  }

  if (hasActivePaidPeriod) {
    const exp = new Date(planExpiresAt);
    const formatted = exp.toLocaleDateString('es-CL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return {
      variant: 'paid',
      title: `Plan ${planLabel} activo`,
      subtitle: `Renovación del período: ${formatted}.`,
      detail,
      showTrialBar: false,
      trialProgressPercent: 0,
    };
  }

  return {
    variant: 'default',
    title: `Plan ${planLabel}`,
    subtitle: 'Elegí un plan abajo para activar o cambiar tu suscripción.',
    detail: null,
    showTrialBar: false,
    trialProgressPercent: 0,
  };
}
