import React, { useState } from 'react';

// Muestra fecha en formato DD/MM/AAAA.
// Al hacer click abre el picker nativo del browser.
// Internamente almacena y emite el valor en formato ISO YYYY-MM-DD.
export function ChileanDateInput({ value, onChange, disabled, className, placeholder }) {
  const [picking, setPicking] = useState(false);

  // YYYY-MM-DD → DD/MM/AAAA
  const display = value
    ? value.split('-').reverse().join('/')
    : '';

  if (disabled) {
    return (
      <input
        type="text"
        value={display}
        readOnly
        disabled
        placeholder={placeholder || 'DD/MM/AAAA'}
        className={className}
      />
    );
  }

  if (picking) {
    return (
      <input
        type="date"
        autoFocus
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        onBlur={() => setPicking(false)}
        className={className}
      />
    );
  }

  return (
    <input
      type="text"
      value={display}
      readOnly
      placeholder={placeholder || 'DD/MM/AAAA'}
      onFocus={() => setPicking(true)}
      onClick={() => setPicking(true)}
      className={`${className} cursor-pointer`}
    />
  );
}
