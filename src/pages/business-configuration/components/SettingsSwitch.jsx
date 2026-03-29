import React from 'react';

/**
 * Toggle estilo SaaS (violeta). Accesible: usa botón con role="switch".
 */
export default function SettingsSwitch({ checked, onCheckedChange, id, disabled, label }) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onCheckedChange?.(!checked)}
      className={[
        'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/25',
        checked ? 'bg-violet-600' : 'bg-slate-200',
        disabled ? 'opacity-50 cursor-not-allowed' : '',
      ].join(' ')}
    >
      <span
        className={[
          'pointer-events-none inline-block h-5 w-5 translate-x-0.5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        ].join(' ')}
        aria-hidden
      />
      {label && <span className="sr-only">{label}</span>}
    </button>
  );
}
