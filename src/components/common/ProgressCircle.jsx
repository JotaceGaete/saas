import React, { useEffect, useId, useState } from 'react';

const RADIUS = 45;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const CX = 64;
const CY = 64;
const STROKE = 8;

/**
 * Anillo de progreso SVG con degradado purple → indigo, animación al montar y glow suave.
 */
export default function ProgressCircle({
  percentage = 0,
  className = '',
  sizeClassName = 'w-[140px] h-[140px] max-w-[150px] max-h-[150px]',
}) {
  const uid = useId();
  const gradientId = `pc-grad-${uid.replace(/:/g, '')}`;

  const pct = Math.min(100, Math.max(0, Number(percentage) || 0));
  const rounded = Math.round(pct);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const offset = mounted ? CIRCUMFERENCE - (pct / 100) * CIRCUMFERENCE : CIRCUMFERENCE;

  const isPulseActive = pct > 0 && pct < 100;

  return (
    <div
      className={`relative inline-flex items-center justify-center select-none ${className}`}
      role="img"
      aria-valuenow={rounded}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${rounded} por ciento completado`}
    >
      <svg
        className={`${sizeClassName} origin-center ${
          isPulseActive
            ? 'animate-pulse-ring md:animate-none'
            : 'transform -rotate-90'
        }`}
        viewBox="0 0 128 128"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          filter:
            'drop-shadow(0 0 12px rgba(147, 51, 234, 0.42)) drop-shadow(0 0 4px rgba(99, 102, 241, 0.35))',
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#9333ea" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
        </defs>
        <circle
          cx={CX}
          cy={CY}
          r={RADIUS}
          stroke="currentColor"
          strokeWidth={STROKE}
          fill="transparent"
          className="text-gray-100 dark:text-gray-800/80"
        />
        <circle
          cx={CX}
          cy={CY}
          r={RADIUS}
          stroke={`url(#${gradientId})`}
          strokeWidth={STROKE}
          fill="transparent"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          style={{
            strokeDashoffset: offset,
            transition: 'stroke-dashoffset 1s ease-in-out',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pt-0.5">
        <span
          className="text-[1.65rem] leading-none font-bold tabular-nums tracking-tight"
          style={{
            fontFamily: 'var(--font-stat, ui-sans-serif, system-ui)',
            color: 'var(--color-foreground)',
          }}
        >
          {rounded}%
        </span>
        <span
          className="text-[10px] font-medium mt-1 tracking-wide"
          style={{
            fontFamily: 'var(--font-caption, ui-sans-serif, system-ui)',
            color: 'var(--color-muted-foreground)',
          }}
        >
          Completado
        </span>
      </div>
    </div>
  );
}
