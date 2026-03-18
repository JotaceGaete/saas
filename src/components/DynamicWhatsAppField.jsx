import React, { useState, useCallback } from 'react';
import { getCountryCode } from '../config/country';
import { getCountryConfig } from '../config/countryConfig';

/**
 * Campo WhatsApp con prefijo dinámico según país (countryConfig).
 * El valor que recibe/entrega es E.164 (ej. +56912345678).
 */
export default function DynamicWhatsAppField({ value, onChange, error: externalError, label = 'Número de WhatsApp', hint, id }) {
  const [touched, setTouched] = useState(false);
  const countryCode = getCountryCode();
  const config = getCountryConfig(countryCode);
  const prefix = config?.phonePrefix ?? '+56';
  const localLength = config?.phoneLocalLength ?? 9;
  const firstDigit = config?.phoneLocalPrefix ?? null;

  const rawFromValue = (v) => {
    if (!v) return '';
    const s = String(v).replace(/\D/g, '');
    const prefixDigits = prefix.replace(/\D/g, '');
    if (s.startsWith(prefixDigits)) return s.slice(prefixDigits.length, prefixDigits.length + localLength);
    return s.slice(0, localLength);
  };

  const displayValue = rawFromValue(value);

  const handleChange = useCallback(
    (e) => {
      let raw = (e?.target?.value ?? '').replace(/\D/g, '');
      raw = raw.slice(0, localLength);
      if (firstDigit && raw.length > 0 && raw[0] !== firstDigit) {
        raw = firstDigit + raw.slice(0, localLength - 1);
      }
      const full = raw.length > 0 ? prefix.replace(/\D/g, '') + raw : '';
      onChange(full.length > 0 ? `+${full}` : '');
    },
    [onChange, prefix, localLength, firstDigit]
  );

  const isValid = !displayValue || (
    displayValue.length === localLength &&
    (!firstDigit || displayValue[0] === firstDigit)
  );
  const showError = (touched || externalError) && displayValue.length > 0 && !isValid;
  let errorMessage = externalError || null;
  if (displayValue.length > 0 && !isValid) {
    if (firstDigit && displayValue[0] !== firstDigit) {
      errorMessage = `El número debe comenzar con ${firstDigit} (móvil).`;
    } else {
      errorMessage = `Ingresa ${localLength} dígitos.`;
    }
  }

  const resolvedHint = hint ?? `Formato: ${prefix} y ${localLength} dígitos`;

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
        style={{ borderColor: showError ? 'var(--color-destructive)' : 'var(--color-border)' }}
      >
        <span
          className="inline-flex items-center px-3 text-sm bg-muted border-r"
          style={{
            fontFamily: 'var(--font-data)',
            color: 'var(--color-muted-foreground)',
            borderColor: 'var(--color-border)',
          }}
        >
          {prefix}
        </span>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder={Array(localLength).fill('0').join('')}
          value={displayValue}
          onChange={handleChange}
          onBlur={() => setTouched(true)}
          className="flex-1 min-w-0 px-3 py-2.5 text-sm outline-none"
          style={{
            fontFamily: 'var(--font-data)',
            color: 'var(--color-foreground)',
            backgroundColor: 'var(--color-background)',
          }}
        />
      </div>
      {resolvedHint && (
        <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          {resolvedHint}
        </p>
      )}
      {showError && errorMessage && (
        <p className="text-xs mt-1" style={{ color: 'var(--color-destructive)' }}>{errorMessage}</p>
      )}
    </div>
  );
}
