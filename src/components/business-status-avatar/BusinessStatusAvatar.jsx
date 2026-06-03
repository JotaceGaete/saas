import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';

// Lazy-load lottie-react so it doesn't block initial render
const Lottie = lazy(() => import('lottie-react'));

const LOTTIE_PATHS = {
  success: '/lotties/business-success.json',
  warning: '/lotties/business-warning.json',
  danger:  '/lotties/business-danger.json',
};

// ─── SVG fallback (shown while Lottie loads or if fetch fails) ─────────────────

function FallbackFace({ status }) {
  const cfg = {
    success: { bg: '#22c55e', mouth: 'M -20 8 Q 0 24 20 8', brow: null,      anim: 'bsa-bounce' },
    warning: { bg: '#f59e0b', mouth: 'M -18 14 L 18 14',     brow: 'M -26 -26 L -14 -30', anim: 'bsa-sway' },
    danger:  { bg: '#ef4444', mouth: 'M -20 22 Q 0 10 20 22', brow: 'M -26 -28 L -14 -34', anim: 'bsa-shake' },
  }[status] || { bg: '#6b7280', mouth: 'M -16 14 L 16 14', brow: null, anim: '' };

  return (
    <svg viewBox="-55 -55 110 110" xmlns="http://www.w3.org/2000/svg"
      style={{ animation: cfg.anim ? `${cfg.anim} 2s ease-in-out infinite` : 'none', display: 'block', width: '100%', height: '100%' }}>
      {/* Head */}
      <circle cx="0" cy="0" r="48" fill={cfg.bg} />
      {/* Eyes */}
      <ellipse cx="-16" cy="-10" rx="7" ry="8" fill="white" />
      <ellipse cx="16"  cy="-10" rx="7" ry="8" fill="white" />
      {/* Pupils */}
      <circle cx="-16" cy="-9" r="3.5" fill="#1e293b" />
      <circle cx="16"  cy="-9" r="3.5" fill="#1e293b" />
      {/* Eyebrows */}
      {cfg.brow && (
        <>
          <path d={cfg.brow} stroke="white" strokeWidth="3.5" strokeLinecap="round" fill="none" />
          <path d={cfg.brow.replace(/-26/g, '14').replace(/-14/g, '26')} stroke="white" strokeWidth="3.5" strokeLinecap="round" fill="none" />
        </>
      )}
      {/* Mouth */}
      <path d={cfg.mouth} stroke="white" strokeWidth="4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

// ─── Lottie loader with intersection observer ──────────────────────────────────

function LottieAvatar({ status }) {
  const [animData, setAnimData] = useState(null);
  const [failed,   setFailed]   = useState(false);
  const [inView,   setInView]   = useState(false);
  const containerRef = useRef(null);

  // Only load when visible
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); obs.disconnect(); } },
      { threshold: 0.1 }
    );
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;
    const path = LOTTIE_PATHS[status];
    if (!path) return;
    fetch(path)
      .then(r => r.json())
      .then(setAnimData)
      .catch(() => setFailed(true));
  }, [inView, status]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      {(!inView || (!animData && !failed)) && <FallbackFace status={status} />}
      {inView && animData && !failed && (
        <Suspense fallback={<FallbackFace status={status} />}>
          <Lottie
            animationData={animData}
            loop
            autoplay
            style={{ width: '100%', height: '100%' }}
            rendererSettings={{ preserveAspectRatio: 'xMidYMid meet' }}
          />
        </Suspense>
      )}
      {failed && <FallbackFace status={status} />}
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

/**
 * @param {{ status: 'success' | 'warning' | 'danger' }} props
 */
export default function BusinessStatusAvatar({ status }) {
  return (
    <>
      <style>{`
        @keyframes bsa-bounce {
          0%, 100% { transform: translateY(0) scaleX(1) scaleY(1); }
          45%       { transform: translateY(-10px) scaleX(1.04) scaleY(0.96); }
          55%       { transform: translateY(-10px) scaleX(1.04) scaleY(0.96); }
          80%       { transform: translateY(2px) scaleX(0.98) scaleY(1.02); }
        }
        @keyframes bsa-sway {
          0%, 100% { transform: rotate(0deg); }
          30%       { transform: rotate(4deg); }
          70%       { transform: rotate(-4deg); }
        }
        @keyframes bsa-shake {
          0%, 100% { transform: translateX(0); }
          15%       { transform: translateX(-5px); }
          30%       { transform: translateX(5px); }
          45%       { transform: translateX(-4px); }
          60%       { transform: translateX(4px); }
          75%       { transform: translateX(-2px); }
          85%       { transform: translateX(2px); }
        }
      `}</style>
      <LottieAvatar status={status} />
    </>
  );
}
