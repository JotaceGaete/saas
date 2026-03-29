import React, { useState } from 'react';
import { DollarSign, Check, Loader2 } from 'lucide-react';

/**
 * Conciliación de caja: verde = dinero registrado como ingresado; gris = aún no conciliado.
 * Persiste en `wa_orders.payment_status` (`pendiente` | `pagado`) vía `onUpdate` → `updateOrder`.
 */
export default function PaymentStatusToggle({
  orderId,
  paymentStatus,
  onUpdate,
  disabled = false,
}) {
  const [loading, setLoading] = useState(false);
  const ps = paymentStatus || 'pendiente';
  const isPaid = ps === 'pagado';
  const isVoid = ps === 'anulado';

  if (isVoid) {
    return (
      <span
        className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold border border-gray-200 bg-gray-50 text-gray-500"
        style={{ fontFamily: 'var(--font-caption)' }}
      >
        Pago anulado
      </span>
    );
  }

  const handleClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || loading || !orderId) return;
    const next = isPaid ? 'pendiente' : 'pagado';
    setLoading(true);
    try {
      const out = onUpdate?.(orderId, { paymentStatus: next });
      if (out && typeof out.then === 'function') await out;
    } finally {
      setLoading(false);
    }
  };

  const busy = loading || disabled;

  if (isPaid) {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        title="Clic para marcar como no conciliado (aún no ingresa al banco)"
        className={[
          'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors shrink-0',
          busy ? 'opacity-60 cursor-wait' : 'hover:bg-emerald-200',
          'bg-emerald-100 text-emerald-800 border-emerald-200',
        ].join(' ')}
        style={{ fontFamily: 'var(--font-caption)' }}
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" strokeWidth={2.5} aria-hidden />
        ) : (
          <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={3} aria-hidden />
        )}
        PAGADO
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      title="Marcar cuando el pago ya ingresó a tu banco / caja"
      className={[
        'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors shrink-0',
        busy ? 'opacity-60 cursor-wait' : 'hover:bg-gray-100',
        'bg-gray-50 text-gray-600 border-gray-200',
      ].join(' ')}
      style={{ fontFamily: 'var(--font-caption)' }}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-gray-500" strokeWidth={2} aria-hidden />
      ) : (
        <DollarSign className="w-3.5 h-3.5 shrink-0" strokeWidth={2} aria-hidden />
      )}
      MARCAR PAGO
    </button>
  );
}
