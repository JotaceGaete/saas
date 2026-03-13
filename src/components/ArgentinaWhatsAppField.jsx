import React, { useState, useCallback } from 'react';

const AR_PREFIX = '+54';
const AR_MOBILE_LENGTH = 10; // 10 dígitos (9 + código área + número), ej. 9111234567

/**
 * Argentina WhatsApp: +54 fijo. Input guarda 10 dígitos (ej. 9111234567).
 * Al enviar el padre recibe E.164: +549111234567.
 */
export default function ArgentinaWhatsAppField({ value, onChange, error: externalError, label = 'Número de WhatsApp', hint, id }) {
  const [touched, setTouched] = useState(false);

  const rawFromValue = (v) => {
    if (!v) return '';
    const s = String(v).replace(/\D/g, '');
    if (s.startsWith('54')) return s.slice(2, 2 + AR_MOBILE_LENGTH);
    return s.slice(0, AR_MOBILE_LENGTH);
  };

  const displayValue = rawFromValue(value);

  const handleChange = useCallback(
    (e) => {
      const raw = (e?.target?.value ?? '').replace(/\D/g, '');
      const digits = raw.slice(0, AR_MOBILE_LENGTH);
      onChange(digits.length > 0 ? AR_PREFIX + digits : '');
    },
    [onChange]
  );

  const isValid = !displayValue || displayValue.length === AR_MOBILE_LENGTH;
  const showError = (touched || externalError) && displayValue.length > 0 && !isValid;
  const errorMessage =
    displayValue.length > 0 && displayValue.length !== AR_MOBILE_LENGTH
      ? 'Ingresa 10 dígitos (código área + número). Ej: 11 1234-5678'
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
          aria-label="Código de país Argentina"
        >
          +54
        </div>
        <div className="flex items-center gap-1 px-2 text-sm shrink-0" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          |
        </div>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder="9111234567"
          value={displayValue}
          onChange={handleChange}
          onBlur={() => setTouched(true)}
          maxLength={AR_MOBILE_LENGTH}
          className="flex-1 min-w-0 h-10 px-3 rounded-r-lg border-0 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
          style={{
            backgroundColor: 'var(--color-surface)',
            color: 'var(--color-foreground)',
            fontFamily: 'var(--font-caption)',
          }}
          aria-label="Número móvil Argentina (10 dígitos)"
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
