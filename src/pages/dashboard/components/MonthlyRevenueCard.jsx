import React from "react";
import Icon from "components/AppIcon";
import { SkeletonCard } from "../../../components/ui/Skeleton";
import { formatPriceCatalog } from "../../../utils/formatPrice";
import ChartEmptyWave from "./ChartEmptyWave";

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export default function MonthlyRevenueCard({ data, loading, currency = 'USD', countryCode = null }) {
  if (loading) return <SkeletonCard />;

  const total = data?.total ?? 0;
  const count = data?.count ?? 0;
  const avgTicket = data?.avgTicket ?? (count > 0 ? Math.round(total / count) : 0);
  const monthDeltaAmount = Number(data?.deltas?.monthVsPreviousMonth?.amount ?? 0);
  const monthDelta = Number(data?.deltas?.monthVsPreviousMonth?.percent ?? 0);
  const monthDeltaUp = monthDelta >= 0;
  const monthDeltaLabel = data?.deltas?.monthVsPreviousMonth?.label || 'vs mes anterior';
  const monthName = MONTH_NAMES?.[new Date()?.getMonth()];

  const isEmpty = total === 0 && count === 0;

  return (
    <div
      className="dashboard-premium-card relative overflow-hidden rounded-2xl border-0 p-5 flex flex-col gap-3"
    >
      {isEmpty && <ChartEmptyWave />}
      <div className="flex items-start justify-between gap-2 relative z-[1]">
        <p className="text-sm font-medium" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Ingresos del mes</p>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(16,185,129,0.08)' }}>
          <Icon name="DollarSign" size={17} color="#059669" />
        </div>
      </div>

      <div className="relative z-[1]">
        <p
          className="text-3xl sm:text-4xl font-black tabular-nums tracking-tight leading-none"
          style={{ fontFamily: 'var(--font-stat)', color: 'var(--color-foreground)', letterSpacing: '-0.04em' }}
        >
          {formatPriceCatalog(total, currency, countryCode)}
        </p>
        <p className="text-xs mt-1.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          {monthName} · {count} pedido{count !== 1 ? 's' : ''} pagado{count !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="flex items-center gap-2 pt-1 border-t relative z-[1]" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: '#059669', fontFamily: 'var(--font-caption)' }}>
          <Icon name="Calendar" size={11} color="#059669" />
          Mes actual
        </div>
        <div
          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
          style={{
            backgroundColor: monthDeltaUp ? 'rgba(16,185,129,0.10)' : 'rgba(239,68,68,0.10)',
            color: monthDeltaUp ? '#059669' : '#DC2626',
            fontFamily: 'var(--font-caption)',
          }}
        >
          <Icon name={monthDeltaUp ? "TrendingUp" : "TrendingDown"} size={11} color={monthDeltaUp ? '#059669' : '#DC2626'} />
          {monthDeltaUp ? '+' : '-'}{formatPriceCatalog(Math.abs(monthDeltaAmount), currency, countryCode)} ({monthDeltaUp ? '+' : ''}{monthDelta.toFixed(1)}%) {monthDeltaLabel}
        </div>
        {count > 0 && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: 'rgba(124,58,237,0.08)', color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}>
            <Icon name="Receipt" size={11} color="var(--color-primary)" />
            Ticket prom. {formatPriceCatalog(avgTicket, currency, countryCode)}
          </div>
        )}
      </div>
    </div>
  );
}
