import React from 'react';
import Icon from '../AppIcon';

const ILLUSTRATIONS = {
  products: (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="80" height="80" rx="20" fill="rgba(124,58,237,0.08)" />
      <rect x="20" y="24" width="40" height="32" rx="6" fill="rgba(124,58,237,0.15)" stroke="rgba(124,58,237,0.4)" strokeWidth="1.5" />
      <rect x="26" y="30" width="12" height="12" rx="3" fill="rgba(124,58,237,0.5)" />
      <rect x="42" y="31" width="12" height="3" rx="1.5" fill="rgba(124,58,237,0.4)" />
      <rect x="42" y="37" width="8" height="2.5" rx="1.25" fill="rgba(124,58,237,0.25)" />
      <rect x="26" y="46" width="28" height="2.5" rx="1.25" fill="rgba(124,58,237,0.2)" />
      <circle cx="56" cy="52" r="10" fill="rgba(124,58,237,0.9)" />
      <path d="M52 52h8M56 48v8" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  orders: (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="80" height="80" rx="20" fill="rgba(16,185,129,0.08)" />
      <rect x="22" y="20" width="36" height="44" rx="6" fill="rgba(16,185,129,0.12)" stroke="rgba(16,185,129,0.35)" strokeWidth="1.5" />
      <rect x="28" y="28" width="24" height="2.5" rx="1.25" fill="rgba(16,185,129,0.5)" />
      <rect x="28" y="34" width="18" height="2.5" rx="1.25" fill="rgba(16,185,129,0.35)" />
      <rect x="28" y="40" width="20" height="2.5" rx="1.25" fill="rgba(16,185,129,0.35)" />
      <rect x="28" y="46" width="14" height="2.5" rx="1.25" fill="rgba(16,185,129,0.25)" />
      <circle cx="56" cy="54" r="10" fill="rgba(16,185,129,0.9)" />
      <path d="M52.5 54l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  search: (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="80" height="80" rx="20" fill="rgba(100,116,139,0.08)" />
      <circle cx="36" cy="36" r="14" fill="rgba(100,116,139,0.12)" stroke="rgba(100,116,139,0.4)" strokeWidth="2" />
      <path d="M46 46l10 10" stroke="rgba(100,116,139,0.6)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M32 36h8M36 32v8" stroke="rgba(100,116,139,0.5)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  error: (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="80" height="80" rx="20" fill="rgba(239,68,68,0.08)" />
      <circle cx="40" cy="40" r="18" fill="rgba(239,68,68,0.12)" stroke="rgba(239,68,68,0.35)" strokeWidth="1.5" />
      <path d="M40 30v12" stroke="rgba(239,68,68,0.8)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="40" cy="48" r="2" fill="rgba(239,68,68,0.8)" />
    </svg>
  ),
  generic: (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="80" height="80" rx="20" fill="rgba(124,58,237,0.06)" />
      <rect x="24" y="28" width="32" height="24" rx="5" fill="rgba(124,58,237,0.1)" stroke="rgba(124,58,237,0.3)" strokeWidth="1.5" strokeDasharray="4 3" />
      <circle cx="40" cy="40" r="6" fill="rgba(124,58,237,0.25)" />
    </svg>
  ),
};

export default function EmptyState({
  illustration = 'generic',
  title,
  description,
  action,
  actionLabel,
  actionIcon,
  compact = false,
  className = '',
}) {
  const illu = ILLUSTRATIONS?.[illustration] || ILLUSTRATIONS?.generic;

  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? 'py-10 px-4' : 'py-16 px-6'
      } ${className}`}
    >
      <div className={`mb-4 ${compact ? 'scale-75' : ''}`}>
        {illu}
      </div>
      {title && (
        <h3
          className={`font-bold mb-1.5 ${compact ? 'text-sm' : 'text-base'}`}
          style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.01em' }}
        >
          {title}
        </h3>
      )}
      {description && (
        <p
          className={`max-w-xs leading-relaxed ${compact ? 'text-xs' : 'text-sm'}`}
          style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
        >
          {description}
        </p>
      )}
      {action && actionLabel && (
        <button
          onClick={action}
          className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-[0.98] hover:-translate-y-0.5"
          style={{
            backgroundColor: 'var(--color-primary)',
            boxShadow: 'var(--shadow-violet)',
            fontFamily: 'var(--font-caption)',
          }}
        >
          {actionIcon && <Icon name={actionIcon} size={15} color="#fff" />}
          {actionLabel}
        </button>
      )}
    </div>
  );
}
