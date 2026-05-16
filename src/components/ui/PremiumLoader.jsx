import React from 'react';
import VCheckIsotype from 'components/branding/VCheckIsotype';
import { isRestaurantBusiness } from '../../utils/businessType';

export function getLoadingCopy({ business = null, context = 'space', text } = {}) {
  if (text) return text;
  if (!business) return 'Preparando tu espacio...';
  if (isRestaurantBusiness(business)) {
    if (context === 'products' || context === 'catalog') return 'Preparando tu menú...';
    return 'Cargando tu restaurante...';
  }
  if (context === 'products') return 'Cargando tus productos...';
  if (context === 'catalog') return 'Cargando tu catálogo...';
  return 'Cargando tu tienda...';
}

export default function PremiumLoader({
  business = null,
  context = 'space',
  text,
  fullScreen = false,
  className = '',
}) {
  const label = getLoadingCopy({ business, context, text });
  const Wrapper = fullScreen ? 'div' : 'section';

  return (
    <Wrapper
      className={[
        fullScreen ? 'min-h-screen' : 'min-h-[13rem] rounded-2xl',
        'flex w-full items-center justify-center px-6 py-12',
        className,
      ].filter(Boolean).join(' ')}
      style={{ backgroundColor: fullScreen ? 'var(--color-background)' : 'transparent' }}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="w-full max-w-[18rem]">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-[0_8px_24px_rgba(17,24,39,0.08)]">
            <VCheckIsotype variant="embedded" size={18} title="Walinka" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>
              {label}
            </p>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              Sincronizando datos seguros
            </p>
          </div>
        </div>

        <div className="h-px w-full overflow-hidden rounded-full" style={{ backgroundColor: 'rgba(17,24,39,0.08)' }}>
          <div className="premium-loader-line h-full w-1/2 rounded-full" />
        </div>
      </div>
    </Wrapper>
  );
}
