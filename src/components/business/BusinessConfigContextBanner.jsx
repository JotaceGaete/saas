import React from 'react';
import { getCountryConfig } from 'config/countryConfig';

/**
 * Banner informativo: país operativo y moneda (solo lectura).
 */
export default function BusinessConfigContextBanner({ countryCode, currencyLabel }) {
  const code = countryCode != null ? String(countryCode).trim().toUpperCase() : '';
  const cfg = code ? getCountryConfig(code) : null;
  const name = cfg?.name || code || '—';
  const flag = cfg?.flag || '🌐';
  const currency = currencyLabel || cfg?.currency || '—';

  return (
    <div
      className="w-full rounded-lg border border-slate-100/90 bg-slate-50/80 px-3 py-2 mb-5 shadow-sm shadow-slate-200/40"
      role="status"
      aria-label="Contexto operativo del negocio"
    >
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-0.5 text-center sm:text-left sm:justify-between">
        <p className="text-[11px] sm:text-xs text-slate-700 font-[family-name:var(--font-caption)]">
          <span className="text-slate-500">Operando en </span>
          <span className="font-semibold text-slate-900">
            {name} {flag}
          </span>
          <span className="text-slate-400 mx-1.5 hidden sm:inline" aria-hidden>
            ·
          </span>
        </p>
        <p className="text-[11px] sm:text-xs text-slate-600 font-[family-name:var(--font-caption)] w-full sm:w-auto">
          <span className="text-slate-500">Moneda base </span>
          <span className="font-semibold tabular-nums text-slate-900">{currency}</span>
          <span className="ml-1.5 text-[10px] uppercase tracking-wide text-slate-400">(informativo)</span>
        </p>
      </div>
    </div>
  );
}
