import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PublicPageLayout from 'components/PublicPageLayout';
import { formatCurrency } from 'utils/formatCLP';
import { PLAN_PRICES_CLP } from 'constants/plans';

const COUNTRY_CL = 'CL';

/** Plan ids and names; prices come from country-specific data */
const PLAN_IDS = [
  { id: 'free', name: 'Free', listings: 'Up to 15 listings', primary: false },
  { id: 'basic', name: 'Basic', listings: 'More listings & features', primary: false },
  { id: 'pro', name: 'Pro', listings: 'Advanced tools', primary: true },
  { id: 'full', name: 'Full', listings: 'Full access', primary: false },
];

/** USD prices for public page (international / Paddle) */
const PLAN_PRICES_USD_PUBLIC = { free: 0, basic: 5, pro: 10, full: 14 };

/** CLP prices for Chile (Mercado Pago) – aligned with PLAN_PRICES_CLP */
const PLAN_PRICES_CLP_PUBLIC = {
  free: 0,
  basic: PLAN_PRICES_CLP.control,
  pro: PLAN_PRICES_CLP.pro,
  full: PLAN_PRICES_CLP.business,
};

/**
 * Detect country for public pricing: hostname first (cl.ventalink.app → CL), then IP geo.
 * @returns {Promise<'CL'|'INTL'>}
 */
async function detectCountryForPricing() {
  if (typeof window === 'undefined') return 'INTL';
  const host = (window.location?.hostname || '').toLowerCase();
  if (/(^|\.)cl\.ventalink\.app$/.test(host)) return 'CL';
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://ip-api.com/json/?fields=countryCode', { signal: controller.signal });
    clearTimeout(timeoutId);
    const data = await res.json();
    const code = (data?.countryCode || '').toUpperCase();
    return code === 'CL' ? 'CL' : 'INTL';
  } catch {
    return 'INTL';
  }
}

export default function PublicPricingPage() {
  const [country, setCountry] = useState(null);
  const [loading, setLoading] = useState(true);

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

  const isChile = country === COUNTRY_CL;
  const currency = isChile ? 'CLP' : 'USD';
  const paymentMethod = isChile ? 'Mercado Pago' : 'Paddle';

  const getPrice = (planId) => {
    if (isChile) return PLAN_PRICES_CLP_PUBLIC[planId] ?? 0;
    return PLAN_PRICES_USD_PUBLIC[planId] ?? 0;
  };

  const formatPrice = (planId) => {
    const price = getPrice(planId);
    if (price === 0) return 'Free';
    return formatCurrency(price, currency);
  };

  const ctaLabel = (planId) => {
    if (planId === 'free') return 'Get started';
    return isChile ? `Pay with Mercado Pago` : `Pay with Paddle`;
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
          Payment method and currency depend on the customer&apos;s country.
          Chile: payments in CLP via Mercado Pago.
          International: payments in USD via Paddle.
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            {PLAN_IDS.map((plan) => (
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
                    <span className="text-xs ml-1" style={{ color: 'var(--color-muted-foreground)' }}>/ month</span>
                  )}
                </div>
                <p className="text-sm mb-4 flex-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                  {plan.listings}
                </p>
                <Link
                  to="/business-registration"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
                  style={{ backgroundColor: plan.primary ? 'var(--color-primary)' : (isChile ? '#009EE3' : '#383838') }}
                >
                  {ctaLabel(plan.id)}
                </Link>
              </div>
            ))}
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
