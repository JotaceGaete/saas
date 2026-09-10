import React, { useState } from 'react';
import Icon from 'components/AppIcon';
import { registerManualOrderPayment, getManualPaymentErrorMessage } from '../../../services/orderPaymentService';

const MANUAL_METHOD_OPTIONS = [
  { value: 'cash', label: 'Efectivo', icon: 'Banknote' },
  { value: 'bank_transfer', label: 'Transferencia bancaria', icon: 'Landmark' },
  { value: 'other', label: 'Otro', icon: 'Receipt' },
];

/**
 * Modal de registro de pago manual -- MP-PAYMENT-DETAIL-2.
 * Único camino para marcar un pedido "pagado" sin Mercado Pago: exige
 * elegir un método (cash|bank_transfer|other) y llama a
 * wa_register_manual_order_payment -- nunca escribe el estado del
 * pedido directamente desde el cliente. Monto/moneda vienen fijos del
 * pedido (la RPC exige que coincidan exactamente) -- no editables en
 * esta fase.
 */
export default function ManualPaymentModal({ order, formatCLP, onClose, onSuccess }) {
  const [method, setMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!order?.id || loading) return;
    setLoading(true);
    setError(null);
    const { error: rpcError } = await registerManualOrderPayment({
      orderId: order.id,
      method,
      amount: order.totalAmount,
      currency: order.currency,
      notes,
    });
    setLoading(false);
    if (rpcError) {
      setError(getManualPaymentErrorMessage(rpcError.message));
      return;
    }
    onSuccess?.();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm"
        style={{ border: '1px solid var(--color-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-2">
            <Icon name="Banknote" size={18} color="var(--color-primary)" />
            <h2 className="font-bold text-base" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
              Registrar pago
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Icon name="X" size={16} color="var(--color-muted-foreground)" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
              <Icon name="AlertCircle" size={14} color="currentColor" className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              Método de pago
            </p>
            <div className="grid grid-cols-1 gap-2">
              {MANUAL_METHOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={loading}
                  onClick={() => setMethod(opt.value)}
                  className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium border transition-all disabled:opacity-50"
                  style={{
                    borderColor: method === opt.value ? 'var(--color-primary)' : 'var(--color-border)',
                    backgroundColor: method === opt.value ? 'rgba(124,58,237,0.08)' : 'transparent',
                    color: method === opt.value ? 'var(--color-primary)' : 'var(--color-foreground)',
                    fontFamily: 'var(--font-caption)',
                  }}
                >
                  <Icon name={opt.icon} size={16} color="currentColor" />
                  {opt.label}
                  {method === opt.value && (
                    <Icon name="Check" size={14} color="currentColor" className="ml-auto" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--color-muted)' }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                Monto a registrar
              </span>
              <span className="text-base font-bold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>
                {formatCLP?.(order?.totalAmount)}
              </span>
            </div>
          </div>

          <div>
            <label htmlFor="manual-payment-notes" className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              Nota (opcional)
            </label>
            <textarea
              id="manual-payment-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={loading}
              rows={2}
              placeholder="Ej: pagó en mostrador al retirar"
              className="w-full border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
            style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-60"
            style={{ backgroundColor: '#059669', fontFamily: 'var(--font-caption)' }}
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Icon name="Check" size={15} color="#fff" />
            )}
            {loading ? 'Registrando…' : 'Registrar pago'}
          </button>
        </div>
      </div>
    </div>
  );
}
