import React, { useState, useCallback } from 'react';
import { getCountryCode } from '../config/country';
import { getCountryConfig, COUNTRY_CODES, NEUTRAL_COUNTRY_CONFIG } from '../config/countryConfig';
import { useCountry } from '../contexts/CountryContext';

const NEUTRAL_HINT = 'Selecciona tu país y escribe tu número con código de área si aplica.';

/**
 * Campo WhatsApp con prefijo dinámico según país.
 * En go.ventalink.app sin país seleccionado: selector de país + sin prefijo por defecto, textos neutros.
 * En cl/ar o go con país: prefijo fijo del país, ayuda y validación locales.
 * Valor que recibe/entrega: E.164 (ej. +56912345678).
 */
export default function DynamicWhatsAppField({ value, onChange, error: externalError, label = 'Número de WhatsApp', hint, id, countryCode = null }) {
  const [touched, setTouched] = useState(false);
  const { setCountry: persistCountry } = useCountry();
  const globalCountry = countryCode || getCountryCode();

  // En go sin país: el usuario elige país solo para este campo (no se persiste en localStorage).
  const [selectedCountryForField, setSelectedCountryForField] = useState(null);

  const isNeutral = globalCountry === null;
  const effectiveCountry = isNeutral ? selectedCountryForField : globalCountry;
  const config = getCountryConfig(effectiveCountry);
  const hasCountry = effectiveCountry && config !== NEUTRAL_COUNTRY_CONFIG;

  const prefix = config?.phonePrefix ?? '';
  const localLength = config?.phoneLocalLength ?? 0;
  const firstDigit = config?.phoneLocalPrefix ?? null;

  const rawFromValue = (v) => {
    if (!v) return '';
    const s = String(v).replace(/\D/g, '');
    if (!prefix) return s.slice(0, 15);
    const prefixDigits = prefix.replace(/\D/g, '');
    if (s.startsWith(prefixDigits)) return s.slice(prefixDigits.length, prefixDigits.length + localLength);
    return s.slice(0, localLength);
  };

  const displayValue = hasCountry ? rawFromValue(value) : (value ? String(value).replace(/\D/g, '').slice(0, 15) : '');

  const handleCountryChange = useCallback((e) => {
    const code = (e?.target?.value || '').trim() || null;
    const next = COUNTRY_CODES.includes(code) ? code : null;
    setSelectedCountryForField(next);
    onChange('');
    if (next) persistCountry(next);
  }, [onChange, persistCountry]);

  const handleChange = useCallback(
    (e) => {
      const raw = (e?.target?.value ?? '').replace(/\D/g, '');
      if (!hasCountry) {
        onChange(raw ? `+${raw}` : '');
        return;
      }
      let digits = raw.slice(0, localLength);
      if (firstDigit && digits.length > 0 && digits[0] !== firstDigit) {
        digits = firstDigit + digits.slice(0, localLength - 1);
      }
      const full = digits.length > 0 ? prefix.replace(/\D/g, '') + digits : '';
      onChange(full.length > 0 ? `+${full}` : '');
    },
    [onChange, prefix, localLength, firstDigit, hasCountry]
  );

  const isValid = !hasCountry
    ? true
    : !displayValue || (
        displayValue.length === localLength &&
        (!firstDigit || displayValue[0] === firstDigit)
      );
  const showError = (touched || externalError) && displayValue.length > 0 && !isValid;
  let errorMessage = externalError || null;
  if (hasCountry && displayValue.length > 0 && !isValid) {
    if (firstDigit && displayValue[0] !== firstDigit) {
      errorMessage = `El número debe comenzar con ${firstDigit} (móvil).`;
    } else {
      errorMessage = `Ingresa ${localLength} dígitos.`;
    }
  }

  const resolvedHint = hint ?? (hasCountry ? `Formato: ${prefix} y ${localLength} dígitos` : NEUTRAL_HINT);

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

      {isNeutral && (
        <div className="mb-2">
          <select
            value={selectedCountryForField ?? ''}
            onChange={handleCountryChange}
            onBlur={() => setTouched(true)}
            className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none"
            style={{
              fontFamily: 'var(--font-caption)',
              color: 'var(--color-foreground)',
              backgroundColor: 'var(--color-background)',
              borderColor: 'var(--color-border)',
            }}
            aria-label="País para el número de WhatsApp"
          >
            <option value="">Selecciona tu país</option>
            {COUNTRY_CODES.map((code) => {
              const c = getCountryConfig(code);
              return (
                <option key={code} value={code}>
                  {c.flag} {c.name} ({c.phonePrefix})
                </option>
              );
            })}
          </select>
        </div>
      )}

      <div
        className="flex items-stretch gap-0 rounded-lg overflow-hidden border"
        style={{ borderColor: showError ? 'var(--color-destructive)' : 'var(--color-border)' }}
      >
        {hasCountry && (
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
        )}
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder={hasCountry ? Array(localLength).fill('0').join('') : 'Ej: 912345678'}
          value={displayValue}
          onChange={handleChange}
          onBlur={() => setTouched(true)}
          disabled={isNeutral && !selectedCountryForField}
          className="flex-1 min-w-0 px-3 py-2.5 text-sm outline-none disabled:opacity-60 disabled:bg-muted"
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
