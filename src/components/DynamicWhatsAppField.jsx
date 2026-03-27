import React, { useState, useCallback, useEffect } from 'react';
import { getCountryCode } from '../config/country';
import { getCountryConfig, COUNTRY_CODES, NEUTRAL_COUNTRY_CONFIG } from '../config/countryConfig';
import { useCountry } from '../contexts/CountryContext';

const NEUTRAL_HINT = 'Selecciona tu país y escribe tu número con código de área si aplica.';

function buildPhoneExample(config) {
  const prefix = String(config?.phonePrefix || '').trim();
  const len = Number(config?.phoneLocalLength || 0);
  const first = config?.phoneLocalPrefix ? String(config.phoneLocalPrefix) : '';
  if (!prefix || len <= 0) return NEUTRAL_HINT;
  const rest = Math.max(len - first.length, 0);
  const digits = `${first}${'0'.repeat(rest)}`.slice(0, len);
  const chunks = digits.match(/.{1,4}/g) || [digits];
  return `Formato: ${prefix} ${chunks.join(' ')}`;
}

/**
 * Campo WhatsApp con prefijo dinámico según país.
 * En go.ventalink.app sin país seleccionado: selector de país + sin prefijo por defecto, textos neutros.
 * En cl/ar o go con país: prefijo fijo del país, ayuda y validación locales.
 * Valor que recibe/entrega: E.164 (ej. +56912345678).
 */
export default function DynamicWhatsAppField({
  value,
  onChange,
  error: externalError,
  label = 'Número de WhatsApp',
  hint,
  id,
  countryCode = null,
  editableCountry = false,
  persistCountrySelection = true,
  onCountryChange,
  onResolvedCountryCode,
}) {
  const [touched, setTouched] = useState(false);
  const { setCountry: persistCountry, countryCode: contextCountryCode } = useCountry();
  const globalCountry = countryCode || contextCountryCode || getCountryCode();

  const [selectedCountryForField, setSelectedCountryForField] = useState(globalCountry || null);

  useEffect(() => {
    setSelectedCountryForField(globalCountry || null);
  }, [globalCountry]);

  const isNeutral = globalCountry === null;
  const effectiveCountry = editableCountry ? selectedCountryForField : (isNeutral ? selectedCountryForField : globalCountry);
  const config = getCountryConfig(effectiveCountry);
  const hasCountry = effectiveCountry && config !== NEUTRAL_COUNTRY_CONFIG;

  const prefix = config?.phonePrefix ?? '';
  const localLength = config?.phoneLocalLength ?? 0;
  const firstDigit = config?.phoneLocalPrefix ?? null;
  const waDebugEnabled = typeof window !== 'undefined' && window.__WA_COUNTRY_DEBUG__ === true;

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
    const nextCfg = getCountryConfig(next);
    if (waDebugEnabled) {
      console.info('[WA_FIELD_COUNTRY_CHANGE]', {
        visualSelected: selectedCountryForField ?? null,
        next,
        dialCode: nextCfg?.phonePrefix ?? null,
        emittedCountryCode: next,
        previousValue: value ?? null,
      });
    }
    setSelectedCountryForField(next);
    onCountryChange?.(next);
    onResolvedCountryCode?.(next);
    // Limpia número para evitar prefijos pegados y validaciones inconsistentes al cambiar país.
    onChange('');
    if (persistCountrySelection && next) persistCountry(next);
  }, [onChange, persistCountry, persistCountrySelection, onCountryChange, onResolvedCountryCode, selectedCountryForField, value, waDebugEnabled]);

  const handleChange = useCallback(
    (e) => {
      const raw = (e?.target?.value ?? '').replace(/\D/g, '');
      if (!hasCountry) {
        const nextValue = raw ? `+${raw}` : '';
        if (waDebugEnabled) {
          console.info('[WA_FIELD_PHONE_CHANGE]', {
            hasCountry: false,
            visualSelected: selectedCountryForField ?? null,
            effectiveCountry: effectiveCountry ?? null,
            dialCode: null,
            rawInputDigits: raw || null,
            nextE164: nextValue || null,
          });
        }
        onChange(nextValue);
        return;
      }
      let digits = raw.slice(0, localLength);
      if (firstDigit && digits.length > 0 && digits[0] !== firstDigit) {
        digits = firstDigit + digits.slice(0, localLength - 1);
      }
      const full = digits.length > 0 ? prefix.replace(/\D/g, '') + digits : '';
      const nextValue = full.length > 0 ? `+${full}` : '';
      if (waDebugEnabled) {
        console.info('[WA_FIELD_PHONE_CHANGE]', {
          hasCountry: true,
          visualSelected: selectedCountryForField ?? null,
          effectiveCountry: effectiveCountry ?? null,
          dialCode: prefix || null,
          rawInputDigits: raw || null,
          localDigits: digits || null,
          nextE164: nextValue || null,
        });
      }
      onChange(nextValue);
    },
    [onChange, prefix, localLength, firstDigit, hasCountry, waDebugEnabled, selectedCountryForField, effectiveCountry]
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

  const resolvedHint = hint ?? (hasCountry ? buildPhoneExample(config) : NEUTRAL_HINT);

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

      {(isNeutral || editableCountry) && (
        <div className="mb-2 relative">
          <select
            value={selectedCountryForField ?? ''}
            onChange={handleCountryChange}
            onBlur={() => setTouched(true)}
            className="w-full px-3 py-2.5 pr-9 text-sm rounded-lg border outline-none appearance-none"
            style={{
              fontFamily: 'var(--font-caption)',
              color: 'var(--color-foreground)',
              backgroundColor: 'var(--color-background)',
              borderColor: 'var(--color-border)',
              minHeight: '44px',
              cursor: 'pointer',
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
          <span
            aria-hidden
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--color-muted-foreground)' }}
          >
            ▼
          </span>
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
          disabled={(isNeutral || editableCountry) && !selectedCountryForField}
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
