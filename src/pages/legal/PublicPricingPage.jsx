import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PublicPageLayout from 'components/PublicPageLayout';
import { collectVisitAttribution } from 'utils/analytics';
import { recordSiteVisit } from 'services/waBusinessService';
import { formatCurrency } from 'utils/formatCLP';
import { PLAN_SLUGS, getPlanLabel, getPlanLimits } from 'constants/plans';
import { getStoredCountryCode } from 'config/countryConfig';
import { getCurrency, getPlanDisplayPriceByCountry } from 'lib/billing';

const COUNTRY_CL = 'CL';

/** Planes alineados con constants/plans (starter, pro, business/Full). */
const PLAN_IDS = PLAN_SLUGS.map((slug) => ({
  id: slug,
  name: getPlanLabel(slug),
  limits: getPlanLimits(slug),
  primary: slug === 'pro',
}));

/**
 * Detect country for public pricing: go.ventalink.app usa país guardado; fallback por IP.
 * @returns {Promise<'CL'|'AR'|'INTL'|string>}
 */
async function detectCountryForPricing() {
  if (typeof window === 'undefined') return 'INTL';
  const host = (window.location?.hostname || '').toLowerCase();
  if (/(^|\.)go\.ventalink\.app$/.test(host)) {
    const stored = getStoredCountryCode();
    if (stored) return stored;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://ip-api.com/json/?fields=countryCode', { signal: controller.signal });
    clearTimeout(timeoutId);
    const data = await res.json();
    const code = (data?.countryCode || '').toUpperCase();
    if (code === 'AR') return 'AR';
    if (code === 'CL') return 'CL';
    return 'INTL';
  } catch {
    return 'INTL';
  }
}

export default function PublicPricingPage() {
  const [country, setCountry] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    recordSiteVisit({ path: '/plans', attribution: collectVisitAttribution() }).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    detectCountryForPricing().then((c) => {
      if (!cancelled) {
        setCountry(c);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const countryForBilling =
    country == null || country === 'INTL' ? 'US' : country;
  const currency = getCurrency(countryForBilling);
  const isChile = countryForBilling === 'CL';

  const getPrice = (planSlug) => {
    if (!country) return 0;
    return getPlanDisplayPriceByCountry(planSlug, countryForBilling);
  };

  const formatPrice = (planSlug) => {
    const price = getPrice(planSlug);
    if (price === 0) return 'Gratis';
    return formatCurrency(price, currency);
  };

  const ctaLabel = (planSlug) => {
    if (planSlug === 'starter') return 'Empezar gratis';
    return isChile ? 'Pagar con Mercado Pago' : 'Solicitar activación';
  };

  return (
    <PublicPageLayout title="Pricing">
      <p className="text-sm mb-6" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)', maxWidth: '56ch' }}>
        Simple plans for small businesses. Create your online catalog, share it via WhatsApp and social media, and manage orders in one place.
      </p>

      <div
        className="rounded-xl border px-4 py-3 mb-8 flex flex-wrap items-center gap-2"
        style={{ backgroundColor: 'var(--color-muted)', borderColor: 'var(--color-border)' }}
        role="note"
      >
        <p className="text-sm m-0" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
          Chile: CLP con Mercado Pago. Resto del mundo: precios de referencia en USD; activación coordinada por contacto.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <span className="text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            Detecting region…
          </span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {PLAN_IDS.map((plan) => {
              const limits = plan.limits;
              return (
                <div
                  key={plan.id}
                  className="rounded-2xl border p-5 flex flex-col"
                  style={{
                    backgroundColor: plan.primary ? 'rgba(124,58,237,0.06)' : '#ffffff',
                    borderColor: plan.primary ? 'var(--color-primary)' : 'var(--color-border)',
                    boxShadow: plan.primary ? '0 0 0 2px rgba(124,58,237,0.2)' : '0 1px 4px rgba(0,0,0,0.05)',
                  }}
                >
                  <h2 className="text-lg font-bold mb-2" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
                    {plan.name}
                  </h2>
                  <div className="mb-2">
                    <span className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
                      {formatPrice(plan.id)}
                    </span>
                    {getPrice(plan.id) > 0 && (
                      <span className="text-xs ml-1" style={{ color: 'var(--color-muted-foreground)' }}>/ mes</span>
                    )}
                  </div>
                  <p className="text-sm mb-4 flex-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                    {limits.maxProducts == null ? 'Productos ilimitados' : `${limits.maxProducts} productos`}
                    {' · '}
                    {limits.maxOrdersPerMonth == null ? 'Pedidos ilimitados' : `${limits.maxOrdersPerMonth} pedidos/mes`}
                    {' · '}
                    {plan.id === 'starter'
                      ? 'Branding Ventalink incluido'
                      : plan.id === 'pro'
                        ? 'Branding discreto'
                        : 'Sin branding'}
                  </p>
                  <Link
                    to="/business-registration"
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
                    style={{ backgroundColor: plan.primary ? 'var(--color-primary)' : (isChile ? '#009EE3' : '#25D366') }}
                  >
                    {ctaLabel(plan.id)}
                  </Link>
                </div>
              );
            })}
          </div>

          <p className="text-xs mt-8" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)', maxWidth: '60ch' }}>
            Features and limits may change. The exact capabilities of your account depend on your active plan. For full details, see our{' '}
            <Link to="/terms" className="underline" style={{ color: 'var(--color-primary)' }}>Terms of Service</Link>.
          </p>
        </>
      )}
    </PublicPageLayout>
  );
}
