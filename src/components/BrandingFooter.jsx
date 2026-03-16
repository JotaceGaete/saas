import React from 'react';
import { getBrandingMessage } from '../utils/branding';

/**
 * Footer de branding para catálogo público.
 * Starter: versión comercial.
 * Pro: versión discreta.
 * Full/Business: sin branding.
 */
export default function BrandingFooter({ business, className = '' }) {
  const branding = getBrandingMessage(business);
  if (!branding) return null;
  const lines = branding.split('\n');

  return (
    <footer
      className={`text-center mt-8 pt-6 pb-2 ${className}`}
      style={{
        fontSize: '12px',
        color: '#9CA3AF',
        fontFamily: 'var(--font-caption), system-ui, sans-serif',
      }}
    >
      {lines.map((line) => (
        <p key={line} className="mb-0.5">
          {line.startsWith('http') ? (
            <a
              href={line}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-gray-600 transition-colors"
              style={{ color: 'inherit' }}
            >
              {line}
            </a>
          ) : line}
        </p>
      ))}
    </footer>
  );
}
