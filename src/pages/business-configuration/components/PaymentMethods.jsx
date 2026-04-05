import React from 'react';
import Icon from 'components/AppIcon';

const PAYMENT_OPTIONS = [
  { key: 'efectivo', label: 'Efectivo', icon: 'Banknote' },
  { key: 'tarjeta', label: 'Tarjeta de crédito/débito', icon: 'CreditCard' },
  { key: 'mercadopago', label: 'MercadoPago', icon: 'Wallet' },
  { key: 'paypal', label: 'PayPal', icon: 'Globe' },
  { key: 'nequi', label: 'Nequi / Daviplata', icon: 'Smartphone' },
];

export default function PaymentMethods({ selected, onChange }) {
  const toggle = (key) => {
    if (selected?.includes(key)) {
      onChange(selected?.filter((k) => k !== key));
    } else {
      onChange([...selected, key]);
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {PAYMENT_OPTIONS?.map(({ key, label, icon }) => {
        const active = selected?.includes(key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            className={`flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all duration-250 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
            style={{
              borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
              backgroundColor: active ? 'rgba(196,112,74,0.06)' : 'var(--color-card)',
            }}
          >
            <div
              className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: active ? 'rgba(196,112,74,0.15)' : 'var(--color-muted)' }}
            >
              <Icon name={icon} size={16} color={active ? 'var(--color-primary)' : 'var(--color-muted-foreground)'} />
            </div>
            <span
              className={`text-sm font-medium ${active ? 'text-foreground' : 'text-muted-foreground'}`}
              style={{ fontFamily: 'var(--font-caption)' }}
            >
              {label}
            </span>
            {active && (
              <Icon name="CheckCircle2" size={16} color="var(--color-primary)" className="ml-auto flex-shrink-0" />
            )}
          </button>
        );
      })}
    </div>
  );
}