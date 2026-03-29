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

  if (layout === 'pending') {
    return (
      <div
        className="bg-white border border-amber-200 rounded-xl shadow-sm overflow-hidden mb-8"
        data-billing-status={rawStatus ?? normalizedStatus ?? ''}
        data-subscription={dataSubscription}
      >
        <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-medium text-amber-800 uppercase tracking-wider font-[family-name:var(--font-caption)]">
              Pago en proceso
            </h3>
            <p className="text-lg font-bold text-gray-900 mt-1 font-[family-name:var(--font-heading)]">{viewModel.title}</p>
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
    } = viewModel;
    const pct = Math.min(100, Math.max(0, Number(progressPercent) || 0));

    return (
      <div
        className="bg-white border border-purple-100 rounded-xl shadow-sm overflow-hidden mb-8"
        data-billing-status={rawStatus ?? normalizedStatus ?? ''}
        data-subscription={dataSubscription}
      >
        <div className="p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start gap-4 min-w-0">
            <div className="bg-purple-100 p-3 rounded-lg shrink-0">
              <CheckCircle2 className="text-purple-600 w-6 h-6" aria-hidden />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider font-[family-name:var(--font-caption)]">
                Tu plan actual
              </h3>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="text-2xl font-bold text-gray-900 font-[family-name:var(--font-heading)]">
                  Plan {planLabel}
                </span>
                {showTrialBadge && (
                  <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-1 rounded-full font-[family-name:var(--font-caption)]">
                    PRUEBA GRATUITA
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

          <button
            type="button"
            onClick={onScrollToPlans}
            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors shrink-0 font-[family-name:var(--font-caption)] w-full lg:w-auto"
          >
            <CreditCard size={18} aria-hidden />
            Activar suscripción ahora
          </button>
        </div>

        <div className="bg-gray-50 px-6 py-3 border-t border-gray-100">
          <p className="text-xs text-gray-500 text-center md:text-left font-[family-name:var(--font-caption)]">
            Al pagar hoy, el mes contratado se sumará al final de tu prueba actual.{' '}
            <strong className="text-gray-700 font-semibold">No pierdes tus días gratis.</strong>
          </p>
        </div>
      </div>
    );
  }

  if (layout === 'paid') {
    return (
      <div
        className="bg-white border border-purple-100 rounded-xl shadow-sm overflow-hidden mb-8"
        data-billing-status={rawStatus ?? normalizedStatus ?? ''}
        data-subscription={dataSubscription}
      >
        <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="bg-purple-100 p-3 rounded-lg shrink-0">
              <CheckCircle2 className="text-purple-600 w-6 h-6" aria-hidden />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider font-[family-name:var(--font-caption)]">
                Tu plan actual
              </h3>
              <p className="text-2xl font-bold text-gray-900 mt-1 font-[family-name:var(--font-heading)]">{viewModel.title}</p>
              {viewModel.subtitle && (
                <p className="text-sm text-gray-600 mt-1 font-[family-name:var(--font-caption)]">{viewModel.subtitle}</p>
              )}
              <p className="text-sm text-gray-500 mt-2 font-[family-name:var(--font-caption)]">{viewModel.limitsLine}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onScrollToPlans}
            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors shrink-0 font-[family-name:var(--font-caption)]"
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
        className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mb-8"
        data-billing-status={rawStatus ?? normalizedStatus ?? ''}
        data-subscription={dataSubscription}
      >
        <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="bg-slate-100 p-3 rounded-lg shrink-0">
              <CheckCircle2 className="text-slate-600 w-6 h-6" aria-hidden />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider font-[family-name:var(--font-caption)]">
                Tu plan actual
              </h3>
              <p className="text-xl font-bold text-gray-900 mt-1 font-[family-name:var(--font-heading)]">{viewModel.title}</p>
              <p className="text-sm text-gray-500 mt-1 font-[family-name:var(--font-caption)]">{viewModel.subtitle}</p>
              <p className="text-sm text-gray-500 mt-2 font-[family-name:var(--font-caption)]">{viewModel.limitsLine}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onScrollToPlans}
            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors shrink-0 font-[family-name:var(--font-caption)]"
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
