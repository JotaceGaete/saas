import React from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';

export default function UpcomingDueBanner({ debts = [], suppliers = [] }) {
  const navigate = useNavigate();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in7 = new Date(today);
  in7.setDate(in7.getDate() + 7);

  const upcoming = debts.filter((d) => {
    if (d.status !== 'pending' || !d.dueDate) return false;
    const due = new Date(d.dueDate);
    return due >= today && due <= in7;
  });

  const overdue = debts.filter((d) => {
    if (d.status !== 'pending' || !d.dueDate) return false;
    return new Date(d.dueDate) < today;
  });

  if (upcoming.length === 0 && overdue.length === 0) return null;

  const supplierMap = Object.fromEntries(suppliers.map((s) => [s.id, s.name]));

  const items = [
    ...overdue.map((d) => ({ ...d, _type: 'overdue' })),
    ...upcoming.map((d) => ({ ...d, _type: 'upcoming' })),
  ].slice(0, 4);

  return (
    <div
      className="rounded-xl border px-4 py-3 mb-4"
      style={{
        background: overdue.length > 0
          ? 'linear-gradient(135deg, #FFF5F5 0%, #FEF2F2 100%)'
          : 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
        borderColor: overdue.length > 0 ? '#FECACA' : '#FCD34D',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5"
          style={{ backgroundColor: overdue.length > 0 ? '#FEE2E2' : '#FEF3C7' }}
        >
          <Icon
            name={overdue.length > 0 ? 'AlertTriangle' : 'Clock'}
            size={16}
            color={overdue.length > 0 ? '#DC2626' : '#D97706'}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: overdue.length > 0 ? '#991B1B' : '#92400E', fontFamily: 'var(--font-caption)' }}>
            {overdue.length > 0
              ? `${overdue.length} deuda${overdue.length > 1 ? 's' : ''} vencida${overdue.length > 1 ? 's' : ''}`
              : `${upcoming.length} deuda${upcoming.length > 1 ? 's' : ''} por vencer esta semana`}
          </p>
          <div className="mt-1.5 space-y-1">
            {items.map((d) => (
              <div key={d.id} className="flex items-center gap-1.5 text-xs" style={{ color: overdue.length > 0 ? '#B91C1C' : '#B45309', fontFamily: 'var(--font-caption)' }}>
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: d._type === 'overdue' ? '#DC2626' : '#D97706' }}
                />
                <span className="font-medium">{supplierMap[d.supplierId] ?? 'Proveedor'}</span>
                <span className="opacity-70">·</span>
                <span className="truncate">{d.description}</span>
                {d.dueDate && (
                  <>
                    <span className="opacity-70">·</span>
                    <span className="flex-shrink-0">
                      {d._type === 'overdue'
                        ? `vencida ${new Date(d.dueDate).toLocaleDateString('es', { day: 'numeric', month: 'short' })}`
                        : `vence ${new Date(d.dueDate).toLocaleDateString('es', { day: 'numeric', month: 'short' })}`}
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
        <button
          onClick={() => navigate('/proveedores')}
          className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          style={{
            backgroundColor: overdue.length > 0 ? '#FCA5A5' : '#FCD34D',
            color: overdue.length > 0 ? '#7F1D1D' : '#78350F',
            fontFamily: 'var(--font-caption)',
          }}
        >
          Ver
        </button>
      </div>
    </div>
  );
}
