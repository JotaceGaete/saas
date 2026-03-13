import React from 'react';
import { getCountryCode } from 'config/country';
import ChileWhatsAppField from 'components/ChileWhatsAppField';
import ArgentinaWhatsAppField from 'components/ArgentinaWhatsAppField';

const defaultHints = {
  AR: 'Formato Argentina: 10 dígitos (código área + número). Este número recibirá los pedidos por WhatsApp.',
  CL: 'Formato Chile: 9 dígitos comenzando con 9. Este número recibirá los pedidos por WhatsApp.',
};

export default function WhatsAppField({ value, onChange, error, hint }) {
  const country = getCountryCode();
  const resolvedHint = hint ?? defaultHints[country];

  if (country === 'AR') {
    return (
      <ArgentinaWhatsAppField
        value={value}
        onChange={onChange}
        error={error}
        label="Número de WhatsApp *"
        hint={resolvedHint}
      />
    );
  }
  return (
    <ChileWhatsAppField
      value={value}
      onChange={onChange}
      error={error}
      label="Número de WhatsApp *"
      hint={resolvedHint}
    />
  );
}
