import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';

const LEGAL_LINKS = [
  { label: 'Plans', path: '/plans' },
  { label: 'Terms of Service', path: '/terms' },
  { label: 'Privacy Policy', path: '/privacy' },
  { label: 'Refund Policy', path: '/refunds' },
];

const APP_LINKS = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Products', path: '/product-management' },
  { label: 'Settings', path: '/business-configuration' },
  { label: 'Create account', path: '/business-registration' },
];

export default function GlobalFooter() {
  const navigate = useNavigate();

  return (
    <footer
      className="border-t py-10 w-full max-w-full overflow-x-hidden"
      style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)' }}
      role="contentinfo"
    >
      <div className="w-full max-w-screen-xl mx-auto px-4 md:px-6 lg:px-8 min-w-0">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <div>
            <Link
              to="/"
              className="flex items-center gap-2.5 mb-2 w-fit"
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)' }}
              >
                <Icon name="ShoppingBag" size={13} color="#FFFFFF" />
              </div>
              <span
                className="font-bold text-sm tracking-tight"
                style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}
              >
                [COMPANY_NAME]
              </span>
            </Link>
            <p className="text-xs max-w-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              Online catalogs and orders via WhatsApp for small businesses.
            </p>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className="text-xs transition-all duration-150 hover:opacity-80"
                style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)', textDecoration: 'none' }}
              >
                {link.label}
              </Link>
            ))}
            <span className="text-xs opacity-50" style={{ fontFamily: 'var(--font-caption)' }}>|</span>
            {APP_LINKS.map((link) => (
              <button
                key={link.path}
                type="button"
                onClick={() => navigate(link.path)}
                className="text-xs transition-all duration-150 hover:opacity-80 bg-transparent border-none cursor-pointer p-0"
                style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
              >
                {link.label}
              </button>
            ))}
          </div>

          <p className="text-xs flex-shrink-0" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            © {new Date().getFullYear()} [COMPANY_NAME]
          </p>
        </div>
      </div>
    </footer>
  );
}
