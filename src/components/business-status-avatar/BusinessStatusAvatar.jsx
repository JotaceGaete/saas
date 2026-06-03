import React from 'react';

// ─── CSS keyframes ─────────────────────────────────────────────────────────────

const KEYFRAMES = `
@keyframes bsa-bounce {
  0%, 100% { transform: translateY(0) scaleX(1) scaleY(1); }
  40%       { transform: translateY(-11px) scaleX(1.04) scaleY(0.96); }
  57%       { transform: translateY(-11px) scaleX(1.04) scaleY(0.96); }
  78%       { transform: translateY(3px) scaleX(0.97) scaleY(1.03); }
}
@keyframes bsa-sway {
  0%, 100% { transform: rotate(0deg) translateY(0); }
  28%       { transform: rotate(5deg) translateY(-2px); }
  72%       { transform: rotate(-5deg) translateY(-2px); }
}
@keyframes bsa-shake {
  0%, 42%, 100% { transform: translateX(0); }
  8%             { transform: translateX(-6px); }
  18%            { transform: translateX(6px); }
  28%            { transform: translateX(-5px); }
  36%            { transform: translateX(4px); }
}
@keyframes bsa-shadow {
  0%, 100% { transform: scaleX(1);   opacity: 0.18; }
  48%       { transform: scaleX(0.55); opacity: 0.08; }
}
@keyframes bsa-sparkle {
  0%, 100% { transform: scale(1);    opacity: 0.9; }
  50%       { transform: scale(1.8); opacity: 0.1; }
}
@keyframes bsa-blink {
  0%, 92%, 100% { scaleY: 1; }
  96%            { transform: scaleY(0.05); }
}
@keyframes bsa-pulse-dot {
  0%, 100% { opacity: 0.8; transform: scale(1); }
  50%       { opacity: 0.3; transform: scale(0.7); }
}
`;

// ─── Avatar SVG por estado ────────────────────────────────────────────────────

function AvatarSuccess() {
  return (
    <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', width: '100%', height: '100%',
               animation: 'bsa-bounce 2.6s ease-in-out infinite', overflow: 'visible' }}>

      {/* Ground shadow */}
      <ellipse cx="60" cy="112" rx="28" ry="5"
        fill="rgba(0,0,0,0.15)"
        style={{ animation: 'bsa-shadow 2.6s ease-in-out infinite', transformOrigin: '60px 112px' }} />

      {/* Body / shirt */}
      <rect x="34" y="76" width="52" height="28" rx="8" fill="#16a34a" />
      <rect x="44" y="76" width="32" height="14" rx="4" fill="#15803d" opacity="0.5" />

      {/* Neck */}
      <rect x="50" y="68" width="20" height="12" rx="4" fill="#fde68a" />

      {/* Head */}
      <rect x="26" y="24" width="68" height="56" rx="20" fill="#fde68a" />

      {/* Ear left */}
      <ellipse cx="26" cy="52" rx="7" ry="9" fill="#fcd34d" />
      {/* Ear right */}
      <ellipse cx="94" cy="52" rx="7" ry="9" fill="#fcd34d" />

      {/* Hair */}
      <path d="M 26 38 Q 36 18 60 16 Q 84 18 94 38 Q 88 22 60 20 Q 32 22 26 38 Z"
        fill="#92400e" />

      {/* Eyes white */}
      <ellipse cx="44" cy="50" rx="9" ry="10" fill="white" />
      <ellipse cx="76" cy="50" rx="9" ry="10" fill="white" />

      {/* Pupils */}
      <ellipse cx="45" cy="51" rx="5" ry="5.5" fill="#1e3a5f"
        style={{ animation: 'bsa-blink 3.5s ease-in-out infinite', transformOrigin: '45px 51px' }} />
      <ellipse cx="77" cy="51" rx="5" ry="5.5" fill="#1e3a5f"
        style={{ animation: 'bsa-blink 3.5s ease-in-out infinite', transformOrigin: '77px 51px' }} />

      {/* Pupil shine */}
      <circle cx="47" cy="48" r="2" fill="white" opacity="0.9" />
      <circle cx="79" cy="48" r="2" fill="white" opacity="0.9" />

      {/* Eyebrows — happy raised */}
      <path d="M 35 37 Q 44 32 53 37" stroke="#92400e" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M 67 37 Q 76 32 85 37" stroke="#92400e" strokeWidth="3" strokeLinecap="round" fill="none" />

      {/* Smile */}
      <path d="M 42 66 Q 60 80 78 66" stroke="#d97706" strokeWidth="3.5" strokeLinecap="round" fill="none" />

      {/* Cheeks */}
      <ellipse cx="34" cy="62" rx="9" ry="6" fill="#fca5a5" opacity="0.45" />
      <ellipse cx="86" cy="62" rx="9" ry="6" fill="#fca5a5" opacity="0.45" />

      {/* Sparkles */}
      <circle cx="100" cy="28" r="4" fill="white" opacity="0.85"
        style={{ animation: 'bsa-sparkle 1.4s ease-in-out infinite' }} />
      <circle cx="108" cy="42" r="2.5" fill="white" opacity="0.65"
        style={{ animation: 'bsa-sparkle 1.4s ease-in-out 0.5s infinite' }} />
      <circle cx="96" cy="16" r="2" fill="white" opacity="0.5"
        style={{ animation: 'bsa-sparkle 1.4s ease-in-out 0.9s infinite' }} />
    </svg>
  );
}

function AvatarWarning() {
  return (
    <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', width: '100%', height: '100%',
               animation: 'bsa-sway 3s ease-in-out infinite', overflow: 'visible' }}>

      {/* Body / shirt */}
      <rect x="34" y="76" width="52" height="28" rx="8" fill="#d97706" />
      <rect x="44" y="76" width="32" height="14" rx="4" fill="#b45309" opacity="0.5" />

      {/* Neck */}
      <rect x="50" y="68" width="20" height="12" rx="4" fill="#fde68a" />

      {/* Head */}
      <rect x="26" y="24" width="68" height="56" rx="20" fill="#fde68a" />

      {/* Ear left */}
      <ellipse cx="26" cy="52" rx="7" ry="9" fill="#fcd34d" />
      {/* Ear right */}
      <ellipse cx="94" cy="52" rx="7" ry="9" fill="#fcd34d" />

      {/* Hair */}
      <path d="M 26 38 Q 36 18 60 16 Q 84 18 94 38 Q 88 22 60 20 Q 32 22 26 38 Z"
        fill="#78350f" />

      {/* Eyes white */}
      <ellipse cx="44" cy="50" rx="9" ry="10" fill="white" />
      <ellipse cx="76" cy="50" rx="9" ry="10" fill="white" />

      {/* Pupils — looking up/thinking */}
      <ellipse cx="45" cy="48" rx="5" ry="5.5" fill="#1e3a5f" />
      <ellipse cx="77" cy="48" rx="5" ry="5.5" fill="#1e3a5f" />
      <circle cx="47" cy="46" r="2" fill="white" opacity="0.9" />
      <circle cx="79" cy="46" r="2" fill="white" opacity="0.9" />

      {/* Eyebrow — one raised (thinking) */}
      <path d="M 35 36 Q 44 31 53 36" stroke="#78350f" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M 67 33 Q 76 28 85 34" stroke="#78350f" strokeWidth="3.5" strokeLinecap="round" fill="none" />

      {/* Neutral mouth */}
      <path d="M 44 68 Q 60 70 76 68" stroke="#d97706" strokeWidth="3.5" strokeLinecap="round" fill="none" />

      {/* Thought bubble dots */}
      <circle cx="94" cy="36" r="4.5" fill="white" opacity="0.8"
        style={{ animation: 'bsa-pulse-dot 1.4s ease-in-out infinite' }} />
      <circle cx="103" cy="26" r="3" fill="white" opacity="0.6"
        style={{ animation: 'bsa-pulse-dot 1.4s ease-in-out 0.3s infinite' }} />
      <circle cx="110" cy="18" r="1.8" fill="white" opacity="0.4"
        style={{ animation: 'bsa-pulse-dot 1.4s ease-in-out 0.6s infinite' }} />

      {/* Hand on chin gesture */}
      <rect x="48" y="74" width="24" height="10" rx="5" fill="#fcd34d" opacity="0.6" />
    </svg>
  );
}

function AvatarDanger() {
  return (
    <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', width: '100%', height: '100%',
               animation: 'bsa-shake 2s ease-in-out infinite', overflow: 'visible' }}>

      {/* Body / shirt */}
      <rect x="34" y="76" width="52" height="28" rx="8" fill="#dc2626" />
      <rect x="44" y="76" width="32" height="14" rx="4" fill="#b91c1c" opacity="0.5" />

      {/* Neck */}
      <rect x="50" y="68" width="20" height="12" rx="4" fill="#fde68a" />

      {/* Head */}
      <rect x="26" y="24" width="68" height="56" rx="20" fill="#fde68a" />

      {/* Ear left */}
      <ellipse cx="26" cy="52" rx="7" ry="9" fill="#fcd34d" />
      {/* Ear right */}
      <ellipse cx="94" cy="52" rx="7" ry="9" fill="#fcd34d" />

      {/* Hair — slightly disheveled */}
      <path d="M 26 38 Q 36 18 60 16 Q 84 18 94 38 Q 88 22 60 20 Q 32 22 26 38 Z"
        fill="#374151" />
      {/* Disheveled strand */}
      <path d="M 60 16 Q 64 8 68 14" stroke="#374151" strokeWidth="4" strokeLinecap="round" fill="none" />

      {/* Eyes white */}
      <ellipse cx="44" cy="50" rx="9" ry="10" fill="white" />
      <ellipse cx="76" cy="50" rx="9" ry="10" fill="white" />

      {/* Pupils — wide worried */}
      <ellipse cx="44" cy="51" rx="5.5" ry="6" fill="#1e3a5f" />
      <ellipse cx="76" cy="51" rx="5.5" ry="6" fill="#1e3a5f" />
      <circle cx="46" cy="48" r="2" fill="white" opacity="0.9" />
      <circle cx="78" cy="48" r="2" fill="white" opacity="0.9" />

      {/* Furrowed brows */}
      <path d="M 34 35 L 53 40"  stroke="#374151" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <path d="M 67 40 L 86 35"  stroke="#374151" strokeWidth="3.5" strokeLinecap="round" fill="none" />

      {/* Frown */}
      <path d="M 42 70 Q 60 60 78 70" stroke="#dc2626" strokeWidth="3.5" strokeLinecap="round" fill="none" />

      {/* Sweat drops */}
      <ellipse cx="96" cy="40" rx="5" ry="7" fill="rgba(186,230,253,0.8)"
        style={{ animation: 'bsa-pulse-dot 1.8s ease-in-out infinite' }} />
      <ellipse cx="22" cy="46" rx="4" ry="5.5" fill="rgba(186,230,253,0.6)"
        style={{ animation: 'bsa-pulse-dot 1.8s ease-in-out 0.6s infinite' }} />

      {/* Worry lines on forehead */}
      <path d="M 40 27 Q 46 24 52 27" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.6" />
      <path d="M 42 22 Q 48 19 54 22" stroke="#f59e0b" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.4" />
    </svg>
  );
}

function AvatarUnconfigured() {
  return (
    <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', width: '100%', height: '100%', overflow: 'visible' }}>
      <rect x="34" y="76" width="52" height="28" rx="8" fill="#3b82f6" />
      <rect x="50" y="68" width="20" height="12" rx="4" fill="#fde68a" />
      <rect x="26" y="24" width="68" height="56" rx="20" fill="#fde68a" />
      <ellipse cx="26" cy="52" rx="7" ry="9" fill="#fcd34d" />
      <ellipse cx="94" cy="52" rx="7" ry="9" fill="#fcd34d" />
      <path d="M 26 38 Q 36 18 60 16 Q 84 18 94 38 Q 88 22 60 20 Q 32 22 26 38 Z" fill="#6b7280" />
      <ellipse cx="44" cy="50" rx="9" ry="10" fill="white" />
      <ellipse cx="76" cy="50" rx="9" ry="10" fill="white" />
      <ellipse cx="44" cy="51" rx="5" ry="5.5" fill="#1e3a5f" />
      <ellipse cx="76" cy="51" rx="5" ry="5.5" fill="#1e3a5f" />
      <circle cx="46" cy="48" r="2" fill="white" opacity="0.9" />
      <circle cx="78" cy="48" r="2" fill="white" opacity="0.9" />
      <path d="M 44 68 Q 60 70 76 68" stroke="#6b7280" strokeWidth="3.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

const AVATAR_MAP = {
  success: AvatarSuccess,
  warning: AvatarWarning,
  danger:  AvatarDanger,
};

// ─── Public component ─────────────────────────────────────────────────────────

/**
 * Animated financial-state avatar. Pure SVG — no external files, always visible.
 * @param {{ status: 'success' | 'warning' | 'danger' }} props
 */
export default function BusinessStatusAvatar({ status }) {
  const AvatarComponent = AVATAR_MAP[status] || AvatarUnconfigured;

  return (
    <>
      <style>{KEYFRAMES}</style>
      <AvatarComponent />
    </>
  );
}
