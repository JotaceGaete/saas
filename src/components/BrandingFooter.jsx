import React from 'react';
import { getEffectivePlanSlug } from '../services/waBusinessService';

const REFERRAL_URL = 'https://ventalink.app?ref=catalog_footer';

/**
 * Footer de branding "Creado con Ventalink".
 * Visible en plan Starter y durante el trial.
 * Oculto en planes pagos activos (Pro, Business).
 *
 * No modifica branding.js (usado para mensajes WhatsApp — texto plano, sin links).
 */
export default function BrandingFooter({ business, className = '' }) {
  if (!business) return null;

  const effectivePlan = getEffectivePlanSlug(
    business.planSlug,
    business.planExpiresAt ?? null,
    business.trialExpiresAt ?? null,
  );
  const isTrial = !!(business.trialExpiresAt && new Date(business.trialExpiresAt) > new Date());
  const isStarter = effectivePlan === 'starter';

  if (!isStarter && !isTrial) return null;

  return (
    <footer
      className={`text-center mt-8 pb-4 ${className}`}
      style={{ fontFamily: 'var(--font-caption), system-ui, sans-serif' }}
    >
      <p className="m-0 text-xs" style={{ color: '#9CA3AF' }}>
        Creado con{' '}
        <a
          href={REFERRAL_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#9CA3AF', textDecoration: 'none', transition: 'color 0.15s' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#6B7280'; e.currentTarget.style.textDecoration = 'underline'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#9CA3AF'; e.currentTarget.style.textDecoration = 'none'; }}
        >
          Walinka
        </a>
      </p>
    </footer>
  );
}
