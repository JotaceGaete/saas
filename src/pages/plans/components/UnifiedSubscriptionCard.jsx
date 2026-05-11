import React from 'react';
import { CreditCard, Calendar, CheckCircle2 } from 'lucide-react';

/**
 * Tarjeta única de suscripción (estado normalizado desde subscription-state + negocio).
 * @param {object} props
 * @param {object} props.viewModel - resultado de buildUnifiedSubscriptionViewModel
 * @param {string} [props.subscription] - slug del plan actual (p. ej. desde hook / negocio)
 * @param {() => void} [props.onScrollToPlans]
 */
export default function UnifiedSubscriptionCard({ viewModel, onScrollToPlans, subscription }) {
  if (!viewModel) return null;

  const { layout, normalizedStatus, rawStatus } = viewModel;
  const dataSubscription = subscription != null && subscription !== '' ? String(subscription) : undefined;
  const cardClass = 'mb-8 overflow-hidden rounded-2xl border shadow-[0_16px_40px_rgba(17,24,39,0.06)]';
  const cardStyle = { backgroundColor: 'rgba(255,255,255,0.78)', borderColor: 'rgba(17,24,39,0.08)' };
  const iconWrapClass = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl';
  const primaryButtonClass = 'flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white transition-all hover:-translate-y-px hover:bg-slate-800 shrink-0 font-[family-name:var(--font-caption)]';

  if (layout === 'pending') {
    return (
      <div
        className={cardClass}
        style={cardStyle}
        data-billing-status={rawStatus ?? normalizedStatus ?? ''}
        data-subscription={dataSubscription}
      >
        <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700 font-[family-name:var(--font-caption)]">
              Estado del plan
            </h3>
            <p className="text-lg font-semibold text-gray-950 mt-1 font-[family-name:var(--font-heading)]">{viewModel.title}</p>
            <p className="text-sm text-gray-600 mt-2 font-[family-name:var(--font-caption)]">{viewModel.subtitle}</p>
          </div>
        </div>
      </div>
    );
  }

  if (layout === 'trial') {
    const {
      planLabel,
      limitsLine,
      days_left,
      trial_end,
      progressPercent,
      showTrialBadge,
      subscriptionNote,
      ctaLabel,
      footerCopy,
      showActivateCta,
      trialWithSubscription,
      trialWithSubscriptionDetailed,
      statusBadgeText,
      trialCurrentPlanTitle,
      trialPaidMainBody,
      trialSidePanelCopy,
      trialFreeEndLine,
      nextPaymentDueLine,
      hasPaidSubscription,
      activatesAfterTrial,
      billingMode,
    } = viewModel;
    const pct = Math.min(100, Math.max(0, Number(progressPercent) || 0));
    console.info(
      `[billing-ui-debug] showActivateCta=${showActivateCta === true} hasPaidSubscription=${hasPaidSubscription === true} activatesAfterTrial=${activatesAfterTrial === true}`,
    );

    if (trialWithSubscriptionDetailed) {
      return (
        <div
          className={cardClass}
          style={cardStyle}
          data-billing-status={rawStatus ?? normalizedStatus ?? ''}
          data-subscription={dataSubscription}
        >
          <div className="p-6 flex flex-col lg:flex-row lg:items-start justify-between gap-6">
            <div className="flex items-start gap-4 min-w-0 flex-1">
              <div className={iconWrapClass} style={{ backgroundColor: 'rgba(5,150,105,0.10)' }}>
                <CheckCircle2 className="text-emerald-700 w-6 h-6" aria-hidden />
              </div>
              <div className="min-w-0 space-y-3">
                {statusBadgeText ? (
                  <span className="inline-flex items-center rounded-full border text-xs font-semibold px-3 py-1 font-[family-name:var(--font-caption)]" style={{ backgroundColor: 'rgba(5,150,105,0.08)', borderColor: 'rgba(5,150,105,0.18)', color: '#047857' }}>
                    {statusBadgeText}
                  </span>
                ) : null}
                {trialCurrentPlanTitle ? (
                  <p className="text-lg font-semibold text-gray-950 font-[family-name:var(--font-heading)]">
                    {trialCurrentPlanTitle}
                  </p>
                ) : null}
                {trialPaidMainBody ? (
                  <p className="text-sm text-gray-700 leading-relaxed font-[family-name:var(--font-caption)]">
                    {trialPaidMainBody}
                  </p>
                ) : null}
                <p className="text-sm text-gray-500 font-[family-name:var(--font-caption)]">{limitsLine}</p>
                {trialFreeEndLine ? (
                  <p className="text-sm text-gray-800 flex items-start gap-2 font-[family-name:var(--font-caption)]">
                    <Calendar size={16} className="shrink-0 mt-0.5 text-emerald-600" aria-hidden />
                    <span>{trialFreeEndLine}</span>
                  </p>
                ) : null}
                {nextPaymentDueLine ? (
                  <p className="text-sm text-gray-800 flex items-start gap-2 font-[family-name:var(--font-caption)]">
                    <Calendar size={16} className="shrink-0 mt-0.5 text-emerald-600" aria-hidden />
                    <span>{nextPaymentDueLine}</span>
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex-1 max-w-md w-full">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600 font-medium font-[family-name:var(--font-caption)]">Días de prueba restantes</span>
                <span className="text-emerald-800 font-bold tabular-nums font-[family-name:var(--font-caption)]">
                  {days_left} {days_left === 1 ? 'día' : 'días'}
                </span>
              </div>
              <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
                <div
                  className="bg-emerald-600 h-full transition-all duration-500 rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            {trialSidePanelCopy ? (
              <div className="shrink-0 w-full lg:w-auto rounded-xl border px-4 py-3 text-sm font-[family-name:var(--font-caption)] text-center lg:text-left max-w-sm" style={{ backgroundColor: 'rgba(5,150,105,0.08)', borderColor: 'rgba(5,150,105,0.18)', color: '#047857' }}>
                {trialSidePanelCopy}
              </div>
            ) : null}
          </div>

          {footerCopy ? (
            <div className="px-6 py-3 border-t" style={{ backgroundColor: 'rgba(248,250,252,0.72)', borderColor: 'rgba(17,24,39,0.08)' }}>
              <p className="text-xs text-gray-600 text-center md:text-left font-[family-name:var(--font-caption)]">
                {footerCopy}
              </p>
            </div>
          ) : null}
        </div>
      );
    }

    return (
      <div
        className={cardClass}
        style={cardStyle}
        data-billing-status={rawStatus ?? normalizedStatus ?? ''}
        data-subscription={dataSubscription}
      >
        <div className="p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start gap-4 min-w-0">
            <div className={iconWrapClass} style={{ backgroundColor: 'rgba(17,24,39,0.06)' }}>
              <CheckCircle2 className="text-purple-600 w-6 h-6" aria-hidden />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-[0.16em] font-[family-name:var(--font-caption)]">
                Plan actual
              </h3>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="text-2xl font-semibold text-gray-950 font-[family-name:var(--font-heading)]">
                  Plan {planLabel}
                </span>
                {showTrialBadge && (
                  <span className="text-xs font-semibold px-2 py-1 rounded-full font-[family-name:var(--font-caption)]" style={{ backgroundColor: 'rgba(245,158,11,0.12)', color: '#B45309' }}>
                    Prueba gratuita
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-1 font-[family-name:var(--font-caption)]">{limitsLine}</p>
              {subscriptionNote && (
                <p className="text-xs text-emerald-800 mt-2 font-[family-name:var(--font-caption)]">{subscriptionNote}</p>
              )}
            </div>
          </div>

          <div className="flex-1 max-w-md w-full">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600 font-medium font-[family-name:var(--font-caption)]">Días de prueba restantes</span>
              <span className="text-purple-700 font-bold tabular-nums font-[family-name:var(--font-caption)]">
                {days_left} {days_left === 1 ? 'día' : 'días'}
              </span>
            </div>
            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
              <div
                className="bg-purple-600 h-full transition-all duration-500 rounded-full"
                style={{ width: `${pct}%` }}
              />
            </div>
            {trial_end ? (
              <p className="text-xs text-gray-400 mt-2 flex items-center gap-1 font-[family-name:var(--font-caption)]">
                <Calendar size={12} className="shrink-0" aria-hidden />
                Vence el {trial_end}
              </p>
            ) : null}
          </div>

          {showActivateCta === true ? (
            <button
              type="button"
              onClick={onScrollToPlans}
              className={`${primaryButtonClass} w-full lg:w-auto`}
            >
              <CreditCard size={18} aria-hidden />
              {ctaLabel || 'Activar suscripción ahora'}
            </button>
          ) : (
            <div className="shrink-0 w-full lg:w-auto rounded-xl border px-4 py-2 text-sm font-[family-name:var(--font-caption)]" style={{ backgroundColor: 'rgba(5,150,105,0.08)', borderColor: 'rgba(5,150,105,0.18)', color: '#047857' }}>
              {trialWithSubscription
                ? (billingMode === 'manual' ? 'Pago del plan confirmado' : 'Suscripción pagada confirmada')
                : 'Estado sincronizado'}
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t" style={{ backgroundColor: 'rgba(248,250,252,0.72)', borderColor: 'rgba(17,24,39,0.08)' }}>
          <p className="text-xs text-gray-500 text-center md:text-left font-[family-name:var(--font-caption)]">
            {footerCopy ? (
              footerCopy
            ) : (
              <>
                Al pagar hoy, el mes contratado se sumará al final de tu prueba actual.{' '}
                <strong className="text-gray-700 font-semibold">No pierdes tus días gratis.</strong>
              </>
            )}
          </p>
        </div>
      </div>
    );
  }

  if (layout === 'paid') {
    return (
      <div
        className={cardClass}
        style={cardStyle}
        data-billing-status={rawStatus ?? normalizedStatus ?? ''}
        data-subscription={dataSubscription}
      >
        <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className={iconWrapClass} style={{ backgroundColor: 'rgba(17,24,39,0.06)' }}>
              <CheckCircle2 className="text-purple-600 w-6 h-6" aria-hidden />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-[0.16em] font-[family-name:var(--font-caption)]">
                Plan actual
              </h3>
              <p className="text-2xl font-semibold text-gray-950 mt-1 font-[family-name:var(--font-heading)]">{viewModel.title}</p>
              {viewModel.subtitle && (
                <p className="text-sm text-gray-600 mt-1 font-[family-name:var(--font-caption)]">{viewModel.subtitle}</p>
              )}
              {viewModel.date_hint && (
                <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1.5 font-[family-name:var(--font-caption)]">
                  <Calendar size={12} className="shrink-0 opacity-80" aria-hidden />
                  {viewModel.date_hint}
                </p>
              )}
              <p className="text-sm text-gray-500 mt-2 font-[family-name:var(--font-caption)]">{viewModel.limitsLine}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onScrollToPlans}
            className={primaryButtonClass}
          >
            <CreditCard size={18} aria-hidden />
            Ver planes
          </button>
        </div>
      </div>
    );
  }

  if (layout === 'starter' || layout === 'default') {
    return (
      <div
        className={cardClass}
        style={cardStyle}
        data-billing-status={rawStatus ?? normalizedStatus ?? ''}
        data-subscription={dataSubscription}
      >
        <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className={iconWrapClass} style={{ backgroundColor: 'rgba(17,24,39,0.06)' }}>
              <CheckCircle2 className="text-slate-600 w-6 h-6" aria-hidden />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-[0.16em] font-[family-name:var(--font-caption)]">
                Plan actual
              </h3>
              <p className="text-xl font-semibold text-gray-950 mt-1 font-[family-name:var(--font-heading)]">{viewModel.title}</p>
              <p className="text-sm text-gray-500 mt-1 font-[family-name:var(--font-caption)]">{viewModel.subtitle}</p>
              <p className="text-sm text-gray-500 mt-2 font-[family-name:var(--font-caption)]">{viewModel.limitsLine}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onScrollToPlans}
            className={primaryButtonClass}
          >
            <CreditCard size={18} aria-hidden />
            Ver planes
          </button>
        </div>
      </div>
    );
  }

  return null;
}
