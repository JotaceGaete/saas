import React from 'react';
import { extractPhoneDigitsOnly, formatPhoneDigitsForDisplay } from '../../utils/customerPhone';

/**
 * Placeholder visual sugerido según el país del negocio.
 * Solo orientación para el usuario — no impone país ni valida formato.
 * El visitante puede escribir cualquier prefijo internacional.
 */
function getPhonePlaceholder(uxCountry) {
  switch (uxCountry) {
    case 'CL': return '56 9 1234 5678';
    case 'AR': return '54 9 11 1234 5678';
    case 'MX': return '52 1 55 1234 5678';
    case 'CO': return '57 310 123 4567';
    case 'PE': return '51 9 1234 5678';
    case 'UY': return '598 9 1234 5678';
    case 'EC': return '593 9 1234 5678';
    case 'BO': return '591 7 1234 5678';
    case 'PY': return '595 9 1234 5678';
    case 'GT': return '502 5 1234 5678';
    case 'CR': return '506 8 1234 5678';
    case 'PA': return '507 6 1234 5678';
    case 'US': return '1 234 567 8900';
    case 'ES': return '34 612 345 678';
    default:   return '1 234 567 8900';
  }
}

/**
 * Teléfono opcional: prefijo "+" fijo + solo dígitos con formato suave.
 * @param {string} digits - Solo dígitos (sin +).
 * @param {(d: string) => void} onDigitsChange
 * @param {'catalog' | 'order'} variant
 * @param {string} [focusRingColor] - Solo catalog (ej. primaryColor del tema)
 * @param {string} [uxCountry] - Código ISO del país del catálogo (solo para placeholder visual)
 */
export default function CheckoutPhoneOptional({ digits, onDigitsChange, variant = 'catalog', focusRingColor, uxCountry }) {
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
      Lo usaremos solo si necesitamos contactarte. Incluye el código de país (válido en cualquier país).
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
            placeholder={getPhonePlaceholder(uxCountry)}
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
          placeholder="p. ej. 1 234 567 8900"
          className="flex-1 min-w-0 px-3 py-2.5 text-sm border-0 outline-none focus:ring-0 bg-transparent"
          style={{ color: 'var(--color-foreground)' }}
        />
      </div>
      {helper}
    </div>
  );
}
