import React from 'react';

const HEADER_BAR_HEIGHT = 60;
const HAMBURGER_SIZE = 40;

/**
 * Header del panel móvil/desktop.
 * - Respeta env(safe-area-inset-top) en iPhone (notch, Dynamic Island)
 * - Padding-top dinámico con safe-area
 * - En móvil: espacio a la izquierda (w-11) para el botón hamburguesa
 * - Altura suficiente, diseño equilibrado
 * - Márgenes laterales 16px en móvil
 */
export default function PanelHeader({
  title,
  subtitle,
  leftSpacer = true,
  leftAction,
  children,
  mobileActions,
  className = '',
  style = {},
}) {
  return (
    <div
      className={`sticky top-0 z-50 flex-shrink-0 border-b flex flex-col ${className}`}
      style={{
        backgroundColor: 'rgba(246, 247, 251, 0.92)',
        borderColor: 'rgba(17,24,39,0.07)',
        boxShadow: 'none',
        backdropFilter: 'blur(14px)',
        paddingTop: 'var(--safe-area-top)',
        minHeight: `calc(${HEADER_BAR_HEIGHT}px + var(--safe-area-top))`,
        ...style,
      }}
      role="banner"
    >
      <div
        className="flex items-center gap-3 px-4 md:px-6 lg:pl-4 lg:pr-6 py-0"
        style={{ minHeight: HEADER_BAR_HEIGHT }}
      >
        {leftSpacer && (
          <div className="w-11 lg:w-0 flex-shrink-0" aria-hidden="true" />
        )}
        {leftAction && (
          <div className="flex-shrink-0">{leftAction}</div>
        )}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col justify-center">
          {title}
          {subtitle}
        </div>
        {/* En desktop siempre visible. En móvil se oculta si hay mobileActions. */}
        {children && (
          <div className={`flex-shrink-0 flex items-center gap-2${mobileActions ? ' hidden sm:flex' : ''}`}>
            {children}
          </div>
        )}
      </div>
      {/* Segunda fila solo en móvil */}
      {mobileActions && (
        <div className="sm:hidden flex gap-2 px-4 pb-3">
          {mobileActions}
        </div>
      )}
    </div>
  );
}

export const HEADER_BAR_HEIGHT_PX = HEADER_BAR_HEIGHT;
export const HAMBURGER_VERTICAL_OFFSET = (HEADER_BAR_HEIGHT - HAMBURGER_SIZE) / 2;
