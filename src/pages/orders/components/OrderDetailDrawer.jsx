import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';
import { getInvoiceByOrderId, createInvoiceFromOrder, registerOrderPayment } from '../../../services/crmService';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  formatDeliveryDurationLabel,
  formatDeliverySegmentDurationLabel,
  formatPreparationDurationLabel,
} from 'utils/orderDates';
import { isOrdersDoubleFlickerDebug, ordersDoubleFlickerLog } from '../ordersDoubleFlickerLog';

const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash',          label: 'Efectivo' },
  { value: 'bank_transfer', label: 'Transferencia' },
  { value: 'card',          label: 'Tarjeta' },
  { value: 'check',         label: 'Cheque' },
  { value: 'other',         label: 'Otro' },
];

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
  const navigate = useNavigate();

  // ── CRM invoice state ──────────────────────────────────────────────────────
  const [orderInvoice, setOrderInvoice] = useState(undefined); // undefined = loading
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [registeringPayment, setRegisteringPayment] = useState(false);
  const [payMethod, setPayMethod] = useState('cash');
  const [crmError, setCrmError] = useState(null);

  useEffect(() => {
    if (!order?.id) return;
    setOrderInvoice(undefined);
    setCrmError(null);
    getInvoiceByOrderId(order.id).then(({ data }) => setOrderInvoice(data ?? null));
  }, [order?.id]);

  const handleGenerateInvoice = async () => {
    if (!order || !business?.id) return;
    setGeneratingInvoice(true);
    setCrmError(null);
    const { data, error } = await createInvoiceFromOrder(business.id, order);
    setGeneratingInvoice(false);
    if (error) { setCrmError(error.message || 'No se pudo crear la nota de venta.'); return; }
    setOrderInvoice(data);
  };

  const handleRegisterPayment = async () => {
    if (!orderInvoice || !business?.id) return;
    setRegisteringPayment(true);
    setCrmError(null);
    const { error } = await registerOrderPayment(business.id, {
      invoiceId: orderInvoice.id,
      orderId: order.id,
      amount: orderInvoice.total,
      currency: business?.currency || 'CLP',
      paymentMethod: payMethod,
    });
    setRegisteringPayment(false);
    if (error) { setCrmError(error.message || 'No se pudo registrar el pago.'); return; }
    // Refresh invoice state and mark order as paid
    setOrderInvoice(prev => ({ ...prev, status: 'pagada' }));
    if (order.paymentStatus !== 'pagado') {
      await onUpdate(order.id, { paymentStatus: 'pagado' });
    }
  };

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
  const currentOrderStatusLabel =
    statusOptions.find((option) => option?.key === currentOrderStatus)?.label || 'Pedido';
  const currentPaymentStatusLabel =
    paymentStatusOptions.find((option) => option?.key === currentPaymentStatus)?.label || 'Pendiente';
  const printLegend = business?.print_legend || 'Gracias por tu pedido 🙌';
  const printableItems = Array.isArray(order?.items) ? order.items : [];
  const handlePrint = () => {
    window.print();
  };

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
    <>
      <style>{`
        @page {
          size: auto;
          margin: 8mm;
        }

        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }

          body * {
            visibility: hidden !important;
          }

          .order-print-sheet,
          .order-print-sheet * {
            visibility: visible !important;
          }

          .order-print-sheet {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 320px !important;
            min-height: auto !important;
            padding: 0 !important;
            margin: 0 auto !important;
            background: #fff !important;
            color: #000 !important;
            font-family: monospace !important;
            font-size: 12px !important;
            line-height: 1.4 !important;
            page-break-inside: avoid !important;
          }

          .order-print-sheet .receipt,
          .order-print-sheet .receipt *,
          .order-print-sheet .receipt-item,
          .order-print-sheet .receipt-item * {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          .order-print-sheet .receipt-price {
            text-align: right !important;
          }

          .order-print-sheet .receipt-legend {
            text-align: center !important;
            font-size: 11px !important;
            line-height: 1.4 !important;
            white-space: pre-wrap !important;
            word-break: break-word !important;
          }
        }
      `}</style>

      <div
        className="fixed inset-0 z-50 flex justify-end order-print-hide"
        style={{ backgroundColor: 'rgba(15,23,42,0.42)' }}
        onClick={onClose}
      >
        <div
          className="h-full w-full max-w-md overflow-y-auto bg-[#f6f7fb] shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white/86 px-4 py-3 backdrop-blur" style={{ borderColor: 'rgba(226,232,240,0.8)' }}>
          <h2 className="text-base font-black" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
            Pedido #{orderShortId(order?.id)}
          </h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-muted" aria-label="Cerrar">
            <Icon name="X" size={20} color="var(--color-muted-foreground)" />
          </button>
          </div>

          <div className="p-4 space-y-5">
          <div className="rounded-2xl border border-white/70 bg-white/70 p-3.5 shadow-[0_10px_26px_rgba(17,24,39,0.05)] space-y-3">
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
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Cliente</p>
              {order?.customerId && (
                <button
                  type="button"
                  onClick={() => { onClose(); navigate(`/customers/${order.customerId}`); }}
                  className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md transition-colors"
                  style={{ color: 'var(--color-primary)', backgroundColor: 'rgba(124,58,237,0.08)', fontFamily: 'var(--font-caption)' }}
                >
                  <Icon name="User" size={12} />
                  Ver ficha
                </button>
              )}
            </div>
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

          <div className="pt-3 border-t space-y-3" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold" style={{ fontFamily: 'var(--font-caption)' }}>Total</span>
              <span className="text-lg font-bold" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-heading)' }}>{formatCLP(order?.totalAmount)}</span>
            </div>
            <button
              type="button"
              onClick={handlePrint}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.99]"
              style={{ backgroundColor: 'var(--color-primary)', color: '#fff', fontFamily: 'var(--font-caption)' }}
            >
              <span aria-hidden>🧾</span>
              Imprimir
            </button>
          </div>

          {/* ── Nota de Venta CRM ──────────────────────────────────────────── */}
          <div className="pt-3 border-t space-y-3" style={{ borderColor: 'var(--color-border)' }}>
            <p className="text-xs font-semibold" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              Nota de Venta CRM
            </p>

            {/* Error banner */}
            {crmError && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                <Icon name="AlertCircle" size={14} color="currentColor" className="shrink-0 mt-0.5" />
                <span>{crmError}</span>
                <button onClick={() => setCrmError(null)} className="ml-auto shrink-0 text-red-400 hover:text-red-600">
                  <Icon name="X" size={12} color="currentColor" />
                </button>
              </div>
            )}

            {/* Loading */}
            {orderInvoice === undefined && (
              <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>Cargando…</p>
            )}

            {/* No invoice yet */}
            {orderInvoice === null && (
              <button
                type="button"
                disabled={generatingInvoice}
                onClick={handleGenerateInvoice}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all disabled:opacity-50"
                style={{ borderColor: '#6366f1', color: '#6366f1', fontFamily: 'var(--font-caption)' }}
              >
                <Icon name="FileText" size={15} color="currentColor" />
                {generatingInvoice ? 'Generando…' : 'Generar nota de venta'}
              </button>
            )}

            {/* Invoice exists */}
            {orderInvoice && orderInvoice.id && (
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-indigo-50 border border-indigo-100">
                  <div className="flex items-center gap-2">
                    <Icon name="FileCheck" size={14} color="#6366f1" />
                    <span className="text-xs font-semibold text-indigo-700" style={{ fontFamily: 'var(--font-caption)' }}>
                      NV-{String(orderInvoice.invoice_number).padStart(4, '0')}
                    </span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    orderInvoice.status === 'pagada'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {orderInvoice.status === 'pagada' ? 'Pagada' : 'Pendiente'}
                  </span>
                </div>

                {/* Register payment — only if not paid */}
                {orderInvoice.status !== 'pagada' && (
                  <div className="space-y-2">
                    <select
                      value={payMethod}
                      onChange={e => setPayMethod(e.target.value)}
                      className="w-full border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50"
                      style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
                    >
                      {PAYMENT_METHOD_OPTIONS.map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={registeringPayment}
                      onClick={handleRegisterPayment}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                      style={{ backgroundColor: '#059669', color: '#fff', fontFamily: 'var(--font-caption)' }}
                    >
                      <Icon name="Banknote" size={15} color="currentColor" />
                      {registeringPayment ? 'Registrando…' : `Registrar pago · ${formatCLP(orderInvoice.total)}`}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      </div>

      <div
        className="order-print-sheet"
        style={{ display: 'none' }}
        aria-hidden="true"
      >
        <div className="receipt" style={{ width: '320px', padding: '16px 14px', fontFamily: 'monospace', fontSize: '12px', lineHeight: 1.4 }}>
          <div style={{ textAlign: 'center', borderBottom: '1px dashed #000', paddingBottom: '8px', marginBottom: '10px' }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {businessName || business?.name || 'Mi negocio'}
            </div>
            <div style={{ marginTop: '4px', fontSize: '11px' }}>Comprobante de pedido</div>
          </div>

          <div style={{ marginBottom: '10px', lineHeight: 1.45 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
              <span>ID</span>
              <strong className="receipt-price">#{orderShortId(order?.id)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
              <span>Fecha</span>
              <strong className="receipt-price" style={{ textAlign: 'right' }}>{formattedOrderDate}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
              <span>Cliente</span>
              <strong className="receipt-price" style={{ textAlign: 'right' }}>{order?.customerName || '—'}</strong>
            </div>
            {order?.customerPhone && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                <span>WhatsApp</span>
                <strong className="receipt-price" style={{ textAlign: 'right' }}>{order.customerPhone}</strong>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
              <span>Estado</span>
              <strong className="receipt-price" style={{ textAlign: 'right' }}>{currentOrderStatusLabel}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
              <span>Pago</span>
              <strong className="receipt-price" style={{ textAlign: 'right' }}>{currentPaymentStatusLabel}</strong>
            </div>
          </div>

          <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '8px 0', marginBottom: '10px' }}>
            {printableItems.length > 0 ? printableItems.map((item, index) => (
              <div className="receipt-item" key={item?.id || `${item?.productName || 'item'}-${index}`} style={{ marginBottom: index === printableItems.length - 1 ? 0 : '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 'bold', wordBreak: 'break-word' }}>{item?.productName || 'Producto'}</div>
                    <div style={{ fontSize: '11px' }}>
                      {item?.quantity ?? 0} x {formatCLP(item?.productPrice)}
                    </div>
                  </div>
                  <div className="receipt-price" style={{ fontWeight: 'bold', whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {formatCLP(item?.subtotal)}
                  </div>
                </div>
              </div>
            )) : (
              <div>Sin productos</div>
            )}
          </div>

          {order?.notes && (
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Notas</div>
              <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{order.notes}</div>
            </div>
          )}

          <div style={{ borderTop: '2px solid #000', paddingTop: '8px', marginTop: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '16px', fontWeight: 'bold' }}>
              <span>Total</span>
              <span className="receipt-price" style={{ textAlign: 'right' }}>{formatCLP(order?.totalAmount)}</span>
            </div>
          </div>

          <div
            className="receipt-legend"
            style={{ borderTop: '1px dashed #000', marginTop: '10px', paddingTop: '10px', textAlign: 'center', fontSize: '11px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
          >
            {printLegend}
          </div>
        </div>
      </div>
    </>
  );
}
