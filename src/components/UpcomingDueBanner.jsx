import React from 'react';

// PROVEEDORES-CORE-3 §10: adaptado al modelo canónico -- recibe
// invoices/suppliers/payments ya cargados por el padre (sin fetch propio,
// igual que antes), balance/isOverdue vienen derivados de
// wa_supplier_invoice_balances, nunca recalculados acá.
export default function UpcomingDueBanner({ invoices = [], suppliers = [], payments = [] }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in7 = new Date(today);
  in7.setDate(in7.getDate() + 7);

  const pending = invoices.filter((inv) => inv.balance > 0);
  const overdue = pending.filter((inv) => inv.isOverdue);
  const dueSoon = pending.filter((inv) => !inv.isOverdue && inv.dueDate && new Date(inv.dueDate) >= today && new Date(inv.dueDate) <= in7);

  const paidThisMonth = payments.filter((p) => {
    const d = new Date(p.paymentDate);
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
  }).reduce((s, p) => s + p.amount, 0);

  const nextDue = pending
    .filter((inv) => inv.dueDate && new Date(inv.dueDate) >= today)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];

  const hasAlerts = overdue.length > 0 || dueSoon.length > 0;
  if (!hasAlerts && !paidThisMonth) return null;

  const supplierMap = Object.fromEntries(suppliers.map((s) => [s.id, s.name]));
  const fmt = (n) => new Intl.NumberFormat('es', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
  const docLabel = (inv) => (inv.documentNumber ? `${inv.documentType === 'boleta' ? 'Boleta' : 'Factura'} ${inv.documentNumber}` : (inv.documentType === 'boleta' ? 'Boleta' : 'Factura'));

  return (
    <div className="space-y-2 mb-4">
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
                  ? `Tenés ${overdue.length} factura${overdue.length > 1 ? 's' : ''} vencida${overdue.length > 1 ? 's' : ''} por $ ${fmt(overdue.reduce((s, inv) => s + inv.balance, 0))}`
                  : `${dueSoon.length} factura${dueSoon.length > 1 ? 's' : ''} vence${dueSoon.length > 1 ? 'n' : ''} esta semana`}
              </p>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                {[...overdue, ...dueSoon].slice(0, 3).map((inv) => (
                  <span key={inv.id} className="text-xs" style={{ color: overdue.length > 0 ? '#B91C1C' : '#B45309', fontFamily: 'var(--font-caption)' }}>
                    {supplierMap[inv.supplierId] ?? 'Proveedor'} · {docLabel(inv)}
                    {inv.dueDate && ` · ${new Date(inv.dueDate).toLocaleDateString('es', { day: 'numeric', month: 'short' })}`}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

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
            📋 {pending.length} factura{pending.length > 1 ? 's' : ''} pendiente{pending.length > 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
}
