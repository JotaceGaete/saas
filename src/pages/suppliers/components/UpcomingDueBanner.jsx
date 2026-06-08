import React from 'react';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import Icon from 'components/AppIcon';

export default function UpcomingDueBanner({ debts, onSupplierClick }) {
  const today = new Date();
  const upcoming = debts.filter((d) => {
    if (!d.due_date || d.status === 'paid') return false;
    const days = differenceInCalendarDays(parseISO(d.due_date), today);
    return days >= 0 && days <= 7;
  });

  if (upcoming.length === 0) return null;

  return (
    <div
      className="mx-4 md:mx-6 mt-4 rounded-xl p-3.5 flex items-start gap-3"
      style={{ backgroundColor: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.3)' }}
    >
      <div className="mt-0.5 flex-shrink-0">
        <Icon name="AlertTriangle" size={16} color="rgb(234,88,12)" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold" style={{ color: 'rgb(154,52,18)' }}>
          {upcoming.length} deuda{upcoming.length > 1 ? 's' : ''} vence{upcoming.length > 1 ? 'n' : ''} en los próximos 7 días
        </p>
        <ul className="mt-1 space-y-0.5">
          {upcoming.map((d) => {
            const days = differenceInCalendarDays(parseISO(d.due_date), today);
            return (
              <li key={d.id} className="text-xs flex gap-1" style={{ color: 'rgb(154,52,18)' }}>
                <span
                  className="font-medium cursor-pointer hover:underline"
                  onClick={() => onSupplierClick && onSupplierClick(d.supplier_id)}
                >
                  {d.supplier_name || d.description}
                </span>
                <span className="opacity-75">
                  — {d.description} · {days === 0 ? 'hoy' : `en ${days} día${days > 1 ? 's' : ''}`}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
