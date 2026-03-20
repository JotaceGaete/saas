import React from "react";
import Icon from "components/AppIcon";
import { SkeletonCard } from "../../../components/ui/Skeleton";
import { formatCurrency } from "../../../utils/formatCLP";

export default function DailyRevenueCard({ data, loading, currency = 'CLP' }) {
  if (loading) return <SkeletonCard />;

  const total = Number(data?.todayTotal ?? 0);
  const amount = Number.isFinite(total) ? total : 0;
  const dayDeltaAmount = Number(data?.deltas?.todayVsYesterday?.amount ?? 0);
  const dayDelta = Number(data?.deltas?.todayVsYesterday?.percent ?? 0);
  const dayDeltaUp = dayDelta >= 0;
  const dayDeltaLabel = data?.deltas?.todayVsYesterday?.label || 'vs ayer';

  return (
    <div
      className="rounded-xl border p-5 flex flex-col gap-3 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
      style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Ingresos de hoy</p>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(14,165,233,0.10)' }}>
          <Icon name="Wallet" size={17} color="#0284C7" />
        </div>
      </div>

      <div>
        <p className="text-3xl font-extrabold leading-none" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.03em' }}>
          {formatCurrency(amount, currency)}
        </p>
        <p className="text-xs mt-1.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          Hoy
        </p>
      </div>

      <div className="flex items-center gap-2 pt-1 border-t" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: 'rgba(14,165,233,0.10)', color: '#0284C7', fontFamily: 'var(--font-caption)' }}>
          <Icon name="Clock3" size={11} color="#0284C7" />
          Actualizado en tiempo real
        </div>
        <div
          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
          style={{
            backgroundColor: dayDeltaUp ? 'rgba(16,185,129,0.10)' : 'rgba(239,68,68,0.10)',
            color: dayDeltaUp ? '#059669' : '#DC2626',
            fontFamily: 'var(--font-caption)',
          }}
        >
          <Icon name={dayDeltaUp ? "TrendingUp" : "TrendingDown"} size={11} color={dayDeltaUp ? '#059669' : '#DC2626'} />
          {dayDeltaUp ? '+' : '-'}{formatCurrency(Math.abs(dayDeltaAmount), currency)} ({dayDeltaUp ? '+' : ''}{dayDelta.toFixed(1)}%) {dayDeltaLabel}
        </div>
      </div>
    </div>
  );
}

