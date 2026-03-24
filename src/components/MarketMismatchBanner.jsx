import React, { useEffect, useRef, useState } from 'react';
import Icon from 'components/AppIcon';
import { useAuth } from '../contexts/AuthContext';
import { getDefaultDomainByMarket } from '../lib/market/routing';
import { fetchDetectedCountryMarket } from '../lib/market/fetchDetectedCountryMarket';
import { computeMarketMismatchBanner } from '../lib/market/suggestion-rules';
import {
  dismissSuggestionPair,
  marketToPreferenceKey,
  setStoredMarketPreference,
} from '../lib/market/suggestion-storage';

const SITE_LABEL = {
  CL: 'Ventalink Chile',
  AR: 'Ventalink Argentina',
  GLOBAL: 'Ventalink Global',
};

function countryLabel(iso) {
  if (iso === 'CL') return 'Chile';
  if (iso === 'AR') return 'Argentina';
  return null;
}

function buildDescription({ suggestedMarket, currentMarket, countryIso }) {
  const here = SITE_LABEL[currentMarket] || 'este sitio';
  const countryName = countryLabel(countryIso);

  if (suggestedMarket === 'GLOBAL' && (currentMarket === 'CL' || currentMarket === 'AR')) {
    return {
      line1: `Tu ubicación encaja mejor con ${SITE_LABEL.GLOBAL}, pero estás entrando a ${here}.`,
      line2: 'Puedes ir a la versión internacional o quedarte en el sitio actual.',
    };
  }

  if (countryName) {
    return {
      line1: `Detectamos que estás en ${countryName}, pero estás entrando a ${here}.`,
      line2: 'Puedes cambiar a la versión recomendada para tu país o quedarte aquí.',
    };
  }

  return {
    line1: `Tu región sugiere ${SITE_LABEL[suggestedMarket] || 'otra versión'}, pero estás en ${here}.`,
    line2: 'Puedes cambiar de sitio o continuar aquí.',
  };
}

function primaryLabel(suggestedMarket) {
  if (suggestedMarket === 'CL') return 'Ir a Chile';
  if (suggestedMarket === 'AR') return 'Ir a Argentina';
  return 'Ir a Global';
}

function stayLabel(currentMarket) {
  if (currentMarket === 'CL') return 'Quedarme en Chile';
  if (currentMarket === 'AR') return 'Quedarme en Argentina';
  return 'Quedarme en Global';
}

/**
 * Sugerencia no intrusiva de mercado según país detectado (borde o IP de respaldo).
 * No redirige solo; no escribe país del negocio.
 */
export default function MarketMismatchBanner() {
  const { user, loading: authLoading } = useAuth();
  const userRef = useRef(user);
  userRef.current = user;
  const [resolved, setResolved] = useState(false);
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    if (authLoading || typeof window === 'undefined') return;
    if (user) {
      setPayload(null);
      setResolved(true);
      return;
    }

    let cancelled = false;
    (async () => {
      const { market, countryIso } = await fetchDetectedCountryMarket();
      if (cancelled) return;
      const decision = computeMarketMismatchBanner({
        isAuthenticated: !!userRef.current,
        hostname: window.location.hostname,
        detectedMarket: market,
        countryIso,
      });
      setPayload(decision.show ? decision : null);
      setResolved(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  if (!resolved || !payload?.show) return null;

  const { suggestedMarket, currentMarket, countryIso } = payload;
  const { line1, line2 } = buildDescription({
    suggestedMarket,
    currentMarket,
    countryIso,
  });

  const goToSuggested = () => {
    const base = getDefaultDomainByMarket(suggestedMarket).replace(/\/$/, '');
    const path = `${window.location.pathname}${window.location.search || ''}`;
    window.location.href = `${base}${path}`;
  };

  const stayHere = () => {
    setStoredMarketPreference(marketToPreferenceKey(currentMarket));
    dismissSuggestionPair(suggestedMarket, currentMarket);
    setPayload(null);
  };

  return (
    <div
      className="w-full py-3 px-4 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-center gap-3 text-sm border-b"
      style={{
        backgroundColor: 'rgba(124, 58, 237, 0.08)',
        borderColor: 'rgba(124, 58, 237, 0.22)',
        fontFamily: 'var(--font-caption)',
        zIndex: 50,
      }}
      role="region"
      aria-label="Sugerencia de mercado"
    >
      <div className="flex items-start gap-2 min-w-0 flex-1 justify-center sm:justify-start">
        <Icon name="Globe" size={18} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--color-primary)' }} />
        <div className="min-w-0 text-center sm:text-left">
          <p className="m-0 font-medium" style={{ color: 'var(--color-foreground)' }}>
            {line1}
          </p>
          <p className="m-0 mt-1 text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
            {line2}
          </p>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 justify-center sm:justify-end shrink-0">
        <button
          type="button"
          onClick={goToSuggested}
          className="px-4 py-2 rounded-lg font-semibold text-sm transition-opacity hover:opacity-95"
          style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
        >
          {primaryLabel(suggestedMarket)}
        </button>
        <button
          type="button"
          onClick={stayHere}
          className="px-4 py-2 rounded-lg font-semibold text-sm border transition-opacity hover:opacity-95"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-background)',
            color: 'var(--color-foreground)',
          }}
        >
          {stayLabel(currentMarket)}
        </button>
      </div>
    </div>
  );
}
