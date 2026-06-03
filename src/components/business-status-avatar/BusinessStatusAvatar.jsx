import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';

// Lazy-load lottie-react — doesn't block initial render
const Lottie = lazy(() => import('lottie-react'));

const LOTTIE_PATHS = {
  success: '/lotties/business-success.json',
  warning: '/lotties/business-warning.json',
  danger:  '/lotties/business-danger.json',
};

// ─── Animated SVG avatar (primary render — always visible) ────────────────────

function AnimatedSvgFace({ status }) {
  const cfg = {
    success: {
      faceColor: '#22c55e',
      highlightColor: '#4ade80',
      eyeColor: '#14532d',
      mouth: 'M -20 8 Q 0 26 20 8',
      cheekOpacity: 0.25,
      animation: 'bsa-bounce',
      eyeRy: 8,
    },
    warning: {
      faceColor: '#f59e0b',
      highlightColor: '#fcd34d',
      eyeColor: '#78350f',
      mouth: 'M -16 16 L 16 16',
      cheekOpacity: 0,
      animation: 'bsa-sway',
      eyeRy: 7,
    },
    danger: {
      faceColor: '#ef4444',
      highlightColor: '#f87171',
      eyeColor: '#7f1d1d',
      mouth: 'M -20 22 Q 0 10 20 22',
      cheekOpacity: 0,
      animation: 'bsa-shake',
      eyeRy: 7,
    },
  }[status] || {
    faceColor: '#6b7280', highlightColor: '#9ca3af', eyeColor: '#1f2937',
    mouth: 'M -14 14 L 14 14', cheekOpacity: 0, animation: '', eyeRy: 7,
  };

  return (
    <svg
      viewBox="-52 -52 104 104"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        animation: cfg.animation ? `${cfg.animation} 2.4s ease-in-out infinite` : 'none',
        overflow: 'visible',
      }}
    >
      {/* Shadow */}
      <ellipse cx="0" cy="44" rx="32" ry="6" fill="rgba(0,0,0,0.15)"
        style={{ animation: cfg.animation === 'bsa-bounce' ? 'bsa-shadow 2.4s ease-in-out infinite' : 'none' }} />

      {/* Head */}
      <circle cx="0" cy="0" r="46" fill={cfg.faceColor} />

      {/* Highlight */}
      <ellipse cx="-12" cy="-18" rx="14" ry="10" fill={cfg.highlightColor} opacity="0.35" />

      {/* Eyes white */}
      <ellipse cx="-16" cy="-10" rx="8" ry={cfg.eyeRy} fill="white" />
      <ellipse cx="16"  cy="-10" rx="8" ry={cfg.eyeRy} fill="white" />

      {/* Pupils */}
      <circle cx="-15" cy="-9" r="4" fill={cfg.eyeColor} />
      <circle cx="15"  cy="-9" r="4" fill={cfg.eyeColor} />

      {/* Pupil shine */}
      <circle cx="-13" cy="-11" r="1.5" fill="white" opacity="0.8" />
      <circle cx="17"  cy="-11" r="1.5" fill="white" opacity="0.8" />

      {/* Furrowed brows for danger */}
      {status === 'danger' && (
        <>
          <path d="M -28 -26 L -12 -32" stroke="white" strokeWidth="3.5" strokeLinecap="round" fill="none" opacity="0.9" />
          <path d="M 12 -32 L 28 -26"  stroke="white" strokeWidth="3.5" strokeLinecap="round" fill="none" opacity="0.9" />
        </>
      )}

      {/* Thinking brow for warning */}
      {status === 'warning' && (
        <path d="M -28 -28 L -12 -32" stroke="white" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.8" />
      )}

      {/* Thought dots for warning */}
      {status === 'warning' && (
        <>
          <circle cx="32" cy="-34" r="4"   fill="white" opacity="0.7" />
          <circle cx="40" cy="-44" r="3"   fill="white" opacity="0.5" />
          <circle cx="46" cy="-52" r="2"   fill="white" opacity="0.35" />
        </>
      )}

      {/* Star sparkles for success */}
      {status === 'success' && (
        <>
          <circle cx="38" cy="-36" r="3" fill="white" opacity="0.8"
            style={{ animation: 'bsa-sparkle 1.2s ease-in-out infinite' }} />
          <circle cx="44" cy="-24" r="2" fill="white" opacity="0.6"
            style={{ animation: 'bsa-sparkle 1.2s ease-in-out 0.4s infinite' }} />
          <circle cx="34" cy="-48" r="2" fill="white" opacity="0.5"
            style={{ animation: 'bsa-sparkle 1.2s ease-in-out 0.8s infinite' }} />
        </>
      )}

      {/* Cheeks for success */}
      {cfg.cheekOpacity > 0 && (
        <>
          <ellipse cx="-30" cy="14" rx="12" ry="8" fill="white" opacity={cfg.cheekOpacity} />
          <ellipse cx="30"  cy="14" rx="12" ry="8" fill="white" opacity={cfg.cheekOpacity} />
        </>
      )}

      {/* Sweat drop for danger */}
      {status === 'danger' && (
        <ellipse cx="34" cy="-14" rx="5" ry="7" fill="rgba(200,230,255,0.6)" />
      )}

      {/* Mouth */}
      <path d={cfg.mouth} stroke="white" strokeWidth="4.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

// ─── CSS keyframes (injected once) ────────────────────────────────────────────

const KEYFRAMES = `
@keyframes bsa-bounce {
  0%, 100% { transform: translateY(0) scaleX(1)    scaleY(1); }
  40%       { transform: translateY(-12px) scaleX(1.05) scaleY(0.95); }
  55%       { transform: translateY(-12px) scaleX(1.05) scaleY(0.95); }
  75%       { transform: translateY(3px) scaleX(0.97) scaleY(1.03); }
}
@keyframes bsa-shadow {
  0%, 100% { transform: scaleX(1)   translateY(0);  opacity: 0.5; }
  47%       { transform: scaleX(0.6) translateY(0);  opacity: 0.2; }
}
@keyframes bsa-sway {
  0%, 100% { transform: rotate(0deg); }
  25%       { transform: rotate(5deg); }
  75%       { transform: rotate(-5deg); }
}
@keyframes bsa-shake {
  0%, 45%, 100% { transform: translateX(0); }
  10%            { transform: translateX(-5px); }
  20%            { transform: translateX(5px); }
  30%            { transform: translateX(-4px); }
  38%            { transform: translateX(4px); }
}
@keyframes bsa-sparkle {
  0%, 100% { transform: scale(1);   opacity: 0.8; }
  50%       { transform: scale(1.6); opacity: 0.2; }
}
`;

// ─── Lottie loader (optional enhancement — falls back to SVG on any error) ───

function LottieLayer({ status }) {
  const [animData, setAnimData] = useState(null);
  const [failed,   setFailed]   = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        obs.disconnect();
        fetch(LOTTIE_PATHS[status])
          .then(r => { if (!r.ok) throw new Error('not ok'); return r.json(); })
          .then(setAnimData)
          .catch(() => setFailed(true));
      },
      { threshold: 0.1 }
    );
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [status]);

  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0 }}>
      {animData && !failed && (
        <Suspense fallback={null}>
          <Lottie
            animationData={animData}
            loop={true}
            autoplay={true}
            style={{ width: '100%', height: '100%' }}
            rendererSettings={{ preserveAspectRatio: 'xMidYMid meet', clearCanvas: false }}
          />
        </Suspense>
      )}
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

/**
 * Shows an animated face that reflects the business financial state.
 * The SVG face is always visible; Lottie is an optional overlay loaded lazily.
 *
 * @param {{ status: 'success' | 'warning' | 'danger' }} props
 */
export default function BusinessStatusAvatar({ status }) {
  return (
    <>
      <style>{KEYFRAMES}</style>
      {/* SVG is the guaranteed visible layer — always rendered */}
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <AnimatedSvgFace status={status} />
        {/* Lottie loads in background — if it works it overlays the SVG */}
        {status && <LottieLayer status={status} />}
      </div>
    </>
  );
}
