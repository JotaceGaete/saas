import React from 'react';
import Icon from 'components/AppIcon';
import { setManualMarketChoice, MANUAL_MARKET } from 'config/countryConfig';
import { navigateToMarketRegistration } from 'lib/market/routing';

/**
 * Selector Chile / Argentina / Resto (go) antes del registro.
 * Persiste ventalink_manual_market y redirige al dominio correcto.
 */
export default function MarketEntryModal({ open, onClose }) {
  if (!open) return null;

  const choose = (market) => {
    setManualMarketChoice(market);
    navigateToMarketRegistration(market);
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15,23,42,0.45)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="market-entry-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-6 shadow-xl"
        style={{
          backgroundColor: 'var(--color-background)',
          borderColor: 'var(--color-border)',
          fontFamily: 'var(--font-body)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <h2
              id="market-entry-title"
              className="text-lg font-bold m-0"
              style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}
            >
              ¿Dónde quieres crear tu cuenta?
            </h2>
            <p className="text-sm mt-1 mb-0" style={{ color: 'var(--color-muted-foreground)' }}>
              Elige tu mercado para continuar al registro en el sitio correcto.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center hover:bg-muted transition-colors"
            aria-label="Cerrar"
          >
            <Icon name="X" size={18} color="var(--color-foreground)" />
          </button>
        </div>

        <div className="grid gap-2">
          <button
            type="button"
            onClick={() => choose(MANUAL_MARKET.CL)}
            className="flex items-center gap-3 w-full p-4 rounded-xl border-2 text-left transition-all hover:opacity-95"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-background)',
              color: 'var(--color-foreground)',
            }}
          >
            <span className="text-2xl" aria-hidden>🇨🇱</span>
            <div className="flex-1 min-w-0">
              <span className="font-semibold block">Chile</span>
              <span className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                cl.ventalink.app
              </span>
            </div>
            <Icon name="ChevronRight" size={18} style={{ color: 'var(--color-muted-foreground)' }} />
          </button>

          <button
            type="button"
            onClick={() => choose(MANUAL_MARKET.AR)}
            className="flex items-center gap-3 w-full p-4 rounded-xl border-2 text-left transition-all hover:opacity-95"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-background)',
              color: 'var(--color-foreground)',
            }}
          >
            <span className="text-2xl" aria-hidden>🇦🇷</span>
            <div className="flex-1 min-w-0">
              <span className="font-semibold block">Argentina</span>
              <span className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                ar.ventalink.app
              </span>
            </div>
            <Icon name="ChevronRight" size={18} style={{ color: 'var(--color-muted-foreground)' }} />
          </button>

          <button
            type="button"
            onClick={() => choose(MANUAL_MARKET.GLOBAL)}
            className="flex items-center gap-3 w-full p-4 rounded-xl border-2 text-left transition-all hover:opacity-95"
            style={{
              borderColor: 'var(--color-primary)',
              backgroundColor: 'rgba(124, 58, 237, 0.06)',
              color: 'var(--color-foreground)',
            }}
          >
            <span className="text-2xl" aria-hidden>🌐</span>
            <div className="flex-1 min-w-0">
              <span className="font-semibold block">Resto de países</span>
              <span className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                go.ventalink.app · internacional
              </span>
            </div>
            <Icon name="ChevronRight" size={18} style={{ color: 'var(--color-primary)' }} />
          </button>
        </div>
      </div>
    </div>
  );
}
