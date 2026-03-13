import React from 'react';
import { hasViralBranding, VENTALINK_URL } from '../utils/branding';

/**
 * Footer de branding "Creado con Ventalink" para catálogo público.
 * Solo debe renderizarse cuando hasViralBranding(business) === true.
 */
export default function BrandingFooter({ business, className = '' }) {
  if (!hasViralBranding(business)) return null;

  return (
    <footer
      className={`text-center mt-8 pt-6 pb-2 ${className}`}
      style={{
        fontSize: '12px',
        color: '#9CA3AF',
        fontFamily: 'var(--font-caption), system-ui, sans-serif',
      }}
    >
      <p className="mb-0.5">Creado con Ventalink</p>
      <p className="mb-1">
        <a
          href={VENTALINK_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-gray-600 transition-colors"
          style={{ color: 'inherit' }}
        >
          Crear tu catálogo gratis
        </a>
      </p>
      <p className="text-[11px] opacity-80">{VENTALINK_URL}</p>
    </footer>
  );
}
