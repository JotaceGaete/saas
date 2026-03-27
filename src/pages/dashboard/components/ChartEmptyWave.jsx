import React from 'react';

/**
 * Fondo tipo área/onda muy tenue para gráficos en cero (~5% opacidad visual).
 */
export default function ChartEmptyWave({ className = '' }) {
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 bottom-0 h-[4.5rem] overflow-hidden rounded-b-2xl ${className}`}
      aria-hidden
    >
      <svg viewBox="0 0 400 90" className="h-full w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="chartEmptyWaveGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(124,58,237)" stopOpacity="0.08" />
            <stop offset="55%" stopColor="rgb(99,102,241)" stopOpacity="0.04" />
            <stop offset="100%" stopColor="rgb(124,58,237)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0,78 C70,38 130,88 200,48 S310,68 400,42 L400,90 L0,90 Z"
          fill="url(#chartEmptyWaveGrad)"
          opacity="0.55"
        />
      </svg>
    </div>
  );
}
