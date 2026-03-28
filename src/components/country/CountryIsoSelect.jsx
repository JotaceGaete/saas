import React from 'react';
import { COUNTRY_CODES, getCountryConfig } from '../../config/countryConfig';

const SORTED = [...COUNTRY_CODES].sort((a, b) =>
  getCountryConfig(a).name.localeCompare(getCountryConfig(b).name, 'es'),
);

/**
 * Selector ISO único reutilizable; no duplica reglas de país (usa countryConfig).
 */
export default function CountryIsoSelect({
  id,
  value,
  onChange,
  disabled = false,
  className = '',
  style = {},
  placeholderOption = 'Selecciona país',
}) {
  return (
    <select
      id={id}
      value={value || ''}
      disabled={disabled}
      onChange={(e) => onChange?.(e.target.value || null)}
      className={className}
      style={style}
    >
      <option value="">{placeholderOption}</option>
      {SORTED.map((code) => {
        const cfg = getCountryConfig(code);
        return (
          <option key={code} value={code}>
            {cfg.flag} {cfg.name}
          </option>
        );
      })}
    </select>
  );
}
