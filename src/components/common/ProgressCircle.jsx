import React, { useEffect, useId, useState, memo, useRef } from 'react';
import { dispararCelebracion } from 'utils/confettiCelebrations';

const RADIUS = 45;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const CX = 64;
const CY = 64;
const STROKE = 8;

const FILTER_PURPLE =
  'drop-shadow(0 0 12px rgba(147, 51, 234, 0.42)) drop-shadow(0 0 4px rgba(99, 102, 241, 0.35))';
const FILTER_GREEN =
  'drop-shadow(0 0 12px rgba(34, 197, 94, 0.45)) drop-shadow(0 0 4px rgba(22, 163, 74, 0.35))';

/**
 * Anillo de progreso SVG con degradado purple → indigo, animación al montar y glow suave.
 * Al pasar de <100% a 100%: transición a verde, confeti y ✓ central.
 *
 * @param {string|null} celebrationKey - Clave de localStorage para persistir si ya se celebró.
 *   Si se omite, el confeti se dispara en cada transición (sin persistencia).
 *   Si se provee, el confeti solo se dispara una vez por clave (ideal: por negocio/usuario).
 */
function ProgressCircle({
  percentage = 0,
  className = '',
  sizeClassName = 'w-[140px] h-[140px] max-w-[150px] max-h-[150px]',
  celebrationKey = null,
}) {
  const uid = useId();
  const gradientId = `pc-grad-${uid.replace(/:/g, '')}`;

  const pct = Math.min(100, Math.max(0, Number(percentage) || 0));
  const rounded = Math.round(pct);
  const isComplete = rounded >= 100;

  const [mounted, setMounted] = useState(false);
  const [ringSuccess, setRingSuccess] = useState(false);
  const prevPctRef = useRef(null);
  const celebratedRef = useRef(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    if (prevPctRef.current === null) {
      // Primera vez que el componente ve un porcentaje.
      // Si ya está al 100% en el render inicial, solo activa el anillo verde:
      // no disparamos confeti porque no hay transición real del usuario.
      prevPctRef.current = pct;
      if (pct >= 100) setRingSuccess(true);
      return;
    }

    const prev = prevPctRef.current;
    prevPctRef.current = pct;

    if (prev < 100 && pct >= 100) {
      // Transición real: el progreso acaba de llegar al 100%.
      setRingSuccess(true);

      if (!celebratedRef.current) {
        // Si hay una clave de persistencia, verificar si ya se celebró antes.
        const alreadyCelebrated = celebrationKey
          ? Boolean(localStorage.getItem(celebrationKey))
          : false;

        if (!alreadyCelebrated) {
          celebratedRef.current = true;
          if (celebrationKey) localStorage.setItem(celebrationKey, '1');
          window.setTimeout(dispararCelebracion, 500);
        }
      }
    }
  }, [pct, celebrationKey]);

  const offset = mounted ? CIRCUMFERENCE - (pct / 100) * CIRCUMFERENCE : CIRCUMFERENCE;

  const isPulseActive = pct > 0 && pct < 100;

  const strokeTransition = 'stroke-dashoffset 1s ease-in-out';
  const filterTransition = 'filter 500ms ease-in-out';

  return (
    <div
      className={`relative inline-flex items-center justify-center select-none ${className}`}
      role="img"
      aria-valuenow={rounded}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={
        isComplete ? 'Progreso completado' : `${rounded} por ciento completado`
      }
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
          filter: ringSuccess ? FILTER_GREEN : FILTER_PURPLE,
          transition: filterTransition,
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
          className="text-gray-100 transition-colors duration-500 dark:text-gray-800/80"
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
          className={`transition-opacity duration-500 ease-in-out ${
            ringSuccess ? 'opacity-0' : 'opacity-100'
          }`}
          style={{
            strokeDashoffset: offset,
            transition: strokeTransition,
          }}
        />
        <circle
          cx={CX}
          cy={CY}
          r={RADIUS}
          stroke="#22c55e"
          strokeWidth={STROKE}
          fill="transparent"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          className={`transition-opacity duration-500 ease-in-out ${
            ringSuccess ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            strokeDashoffset: offset,
            transition: strokeTransition,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pt-0.5 px-1">
        {isComplete ? (
          <>
            <span
              className="text-4xl font-bold leading-none text-green-500 transition-colors duration-500"
              style={{ fontFamily: 'var(--font-stat, ui-sans-serif, system-ui)' }}
              aria-hidden
            >
              ✓
            </span>
            <span
              className="text-[10px] font-medium mt-1.5 tracking-wide transition-colors duration-500"
              style={{
                fontFamily: 'var(--font-caption, ui-sans-serif, system-ui)',
                color: 'var(--color-muted-foreground)',
              }}
            >
              Completado
            </span>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}

const MemoProgressCircle = memo(ProgressCircle);
MemoProgressCircle.displayName = 'ProgressCircle';

export default MemoProgressCircle;
