import React from "react";
import Icon from "components/AppIcon";
import { SkeletonCard } from "../../../components/ui/Skeleton";

const formatCLP = (n) => `$${Math.round(n)?.toLocaleString('es-CL')}`;

export default function TopProductsCard({ data, loading }) {
  if (loading) return <SkeletonCard />;

  const items = data || [];

  return (
    <div
      className="rounded-xl border p-5 flex flex-col gap-3 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
      style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Productos más vendidos</p>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(124,58,237,0.08)' }}>
          <Icon name="TrendingUp" size={17} color="var(--color-primary)" />
        </div>
      </div>
      {items?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-4 gap-2">
          <Icon name="ShoppingBag" size={28} color="var(--color-muted-foreground)" />
          <p className="text-xs text-center" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Sin ventas registradas aún</p>
        </div>
      ) : (
        <ol className="flex flex-col gap-2">
          {items?.map((item, idx) => {
            const maxQty = items?.[0]?.totalQty || 1;
            const pct = Math.round((item?.totalQty / maxQty) * 100);
            return (
              <li key={idx} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold w-4 flex-shrink-0" style={{ color: idx === 0 ? 'var(--color-primary)' : 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{idx + 1}</span>
                    <span className="text-xs font-medium truncate" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>{item?.productName}</span>
                  </div>
                  <span className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>{item?.totalQty} uds.</span>
                </div>
                <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(124,58,237,0.1)' }}>
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: idx === 0 ? 'var(--color-primary)' : 'rgba(124,58,237,0.4)' }} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
