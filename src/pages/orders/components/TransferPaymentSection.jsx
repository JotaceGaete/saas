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
              Sin teléfono del cliente
            </span>
          )}
        </div>
      )}
    </div>
  );
}
