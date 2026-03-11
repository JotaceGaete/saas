import React from "react";
import Icon from "components/AppIcon";
import { SkeletonCard } from "../../../components/ui/Skeleton";
import { formatCLP } from "../../../utils/formatCLP";

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export default function MonthlyRevenueCard({ data, loading }) {
  if (loading) return <SkeletonCard />;

  const total = data?.total ?? 0;
  const count = data?.count ?? 0;
  const monthName = MONTH_NAMES?.[new Date()?.getMonth()];

  return (
    <div
      className="rounded-xl border p-5 flex flex-col gap-3 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
      style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Ingresos del mes</p>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(16,185,129,0.08)' }}>
          <Icon name="DollarSign" size={17} color="#059669" />
        </div>
      </div>

      <div>
        <p className="text-3xl font-extrabold leading-none" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.03em' }}>
          {formatCLP(total)}
        </p>
        <p className="text-xs mt-1.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          {monthName} · {count} pedido{count !== 1 ? 's' : ''} pagado{count !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="flex items-center gap-1.5 pt-1 border-t" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: '#059669', fontFamily: 'var(--font-caption)' }}>
          <Icon name="Calendar" size={11} color="#059669" />
          Mes actual
        </div>
      </div>
    </div>
  );
}
