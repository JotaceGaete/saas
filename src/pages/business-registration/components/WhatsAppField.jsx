import React from 'react';

export default function WhatsAppField({ value, onChange, error }) {
  const CHILE_PREFIX = '+56';

  const handleNumberChange = (e) => {
    const raw = e?.target?.value?.replace(/\D/g, '');
    onChange(CHILE_PREFIX + raw);
  };

  const displayNumber = value?.startsWith(CHILE_PREFIX)
    ? value?.slice(CHILE_PREFIX?.length)
    : value?.replace(/^\+\d+/, '');

  return (
    <div className="w-full">
      <label
        className="block text-sm font-medium mb-1.5"
        style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}
      >
        Número de WhatsApp <span className="text-red-500">*</span>
      </label>
      <div className="flex gap-2">
        {/* Fixed Chile prefix */}
        <div
          className="flex items-center px-3 h-10 rounded-md border text-sm font-medium select-none"
          style={{
            borderColor: error ? 'var(--color-error)' : 'var(--color-input)',
            backgroundColor: 'var(--color-muted)',
            color: 'var(--color-foreground)',
            fontFamily: 'var(--font-caption)',
            minWidth: '60px',
          }}
          aria-label="Código de país Chile"
        >
          🇨🇱 +56
        </div>

        {/* Phone number input */}
        <input
          type="tel"
          inputMode="numeric"
          placeholder="912345678"
          value={displayNumber}
          onChange={handleNumberChange}
          className="flex-1 h-10 px-3 rounded-md border text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{
            borderColor: error ? 'var(--color-error)' : 'var(--color-input)',
            backgroundColor: 'var(--color-background)',
            color: 'var(--color-foreground)',
            fontFamily: 'var(--font-caption)',
          }}
          aria-label="Número de teléfono"
        />
      </div>
      {error && (
        <p className="mt-1 text-xs" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>
          {error}
        </p>
      )}
      <p className="mt-1 text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
        Este número recibirá los pedidos de tus clientes por WhatsApp.
      </p>
    </div>
  );
}