import React from 'react';

export default function UpcomingDueBanner({ debts = [], suppliers = [] }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in7 = new Date(today);
  in7.setDate(in7.getDate() + 7);

  const pending = debts.filter((d) => d.status === 'pending');
  const overdue = pending.filter((d) => d.dueDate && new Date(d.dueDate) < today);
  const dueSoon = pending.filter((d) => d.dueDate && new Date(d.dueDate) >= today && new Date(d.dueDate) <= in7);

  const paidThisMonth = debts.filter((d) => {
    if (d.status !== 'paid' || !d.paidAt) return false;
    const p = new Date(d.paidAt);
    return p.getFullYear() === today.getFullYear() && p.getMonth() === today.getMonth();
  }).reduce((s, d) => s + d.amount, 0);

  const nextDue = pending
    .filter((d) => d.dueDate && new Date(d.dueDate) >= today)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];

  const hasAlerts = overdue.length > 0 || dueSoon.length > 0;
  if (!hasAlerts && !paidThisMonth) return null;

  const supplierMap = Object.fromEntries(suppliers.map((s) => [s.id, s.name]));
  const fmt = (n) => new Intl.NumberFormat('es', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-2 mb-4">
      {/* Alerta principal: vencidas o próximas */}
      {hasAlerts && (
        <div
          className="rounded-xl border px-4 py-3"
          style={{
            background: overdue.length > 0
              ? 'linear-gradient(135deg, #FFF5F5 0%, #FEF2F2 100%)'
              : 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
            borderColor: overdue.length > 0 ? '#FECACA' : '#FCD34D',
          }}
        >
          <div className="flex items-start gap-3">
            <span className="text-base flex-shrink-0 mt-0.5">{overdue.length > 0 ? '⚠️' : '🟡'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: overdue.length > 0 ? '#991B1B' : '#92400E', fontFamily: 'var(--font-caption)' }}>
                {overdue.length > 0
                  ? `Tenés ${overdue.length} deuda${overdue.length > 1 ? 's' : ''} vencida${overdue.length > 1 ? 's' : ''} por $ ${fmt(overdue.reduce((s, d) => s + (d.balance ?? d.amount), 0))}`
                  : `${dueSoon.length} deuda${dueSoon.length > 1 ? 's' : ''} vence${dueSoon.length > 1 ? 'n' : ''} esta semana`}
              </p>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                {[...overdue, ...dueSoon].slice(0, 3).map((d) => (
                  <span key={d.id} className="text-xs" style={{ color: overdue.length > 0 ? '#B91C1C' : '#B45309', fontFamily: 'var(--font-caption)' }}>
                    {supplierMap[d.supplierId] ?? 'Proveedor'} · {d.description}
                    {d.dueDate && ` · ${new Date(d.dueDate).toLocaleDateString('es', { day: 'numeric', month: 'short' })}`}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fila de métricas contextuales */}
      <div className="flex flex-wrap gap-2">
        {paidThisMonth > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: '#ECFDF5', color: '#059669', fontFamily: 'var(--font-caption)' }}>
            💰 Pagaste $ {fmt(paidThisMonth)} este mes
          </div>
        )}
        {nextDue && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: '#F0F9FF', color: '#0369A1', fontFamily: 'var(--font-caption)' }}>
            📅 Próximo vencimiento: {new Date(nextDue.dueDate).toLocaleDateString('es', { day: 'numeric', month: 'short' })} · {supplierMap[nextDue.supplierId] ?? ''}
          </div>
        )}
        {pending.length > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: '#EEF2FF', color: '#6366F1', fontFamily: 'var(--font-caption)' }}>
            📋 {pending.length} deuda{pending.length > 1 ? 's' : ''} pendiente{pending.length > 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
}
