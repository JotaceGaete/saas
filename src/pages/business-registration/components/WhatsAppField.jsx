import React from 'react';
import DynamicWhatsAppField from 'components/DynamicWhatsAppField';

/**
 * Campo WhatsApp para registro: prefijo y formato según país (countryConfig / CountryContext).
 * Sin lógica hardcodeada CL/AR.
 */
export default function WhatsAppField({ value, onChange, error, hint }) {
  return (
    <DynamicWhatsAppField
      value={value}
      onChange={onChange}
      error={error}
      label="Número de WhatsApp *"
      hint={hint}
    />
  );
}
