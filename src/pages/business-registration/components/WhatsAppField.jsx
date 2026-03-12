import React from 'react';
import ChileWhatsAppField from 'components/ChileWhatsAppField';

export default function WhatsAppField({ value, onChange, error }) {
  return (
    <ChileWhatsAppField
      value={value}
      onChange={onChange}
      error={error}
      label="Número de WhatsApp *"
      hint="Formato Chile: 9 dígitos comenzando con 9. Este número recibirá los pedidos por WhatsApp."
    />
  );
}
