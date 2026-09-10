import React, { useState } from 'react';
import Icon from 'components/AppIcon';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const METHOD_LABELS = {
  checkout_pro: 'Checkout Pro',
  point: 'Point',
  qr: 'QR',
  cash: 'Efectivo',
  bank_transfer: 'Transferencia bancaria',
  other: 'Otro',
};

const METHOD_ICONS = {
  checkout_pro: 'CreditCard',
  point: 'CreditCard',
  qr: 'QrCode',
  cash: 'Banknote',
  bank_transfer: 'Landmark',
  other: 'Receipt',
};

function formatPaidAt(paidAt) {
  if (!paidAt) return '—';
  return format(new Date(paidAt), "d 'de' MMMM yyyy, HH:mm", { locale: es });
}

function Row({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex justify-between items-baseline gap-3">
      <span className="text-xs font-semibold shrink-0" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
        {label}
      </span>
      <span className="text-sm font-medium text-right" style={{ fontFamily: 'var(--font-caption)' }}>{value}</span>
    </div>
  );
}

/**
 * Ficha visible de pago del pedido -- MP-PAYMENT-DETAIL-2. Lee
 * exclusivamente wa_order_payments (ya resuelto por el caller vía
 * orderPaymentService.getOrderPayment) -- nunca inventa un valor que
 * la fila no trae (mp_fee/net_amount NULL se omiten, no se muestran
 * como $0 ni "—").
 */
export default function OrderPaymentDetail({ orderPayment, paymentStatus, business, formatCLP }) {
  const [copied, setCopied] = useState(false);

  const handleCopyId = async () => {
    if (!orderPayment?.providerPaymentId) return;
    try {
      await navigator.clipboard.writeText(orderPayment.providerPaymentId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Copia opcional -- si falla, el ID sigue visible y seleccionable a mano.
    }
  };

  if (orderPayment === undefined) {
    return (
      <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>Cargando…</p>
    );
  }

  if (!orderPayment) {
    if (paymentStatus === 'pagado') {
      return (
        <div className="flex items-center gap-2 p-2.5 rounded-lg" style={{ backgroundColor: 'var(--color-muted)' }}>
          <Icon name="HelpCircle" size={14} color="var(--color-muted-foreground)" />
          <span className="text-xs font-medium" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            Pagado — método no registrado
          </span>
        </div>
      );
    }
    return null;
  }

  const isMp = orderPayment.provider === 'mercado_pago';
  const methodLabel = METHOD_LABELS[orderPayment.method] || orderPayment.method;
  const methodIcon = METHOD_ICONS[orderPayment.method] || 'Receipt';
  const registeredByMe = !isMp && orderPayment.registeredBy && business?.user_id && orderPayment.registeredBy === business.user_id;

  return (
    <div className="rounded-xl border p-3.5 space-y-2.5" style={{ borderColor: 'var(--color-border)', backgroundColor: '#fff' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: isMp ? 'rgba(0,158,227,0.12)' : 'rgba(5,150,105,0.12)' }}
          >
            <Icon name={methodIcon} size={14} color={isMp ? '#009EE3' : '#059669'} />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight" style={{ fontFamily: 'var(--font-heading)' }}>
              {isMp ? 'Mercado Pago' : methodLabel}
            </p>
            <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              {isMp ? methodLabel : 'Pago manual'}
            </p>
          </div>
        </div>
        {orderPayment.status === 'confirmed' && (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: 'rgba(5,150,105,0.12)', color: '#059669' }}
          >
            <Icon name="CheckCircle2" size={11} color="currentColor" />
            Confirmado
          </span>
        )}
      </div>

      <div className="pt-2 border-t space-y-1.5" style={{ borderColor: 'var(--color-border)' }}>
        <Row label="Importe" value={formatCLP?.(orderPayment.grossAmount)} />
        <Row label="Moneda" value={orderPayment.currency} />
        <Row label="Fecha y hora" value={formatPaidAt(orderPayment.paidAt)} />

        {isMp && (
          <>
            <Row label="ID de pago" value={
              orderPayment.providerPaymentId ? (
                <button
                  type="button"
                  onClick={handleCopyId}
                  className="inline-flex items-center gap-1 font-mono text-xs hover:underline"
                  title="Copiar ID de pago"
                >
                  {orderPayment.providerPaymentId}
                  <Icon name={copied ? 'Check' : 'Copy'} size={11} color="currentColor" />
                </button>
              ) : null
            } />
            <Row label="Comisión Walinka" value={formatCLP?.(orderPayment.walinkaFee)} />
            {orderPayment.mpFee !== null && <Row label="Comisión Mercado Pago" value={formatCLP?.(orderPayment.mpFee)} />}
            {orderPayment.netAmount !== null && <Row label="Neto comercio" value={formatCLP?.(orderPayment.netAmount)} />}
            {orderPayment.payerName && <Row label="Pagador" value={orderPayment.payerName} />}
            {orderPayment.payerEmail && <Row label="Email pagador" value={orderPayment.payerEmail} />}
          </>
        )}

        {!isMp && (
          <>
            <Row label="Comisión Walinka" value={formatCLP?.(0)} />
            {registeredByMe && <Row label="Registrado por" value="Ti" />}
            {orderPayment.notes && <Row label="Nota" value={orderPayment.notes} />}
          </>
        )}
      </div>
    </div>
  );
}
