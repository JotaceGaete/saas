import React, { useState } from 'react';
import Icon from 'components/AppIcon';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function OrderDetailDrawer({
  order,
  business,
  businessName,
  onClose,
  onUpdate,
  statusOptions = [],
  paymentStatusOptions = [],
  StatusBadge,
  PaymentStatusBadge,
  formatCLP,
  orderShortId,
}) {
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);

  const formattedDate = order?.createdAt
    ? format(new Date(order.createdAt), "d 'de' MMMM yyyy, HH:mm", { locale: es })
    : '—';

  const whatsappHref = order?.customerPhone
    ? `https://wa.me/${order.customerPhone.replace(/\D/g, '')}`
    : null;

  const currentOrderStatus = order?.status || 'pedido';
  const currentPaymentStatus = order?.paymentStatus || 'pendiente';

  const handleStatusChange = async (newStatus) => {
    if (newStatus === currentOrderStatus) return;
    setSavingStatus(true);
    await onUpdate(order?.id, { status: newStatus });
    setSavingStatus(false);
  };

  const handlePaymentStatusChange = async (newPaymentStatus) => {
    if (newPaymentStatus === currentPaymentStatus) return;
    setSavingPayment(true);
    await onUpdate(order?.id, { paymentStatus: newPaymentStatus });
    setSavingPayment(false);
  };

  const handleMarkAsPaid = async () => {
    if (currentPaymentStatus === 'pagado') return;
    setSavingPayment(true);
    await onUpdate(order?.id, { paymentStatus: 'pagado' });
    setSavingPayment(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md h-full overflow-y-auto bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b bg-white" style={{ borderColor: 'var(--color-border)' }}>
          <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
            Pedido #{orderShortId(order?.id)}
          </h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-muted" aria-label="Cerrar">
            <Icon name="X" size={20} color="var(--color-muted-foreground)" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          <div>
            <p className="text-xs font-semibold mb-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Fecha</p>
            <p className="text-sm" style={{ fontFamily: 'var(--font-caption)' }}>{formattedDate}</p>
          </div>

          <div>
            <p className="text-xs font-semibold mb-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Cliente</p>
            <p className="text-sm font-medium" style={{ fontFamily: 'var(--font-caption)' }}>{order?.customerName || '—'}</p>
            {order?.customerPhone && (
              <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm mt-0.5" style={{ color: '#25D366', fontFamily: 'var(--font-caption)' }}>
                <Icon name="MessageCircle" size={14} />
                {order.customerPhone}
              </a>
            )}
            {order?.customerEmail && (
              <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{order.customerEmail}</p>
            )}
          </div>

          {order?.notes && (
            <div>
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Notas del cliente</p>
              <p className="text-sm" style={{ fontFamily: 'var(--font-caption)' }}>{order.notes}</p>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Estado del pedido</p>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  disabled={savingStatus}
                  onClick={() => handleStatusChange(s.key)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all disabled:opacity-50"
                  style={{
                    borderColor: currentOrderStatus === s.key ? s.color : 'var(--color-border)',
                    backgroundColor: currentOrderStatus === s.key ? s.bg : 'transparent',
                    color: currentOrderStatus === s.key ? s.color : 'var(--color-muted-foreground)',
                    fontFamily: 'var(--font-caption)',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--color-muted-foreground)' }}>Actual: {StatusBadge && <StatusBadge status={currentOrderStatus} />}</p>
          </div>

          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Estado del pago</p>
            <div className="flex flex-wrap gap-2 items-center">
              {paymentStatusOptions.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  disabled={savingPayment}
                  onClick={() => handlePaymentStatusChange(s.key)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all disabled:opacity-50"
                  style={{
                    borderColor: currentPaymentStatus === s.key ? s.color : 'var(--color-border)',
                    backgroundColor: currentPaymentStatus === s.key ? s.bg : 'transparent',
                    color: currentPaymentStatus === s.key ? s.color : 'var(--color-muted-foreground)',
                    fontFamily: 'var(--font-caption)',
                  }}
                >
                  {s.label}
                </button>
              ))}
              {currentPaymentStatus !== 'pagado' && (
                <button
                  type="button"
                  disabled={savingPayment}
                  onClick={handleMarkAsPaid}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                  style={{ backgroundColor: 'rgba(16,185,129,0.12)', color: '#059669', fontFamily: 'var(--font-caption)' }}
                >
                  Marcar como pagado
                </button>
              )}
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--color-muted-foreground)' }}>Actual: {PaymentStatusBadge && <PaymentStatusBadge paymentStatus={currentPaymentStatus} />}</p>
          </div>

          <div
            className="rounded-xl border p-3 text-xs"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-muted)', fontFamily: 'var(--font-caption)', color: 'var(--color-muted-foreground)' }}
          >
            Los datos para cobros por transferencia están en la banda <strong className="text-foreground">Cobros por transferencia</strong> en la parte superior de la página Pedidos (una sola vez para todos los pedidos).
          </div>

          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Productos</p>
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
              <table className="w-full text-sm" style={{ fontFamily: 'var(--font-caption)' }}>
                <thead>
                  <tr className="text-left text-xs font-semibold" style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-muted-foreground)' }}>
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2 text-center">Cant.</th>
                    <th className="px-3 py-2 text-right">P. unit.</th>
                    <th className="px-3 py-2 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody style={{ color: 'var(--color-foreground)' }}>
                  {(order?.items || []).map((item) => (
                    <tr key={item?.id} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                      <td className="px-3 py-2">{item?.productName || '—'}</td>
                      <td className="px-3 py-2 text-center">{item?.quantity ?? 0}</td>
                      <td className="px-3 py-2 text-right">{formatCLP(item?.productPrice)}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatCLP(item?.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pt-3 border-t flex justify-between items-center" style={{ borderColor: 'var(--color-border)' }}>
            <span className="text-sm font-semibold" style={{ fontFamily: 'var(--font-caption)' }}>Total</span>
            <span className="text-lg font-bold" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-heading)' }}>{formatCLP(order?.totalAmount)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
