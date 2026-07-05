import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';
import { formatMoney } from '../../../utils/formatMoney';

export default function SuppliersSummaryCard({ businessId, currency = 'CLP' }) {
  const fmt = (n) => formatMoney(n, currency);
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    (async () => {
      try {
        const [{ getSuppliers, getAllBusinessDebts }] = await Promise.all([
          import('../../../services/waBusinessService'),
        ]);
        const [{ data: suppliers }, { data: debts }] = await Promise.all([
          getSuppliers(businessId),
          getAllBusinessDebts(businessId),
        ]);
        if (cancelled) return;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const pending = (debts ?? []).filter((d) => d.status === 'pending');
        const overdue = pending.filter((d) => d.dueDate && new Date(d.dueDate) < today);
        const totalPending = pending.reduce((s, d) => s + (d.balance ?? d.amount), 0);
        const nextDue = pending.filter((d) => d.dueDate).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];
        setData({ supplierCount: (suppliers ?? []).length, totalPending, overdueCount: overdue.length, nextDue });
      } catch (_) { /* silent */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [businessId]);

  if (loading) {
    return (
      <div className="dashboard-premium-card rounded-xl p-4 animate-pulse" style={{ minHeight: '100px' }}>
        <div className="h-3 w-24 rounded bg-muted mb-3" />
        <div className="h-8 w-32 rounded bg-muted" />
      </div>
    );
  }

  if (!data || data.supplierCount === 0) return null;

  const hasOverdue = data.overdueCount > 0;

  return (
    <button
      onClick={() => navigate('/proveedores')}
      className="dashboard-premium-card rounded-xl p-4 flex flex-col gap-3 w-full text-left transition-all hover:shadow-md"
      style={hasOverdue ? { ringWidth: '1px', outline: '1px solid #FECACA' } : {}}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <p className="truncate text-[11px] font-bold uppercase leading-tight tracking-[0.1em]" style={{ color: hasOverdue ? '#B91C1C' : 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            Proveedores
          </p>
          {hasOverdue && (
            <span className="flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#DC2626', fontFamily: 'var(--font-caption)' }}>
              {data.overdueCount} vencida{data.overdueCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: hasOverdue ? 'rgba(239,68,68,0.1)' : 'rgba(99,102,241,0.1)' }}>
          <Icon name="Truck" size={15} color={hasOverdue ? '#DC2626' : '#6366F1'} />
        </div>
      </div>

      <div>
        <p className="text-[2rem] font-black leading-none tabular-nums" style={{ fontFamily: 'var(--font-stat)', color: hasOverdue ? '#DC2626' : 'var(--color-foreground)' }}>
          $ {fmt(data.totalPending)}
        </p>
        <p className="mt-1.5 text-xs leading-snug" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          {hasOverdue
            ? `⚠ ${data.overdueCount} deuda${data.overdueCount > 1 ? 's' : ''} vencida${data.overdueCount > 1 ? 's' : ''}`
            : data.nextDue
              ? `Próximo vencimiento: ${new Date(data.nextDue.dueDate).toLocaleDateString('es', { day: 'numeric', month: 'short' })}`
              : `${data.supplierCount} proveedor${data.supplierCount !== 1 ? 'es' : ''}`}
        </p>
      </div>

      <div className="flex items-center justify-between gap-1.5 pt-0.5">
        <span className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          {data.supplierCount} proveedor{data.supplierCount !== 1 ? 'es' : ''}
        </span>
        <span className="text-xs font-semibold flex items-center gap-0.5" style={{ color: hasOverdue ? '#DC2626' : 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}>
          Ver detalle <Icon name="ChevronRight" size={12} color="currentColor" />
        </span>
      </div>
    </button>
  );
}
