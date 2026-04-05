import React, { useState } from 'react';
import Icon from 'components/AppIcon';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  formatDeliveryDurationLabel,
  formatDeliverySegmentDurationLabel,
  formatPreparationDurationLabel,
} from 'utils/orderDates';
import { isOrdersDoubleFlickerDebug, ordersDoubleFlickerLog } from '../ordersDoubleFlickerLog';

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

  const formattedOrderDate = order?.createdAt
    ? format(new Date(order.createdAt), "d 'de' MMMM yyyy, HH:mm", { locale: es })
    : '—';
  const sentIso = order?.sentAt || null;
  const formattedSentDate = sentIso
    ? format(new Date(sentIso), "d 'de' MMMM yyyy, HH:mm", { locale: es })
    : null;
  const formattedDeliveredDate =
    order?.status === 'entregado' && order?.deliveredAt
      ? format(new Date(order.deliveredAt), "d 'de' MMMM yyyy, HH:mm", { locale: es })
      : null;

  const preparationLabel = formatPreparationDurationLabel(order);
  const deliverySegmentLabel = formatDeliverySegmentDurationLabel(order);
  const totalDurationLabel = formatDeliveryDurationLabel(order);
  const hasAnyDurationRow =
    preparationLabel || deliverySegmentLabel || totalDurationLabel;

  const whatsappHref = order?.customerPhone
    ? `https://wa.me/${order.customerPhone.replace(/\D/g, '')}`
    : null;

  const currentOrderStatus = order?.status || 'pedido';
  const currentPaymentStatus = order?.paymentStatus || 'pendiente';

  const handleStatusChange = async (newStatus) => {
    if (newStatus === currentOrderStatus) return;
    if (isOrdersDoubleFlickerDebug()) {
      ordersDoubleFlickerLog('setSavingStatus', { value: true, prevValue: savingStatus, changedValue: savingStatus !== true });
    }
    setSavingStatus(true);
    await onUpdate(order?.id, { status: newStatus });
    if (isOrdersDoubleFlickerDebug()) {
      ordersDoubleFlickerLog('setSavingStatus', { value: false, prevValue: true, changedValue: true });
    }
    setSavingStatus(false);
  };

  const handlePaymentStatusChange = async (newPaymentStatus) => {
    if (newPaymentStatus === currentPaymentStatus) return;
    if (isOrdersDoubleFlickerDebug()) {
      ordersDoubleFlickerLog('setSavingPayment', { value: true, prevValue: savingPayment, changedValue: savingPayment !== true });
    }
    setSavingPayment(true);
    await onUpdate(order?.id, { paymentStatus: newPaymentStatus });
    if (isOrdersDoubleFlickerDebug()) {
      ordersDoubleFlickerLog('setSavingPayment', { value: false, prevValue: true, changedValue: true });
    }
    setSavingPayment(false);
  };

  const handleMarkAsPaid = async () => {
    if (currentPaymentStatus === 'pagado') return;
    if (isOrdersDoubleFlickerDebug()) {
      ordersDoubleFlickerLog('setSavingPayment', { value: true, prevValue: savingPayment, changedValue: savingPayment !== true });
    }
    setSavingPayment(true);
    await onUpdate(order?.id, { paymentStatus: 'pagado' });
    if (isOrdersDoubleFlickerDebug()) {
      ordersDoubleFlickerLog('setSavingPayment', { value: false, prevValue: true, changedValue: true });
    }
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
          <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'rgba(124,58,237,0.04)' }}>
            <div>
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Pedido</p>
              <p className="text-sm tabular-nums font-medium" style={{ fontFamily: 'var(--font-caption)' }}>{formattedOrderDate}</p>
            </div>
            {formattedSentDate && (
              <div>
                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Enviado</p>
                <p className="text-sm tabular-nums font-medium" style={{ fontFamily: 'var(--font-caption)' }}>{formattedSentDate}</p>
              </div>
            )}
            {order?.status === 'entregado' && (
              <div>
                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Entregado</p>
                {formattedDeliveredDate ? (
                  <p className="text-sm tabular-nums font-medium" style={{ fontFamily: 'var(--font-caption)' }}>{formattedDeliveredDate}</p>
                ) : (
                  <p className="text-sm font-medium" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Sin hora registrada</p>
                )}
              </div>
            )}
            {hasAnyDurationRow && (
              <div className="pt-2 border-t space-y-2" style={{ borderColor: 'var(--color-border)' }}>
                {preparationLabel && (
                  <div className="flex justify-between items-baseline gap-3">
                    <p className="text-xs font-semibold shrink-0" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Preparación</p>
                    <p className="text-base font-bold tabular-nums text-right" style={{ color: '#059669', fontFamily: 'var(--font-heading)' }}>{preparationLabel}</p>
                  </div>
                )}
                {deliverySegmentLabel && (
                  <div className="flex justify-between items-baseline gap-3">
                    <p className="text-xs font-semibold shrink-0" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Entrega</p>
                    <p className="text-base font-bold tabular-nums text-right" style={{ color: '#059669', fontFamily: 'var(--font-heading)' }}>{deliverySegmentLabel}</p>
                  </div>
                )}
                {totalDurationLabel && (
                  <div className="flex justify-between items-baseline gap-3">
                    <p className="text-xs font-semibold shrink-0" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Total</p>
                    <p className="text-base font-bold tabular-nums text-right" style={{ color: '#059669', fontFamily: 'var(--font-heading)' }}>{totalDurationLabel}</p>
                  </div>
                )}
              </div>
            )}
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
