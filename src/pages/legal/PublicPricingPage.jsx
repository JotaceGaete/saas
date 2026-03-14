import React from 'react';
import { Link } from 'react-router-dom';
import PublicPageLayout from 'components/PublicPageLayout';

const PLANS = [
  { id: 'free', name: 'Free', price: 0, listings: 'Up to 15 listings', cta: 'Get started', primary: false, path: '/business-registration' },
  { id: 'basic', name: 'Basic', price: 5, listings: 'More listings & features', cta: 'Choose Basic', primary: false, path: '/business-registration' },
  { id: 'pro', name: 'Pro', price: 10, listings: 'Advanced tools', cta: 'Choose Pro', primary: true, path: '/business-registration' },
  { id: 'full', name: 'Full', price: 14, listings: 'Full access', cta: 'Choose Full', primary: false, path: '/business-registration' },
];

export default function PublicPricingPage() {
  return (
    <PublicPageLayout title="Pricing">
      <p className="text-sm mb-8" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)', maxWidth: '56ch' }}>
        Simple plans for small businesses. Create your online catalog, share it via WhatsApp and social media, and manage orders in one place.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
        {PLANS.map((plan) => (
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
                {plan.price === 0 ? 'Free' : `US$ ${plan.price}`}
              </span>
              {plan.price > 0 && (
                <span className="text-xs ml-1" style={{ color: 'var(--color-muted-foreground)' }}>/ month</span>
              )}
            </div>
            <p className="text-sm mb-4 flex-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              {plan.listings}
            </p>
            <Link
              to={plan.path}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: plan.primary ? 'var(--color-primary)' : '#383838' }}
            >
              {plan.cta}
            </Link>
          </div>
        ))}
      </div>

      <p className="text-xs mt-8" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)', maxWidth: '60ch' }}>
        Features and limits may change. The exact capabilities of your account depend on your active plan. For full details, see our{' '}
        <Link to="/terms" className="underline" style={{ color: 'var(--color-primary)' }}>Terms of Service</Link>.
      </p>
    </PublicPageLayout>
  );
}
