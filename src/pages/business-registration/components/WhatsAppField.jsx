import React from 'react';
import DynamicWhatsAppField from 'components/DynamicWhatsAppField';

/**
 * Campo WhatsApp para registro: prefijo y formato según país (countryConfig / CountryContext).
 * Sin lógica hardcodeada CL/AR.
 */
export default function WhatsAppField({
  value,
  onChange,
  error,
  hint,
  countryCode,
  onCountryChange,
  onResolvedCountryCode,
  neutral = false,
}) {
  return (
    <DynamicWhatsAppField
      value={value}
      onChange={onChange}
      error={error}
      label="Número de WhatsApp *"
      hint={hint}
      countryCode={countryCode}
      neutral={neutral}
      editableCountry={!neutral}
      persistCountrySelection={false}
      onCountryChange={onCountryChange}
      onResolvedCountryCode={onResolvedCountryCode}
    />
  );
}
