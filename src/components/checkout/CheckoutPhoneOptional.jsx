import React from 'react';
import { extractPhoneDigitsOnly, formatPhoneDigitsForDisplay } from '../../utils/customerPhone';

/**
 * Teléfono opcional: prefijo "+" fijo + solo dígitos con formato suave.
 * @param {string} digits - Solo dígitos (sin +).
 * @param {(d: string) => void} onDigitsChange
 * @param {'catalog' | 'order'} variant
 * @param {string} [focusRingColor] - Solo catalog (ej. primaryColor del tema)
 */
export default function CheckoutPhoneOptional({ digits, onDigitsChange, variant = 'catalog', focusRingColor }) {
  const handleChange = (e) => {
    onDigitsChange(extractPhoneDigitsOnly(e.target.value));
  };
  const display = formatPhoneDigitsForDisplay(digits);

  const label = (
    <>
      Teléfono{' '}
      {variant === 'catalog' ? (
        <span className="text-gray-400 font-normal">(opcional)</span>
      ) : (
        <span style={{ color: 'var(--color-muted-foreground)', fontWeight: 400 }}>(opcional)</span>
      )}
    </>
  );

  const helper = (
    <p
      className={variant === 'catalog' ? 'text-xs text-gray-500 mt-1.5' : 'text-xs mt-1.5'}
      style={variant === 'order' ? { color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' } : { fontFamily: 'var(--font-caption)' }}
    >
      Lo usaremos solo si necesitamos contactarte
    </p>
  );

  if (variant === 'catalog') {
    return (
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>
        <div
          className="flex w-full rounded-xl border border-gray-200 overflow-hidden focus-within:ring-2 focus-within:border-transparent transition-all"
          style={{ ['--tw-ring-color']: focusRingColor || '#25D366' }}
        >
          <span
            className="flex items-center px-3 py-3 text-sm font-semibold text-gray-600 bg-gray-50 border-r border-gray-200 select-none shrink-0"
            aria-hidden="true"
          >
            +
          </span>
          <input
            type="tel"
            inputMode="numeric"
            pattern="[0-9 ]*"
            autoComplete="tel"
            value={display}
            onChange={handleChange}
            placeholder="56 912 345 678"
            className="flex-1 min-w-0 px-4 py-3 text-sm text-gray-800 placeholder-gray-400 bg-white border-0 outline-none focus:ring-0"
          />
        </div>
        {helper}
      </div>
    );
  }

  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
        {label}
      </label>
      <div
        className="flex w-full rounded-xl border overflow-hidden focus-within:ring-2 focus-within:ring-offset-0 transition-all"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: '#FFFFFF',
          ['--tw-ring-color']: 'var(--color-primary, #7C3AED)',
          fontFamily: 'var(--font-caption)',
        }}
      >
        <span
          className="flex items-center px-3 py-2.5 text-sm font-semibold select-none shrink-0 border-r"
          style={{
            color: 'var(--color-muted-foreground)',
            backgroundColor: 'var(--color-muted)',
            borderColor: 'var(--color-border)',
          }}
          aria-hidden="true"
        >
          +
        </span>
        <input
          type="tel"
          inputMode="numeric"
          pattern="[0-9 ]*"
          autoComplete="tel"
          value={display}
          onChange={handleChange}
          placeholder="56 912 345 678"
          className="flex-1 min-w-0 px-3 py-2.5 text-sm border-0 outline-none focus:ring-0 bg-transparent"
          style={{ color: 'var(--color-foreground)' }}
        />
      </div>
      {helper}
    </div>
  );
}
