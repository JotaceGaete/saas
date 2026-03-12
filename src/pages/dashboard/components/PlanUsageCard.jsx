import React from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';
import { SkeletonCard } from '../../../components/ui/Skeleton';
import { getPlanLabel, getPlanColors, getUsageStatus, getUpgradePlan } from '../../../constants/plans';
import { formatCLP } from '../../../utils/formatCLP';

function UsageBar({ label, used, max, warn, exceeded }) {
  const pct = max != null ? Math.min((used / max) * 100, 100) : 0;
  const barColor = exceeded
    ? '#DC2626'
    : warn
    ? '#D97706'
    : '#7C3AED';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          {label}
        </span>
        <span className="text-xs font-bold" style={{ color: exceeded ? '#DC2626' : warn ? '#D97706' : 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
          {used}
          {max != null ? <span style={{ color: 'var(--color-muted-foreground)', fontWeight: 400 }}> / {max}</span> : <span style={{ color: '#059669', fontWeight: 500 }}> · ilimitado</span>}
        </span>
      </div>
      {max != null ? (
        <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(0,0,0,0.06)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: barColor }}
          />
        </div>
      ) : (
        <div className="h-1.5 rounded-full" style={{ backgroundColor: 'rgba(16,185,129,0.2)' }} />
      )}
      {(warn || exceeded) && max != null && (
        <p className="text-xs" style={{ color: exceeded ? '#DC2626' : '#D97706', fontFamily: 'var(--font-caption)' }}>
          {exceeded
            ? `Límite alcanzado. Actualiza tu plan para continuar.`
            : `Cerca del límite (${Math.round(pct)}%)`}
        </p>
      )}
    </div>
  );
}

export default function PlanUsageCard({ data, loading }) {
  const navigate = useNavigate();

  if (loading) return <SkeletonCard />;
  if (!data) return null;

  const {
    planSlug,
    effectivePlan,
    planExpiresAt,
    activeProducts,
    maxProducts,
    ordersThisMonth,
    maxOrdersPerMonth,
  } = data;

  const displayPlan   = effectivePlan || planSlug || 'starter';
  const planLabel     = getPlanLabel(displayPlan);
  const planColors    = getPlanColors(displayPlan);
  const upgradeTo     = getUpgradePlan(displayPlan);
  const isDowngraded  = planSlug !== displayPlan && ['pro','business'].includes(planSlug);

  const productStatus = getUsageStatus(activeProducts, maxProducts);
  const orderStatus   = getUsageStatus(ordersThisMonth, maxOrdersPerMonth);
  const hasAnyWarn    = productStatus.warn || orderStatus.warn || productStatus.exceeded || orderStatus.exceeded;

  const daysLeft = planExpiresAt
    ? Math.max(0, Math.ceil((new Date(planExpiresAt) - new Date()) / 86400000))
    : null;

  return (
    <div
      className="rounded-xl border p-5 flex flex-col gap-4 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
      style={{
        backgroundColor: '#FFFFFF',
        borderColor: hasAnyWarn ? 'rgba(245,158,11,0.35)' : 'var(--color-border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            Tu plan actual
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span
              className="text-sm font-bold px-2.5 py-0.5 rounded-full"
              style={{ backgroundColor: planColors.bg, color: planColors.color, fontFamily: 'var(--font-caption)' }}
            >
              {planLabel}
            </span>
            {isDowngraded && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#DC2626', fontFamily: 'var(--font-caption)' }}>
                Vencido → Starter
              </span>
            )}
            {daysLeft !== null && daysLeft <= 7 && !isDowngraded && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'rgba(245,158,11,0.1)', color: '#D97706', fontFamily: 'var(--font-caption)' }}>
                Vence en {daysLeft}d
              </span>
            )}
          </div>
        </div>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: planColors.bg }}>
          <Icon name="Zap" size={17} color={planColors.color} />
        </div>
      </div>

      {/* Barras de uso */}
      <div className="space-y-3">
        <UsageBar
          label="Productos activos"
          used={activeProducts}
          max={maxProducts}
          warn={productStatus.warn}
          exceeded={productStatus.exceeded}
        />
        <UsageBar
          label="Pedidos este mes"
          used={ordersThisMonth}
          max={maxOrdersPerMonth}
          warn={orderStatus.warn}
          exceeded={orderStatus.exceeded}
        />
      </div>

      {/* CTA */}
      {upgradeTo && (
        <button
          onClick={() => navigate('/planes')}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-90 active:scale-[0.98]"
          style={{
            background: hasAnyWarn
              ? 'linear-gradient(135deg, #D97706, #B45309)'
              : `linear-gradient(135deg, ${planColors.color}, ${planColors.color}dd)`,
            color: '#fff',
            fontFamily: 'var(--font-caption)',
          }}
        >
          <Icon name="TrendingUp" size={14} color="#fff" />
          {hasAnyWarn ? 'Actualizar plan ahora' : `Subir a ${getPlanLabel(upgradeTo)}`}
        </button>
      )}
      {!upgradeTo && (
        <div className="flex items-center justify-center gap-1.5 py-1">
          <Icon name="CheckCircle" size={14} color="#059669" />
          <span className="text-xs font-medium" style={{ color: '#059669', fontFamily: 'var(--font-caption)' }}>
            Plan {planLabel} — sin límites
          </span>
        </div>
      )}
    </div>
  );
}
