import React from 'react';

/**
 * Campo "Correo electrónico (opcional)" del checkout público
 * (EMAIL-PAYMENTS-2). Mismo patrón visual/arquitectónico de
 * CheckoutPhoneOptional: dos variantes ('catalog' | 'order') que
 * replican exactamente el estilo del campo "Tu nombre" de cada página.
 *
 * Exclusivamente transaccional: se usa para enviar la confirmación del
 * pago, nunca para marketing/newsletter/consentimiento comercial ni
 * tracking.
 */
export default function CheckoutEmailOptional({ value, onValueChange, variant = 'catalog', focusRingColor, error }) {
  const handleChange = (e) => {
    onValueChange(e?.target?.value ?? '');
  };

  if (variant === 'catalog') {
    return (
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">
          Correo electrónico <span className="text-gray-400 font-normal">(opcional)</span>
        </label>
        <input
          type="email"
          autoComplete="email"
          inputMode="email"
          value={value}
          onChange={handleChange}
          placeholder="tucorreo@ejemplo.com"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all"
          style={{ ['--tw-ring-color']: focusRingColor || '#25D366' }}
        />
        {error ? (
          <p className="text-xs text-red-600 mt-1.5">{error}</p>
        ) : (
          <p className="text-xs text-gray-500 mt-1.5">Te enviaremos la confirmación de tu pago a este correo.</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
        Correo electrónico <span style={{ color: 'var(--color-muted-foreground)', fontWeight: 400 }}>(opcional)</span>
      </label>
      <input
        type="email"
        autoComplete="email"
        inputMode="email"
        value={value}
        onChange={handleChange}
        placeholder="tucorreo@ejemplo.com"
        className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-all"
        style={{ borderColor: error ? 'var(--color-error)' : 'var(--color-border)', fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)', backgroundColor: '#FFFFFF' }}
      />
      {error ? (
        <p className="text-xs mt-1" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>{error}</p>
      ) : (
        <p className="text-xs mt-1.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Te enviaremos la confirmación de tu pago a este correo.</p>
      )}
    </div>
  );
}
