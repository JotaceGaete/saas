import React, { useState, useCallback } from 'react';

const CHILE_PREFIX = '+56';
const CHILE_MOBILE_LENGTH = 9; // 9 digits total, first must be 9

/**
 * Chile WhatsApp: +56 fixed (visual only). Input holds only local 9 digits (e.g. 956956956).
 * On submit parent gets E.164: +56956956956.
 * No prepending 56/569 on keypress — displayValue is local number only.
 */
export default function ChileWhatsAppField({ value, onChange, error: externalError, label = 'Número de WhatsApp', hint, id }) {
  const [touched, setTouched] = useState(false);

  // From stored value (E.164 or legacy) derive only the 9-digit local part for the input.
  const rawFromValue = (v) => {
    if (!v) return '';
    const s = String(v).replace(/\D/g, '');
    if (s.startsWith('56')) return s.slice(2, 2 + CHILE_MOBILE_LENGTH);
    return s.slice(0, CHILE_MOBILE_LENGTH);
  };

  const displayValue = rawFromValue(value);

  const handleChange = useCallback(
    (e) => {
      const raw = (e?.target?.value ?? '').replace(/\D/g, '');
      let digits = raw.slice(0, CHILE_MOBILE_LENGTH);
      if (digits.length > 0 && digits[0] !== '9') {
        digits = '9' + digits.slice(0, CHILE_MOBILE_LENGTH - 1);
      }
      onChange(digits.length > 0 ? CHILE_PREFIX + digits : '');
    },
    [onChange]
  );

  const isValid = !displayValue || (displayValue.length === CHILE_MOBILE_LENGTH && displayValue[0] === '9');
  const showError = (touched || externalError) && displayValue.length > 0 && !isValid;
  const errorMessage =
    displayValue.length > 0 && displayValue[0] !== '9'
      ? 'El número debe comenzar con 9 (móvil Chile).'
      : displayValue.length > 0 && displayValue.length !== CHILE_MOBILE_LENGTH
        ? 'Ingresa 9 dígitos (ej: 93443682).'
        : externalError || null;

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={id}
          className="block text-sm font-medium mb-1.5"
          style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}
        >
          {label}
        </label>
      )}
      <div
        className="flex items-stretch gap-0 rounded-lg overflow-hidden border"
        style={{ borderColor: showError ? 'var(--color-error)' : 'var(--color-border)' }}
      >
        <div
          className="flex items-center px-3 text-sm font-medium select-none shrink-0"
          style={{
            backgroundColor: 'var(--color-muted)',
            color: 'var(--color-muted-foreground)',
            fontFamily: 'var(--font-caption)',
          }}
          aria-label="Código de país Chile"
        >
          +56
        </div>
        <div className="flex items-center gap-1 px-2 text-sm shrink-0" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          |
        </div>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder="956956956"
          value={displayValue}
          onChange={handleChange}
          onBlur={() => setTouched(true)}
          maxLength={CHILE_MOBILE_LENGTH}
          className="flex-1 min-w-0 h-10 px-3 rounded-r-lg border-0 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
          style={{
            backgroundColor: 'var(--color-surface)',
            color: 'var(--color-foreground)',
            fontFamily: 'var(--font-caption)',
          }}
          aria-label="Número móvil (9 dígitos, comenzando en 9)"
        />
      </div>
      {(showError && errorMessage) || externalError ? (
        <p className="mt-1 text-xs" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>
          {externalError || errorMessage}
        </p>
      ) : null}
      {hint && (
        <p className="mt-1 text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          {hint}
        </p>
      )}
    </div>
  );
}
