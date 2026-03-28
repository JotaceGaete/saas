import React from 'react';
import Icon from 'components/AppIcon';

const BANK_ACCOUNT_TYPE_LABELS = {
  cuenta_corriente: 'Cuenta Corriente',
  cuenta_vista: 'Cuenta Vista',
  cuenta_ahorro: 'Cuenta de Ahorro',
  cuenta_rut: 'Cuenta RUT',
};

export function hasCompleteBankDetails(business) {
  if (!business) return false;
  const name = (business?.bankName || '').trim();
  const number = (business?.bankAccountNumber || '').trim();
  const holder = (business?.bankAccountHolder || '').trim();
  return name.length > 0 && number.length > 0 && holder.length > 0;
}

export function getBankDetailsText(business) {
  if (!business) return '';
  const bank = (business?.bankName || '').trim();
  const type = (business?.bankAccountType || '').trim();
  const typeLabel = BANK_ACCOUNT_TYPE_LABELS[type] || type || '—';
  const number = (business?.bankAccountNumber || '').trim();
  const holder = (business?.bankAccountHolder || '').trim();
  const rut = (business?.bankRut || '').trim();
  const email = (business?.bankEmail || '').trim();

  const lines = [
    `Banco: ${bank || '—'}`,
    `Tipo de cuenta: ${typeLabel}`,
    `Número de cuenta: ${number || '—'}`,
    `Titular: ${holder || '—'}`,
    `RUT: ${rut || '—'}`,
    `Email: ${email || '—'}`,
  ];
  return lines.join('\n');
}

export function getPaymentMessage(order, business, formatCLP) {
  const customerName = (order?.customerName || '').trim();
  const greeting = customerName
    ? `Hola ${customerName}, gracias por tu pedido.`
    : 'Hola, gracias por tu pedido.';
  const total = order?.totalAmount != null ? formatCLP(order.totalAmount) : '—';
  const bankBlock = getBankDetailsText(business);

  return `${greeting}

Total: ${total}

Te dejo los datos para transferencia:
${bankBlock}

Cuando realices la transferencia, envíame el comprobante por este medio.`;
}

/**
 * Bloque único para la página de pedidos: datos bancarios y acciones sin repetir por tarjeta.
 * `sampleOrder`: primer pedido con pago pendiente (opcional) para copiar mensaje / WhatsApp.
 */
export function BankTransferBanner({ business, formatCLP, sampleOrder }) {
  const complete = hasCompleteBankDetails(business);
  const bankText = getBankDetailsText(business);
  const messageText = sampleOrder ? getPaymentMessage(sampleOrder, business, formatCLP) : null;
  const customerPhone = (sampleOrder?.customerPhone || '').replace(/\D/g, '');
  const whatsappUrl = sampleOrder && customerPhone && messageText
    ? `https://wa.me/${customerPhone}?text=${encodeURIComponent(messageText)}`
    : null;

  const copyToClipboard = (text) => {
    if (!text) return;
    navigator.clipboard?.writeText(text)?.catch(() => {});
  };

  return (
    <div
      className="rounded-2xl p-4 mb-6 shadow-sm"
      style={{
        background: 'linear-gradient(135deg, rgba(255,251,235,0.85) 0%, rgba(254, 243, 199, 0.45) 100%)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06), inset 0 1px 0 rgba(255,255,255,0.6)',
        border: '1px solid rgba(245, 158, 11, 0.2)',
      }}
    >
      <h3 className="text-sm font-bold mb-0.5" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
        Cobros por transferencia
      </h3>
      <p className="text-xs mb-3" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
        Datos únicos para todos los pedidos. Para enviar el mensaje con el total de un cliente, usa el detalle del pedido o el botón de abajo si hay un pedido pendiente de ejemplo.
      </p>

      {!complete ? (
        <div
          className="flex items-start gap-3 rounded-xl px-3.5 py-3"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.55)',
            border: '1px solid rgba(251, 191, 36, 0.35)',
            boxShadow: '0 4px 24px -4px rgba(245, 158, 11, 0.2)',
          }}
        >
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: 'rgba(251, 191, 36, 0.35)', color: '#b45309' }}
            aria-hidden
          >
            <Icon name="Lightbulb" size={18} color="currentColor" />
          </div>
          <p className="text-xs leading-relaxed flex-1 min-w-0" style={{ color: '#92400e', fontFamily: 'var(--font-caption)', fontWeight: 600 }}>
            Completa tus datos bancarios en <span className="font-bold">Configuración</span> para usar esta función y enviar datos de pago a tus clientes.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => copyToClipboard(bankText)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-transform duration-150 hover:scale-105 active:scale-[0.98] border shadow-sm"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)', backgroundColor: '#fff' }}
          >
            <Icon name="Copy" size={13} />
            Copiar datos bancarios
          </button>
          {messageText && (
            <button
              type="button"
              onClick={() => copyToClipboard(messageText)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-transform duration-150 hover:scale-105 active:scale-[0.98] border shadow-sm"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)', backgroundColor: '#fff' }}
            >
              <Icon name="Copy" size={13} />
              Copiar mensaje (pedido de ejemplo)
            </button>
          )}
          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-white transition-transform duration-150 hover:scale-105 active:scale-[0.98] shadow-sm"
              style={{ backgroundColor: '#25D366', fontFamily: 'var(--font-caption)' }}
            >
              <Icon name="MessageCircle" size={13} color="#fff" />
              WhatsApp (ejemplo)
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export default function TransferPaymentSection({ order, business, formatCLP }) {
  const paymentPending = (order?.paymentStatus || 'pendiente') === 'pendiente';
  if (!paymentPending) return null;

  const complete = hasCompleteBankDetails(business);
  const bankText = getBankDetailsText(business);
  const messageText = getPaymentMessage(order, business, formatCLP);
  const merchantPhone = (business?.whatsapp || '').replace(/\D/g, '');
  const customerPhone = (order?.customerPhone || '').replace(/\D/g, '');
  const whatsappUrl = customerPhone
    ? `https://wa.me/${customerPhone}?text=${encodeURIComponent(messageText)}`
    : null;

  const copyToClipboard = (text) => {
    if (!text) return;
    navigator.clipboard?.writeText(text)?.catch(() => {});
  };

  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-muted)' }}
    >
      <h3 className="text-sm font-bold mb-0.5" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
        Cobros por transferencia
      </h3>
      <p className="text-xs mb-3" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
        Usa estos datos para responder pedidos más rápido desde tu panel.
      </p>

      {!complete ? (
        <p className="text-xs flex items-start gap-2" style={{ color: '#B45309', fontFamily: 'var(--font-caption)', backgroundColor: 'rgba(245,158,11,0.1)', padding: '10px 12px', borderRadius: '8px' }}>
          <Icon name="AlertCircle" size={14} className="flex-shrink-0 mt-0.5" />
          Completa tus datos bancarios en Configuración para usar esta función.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => copyToClipboard(bankText)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all hover:opacity-90 active:scale-[0.98] border"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)', backgroundColor: '#fff' }}
          >
            <Icon name="Copy" size={13} />
            Copiar datos bancarios
          </button>
          <button
            type="button"
            onClick={() => copyToClipboard(messageText)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all hover:opacity-90 active:scale-[0.98] border"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)', backgroundColor: '#fff' }}
          >
            <Icon name="Copy" size={13} />
            Copiar mensaje de cobro
          </button>
          {whatsappUrl ? (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ backgroundColor: '#25D366', fontFamily: 'var(--font-caption)' }}
            >
              <Icon name="MessageCircle" size={13} color="#fff" />
              Abrir WhatsApp Web
            </a>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-muted-foreground" style={{ fontFamily: 'var(--font-caption)' }}>
              <Icon name="MessageCircle" size={13} />
              Teléfono del cliente no registrado
            </span>
          )}
        </div>
      )}
    </div>
  );
}
