import React from 'react';
import { Link } from 'react-router-dom';
import Icon from 'components/AppIcon';
import GlobalFooter from 'components/GlobalFooter';

export default function PublicPageLayout({ title, children }) {
  return (
    <div
      className="min-h-screen w-full max-w-full min-w-0 overflow-x-hidden flex flex-col"
      style={{ backgroundColor: 'var(--color-background)' }}
    >
      <header
        className="border-b w-full shrink-0"
        style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)' }}
        role="banner"
      >
        <div className="w-full max-w-screen-xl mx-auto px-4 md:px-6 lg:px-8 h-14 flex items-center justify-between gap-4 min-w-0">
          <Link
            to="/"
            className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)' }}
            >
              <Icon name="ShoppingBag" size={15} color="#FFFFFF" />
            </div>
            <span
              className="font-bold text-sm tracking-tight"
              style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}
            >
              [COMPANY_NAME]
            </span>
          </Link>
          <nav className="flex items-center gap-4" aria-label="Secondary">
            <Link
              to="/plans"
              className="text-xs font-medium transition-opacity hover:opacity-80"
              style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)', textDecoration: 'none' }}
            >
              Plans
            </Link>
            <Link
              to="/"
              className="text-xs font-medium transition-opacity hover:opacity-80"
              style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)', textDecoration: 'none' }}
            >
              Home
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 w-full max-w-screen-xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-12 min-w-0">
        {title && (
          <h1
            className="text-2xl md:text-3xl font-bold mb-6 md:mb-8"
            style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}
          >
            {title}
          </h1>
        )}
        {children}
      </main>

      <GlobalFooter />
    </div>
  );
}
