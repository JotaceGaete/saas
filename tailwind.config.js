/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    './public/index.html',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--color-background)',
        foreground: 'var(--color-foreground)',

        card: {
          DEFAULT: 'var(--color-card)',
          foreground: 'var(--color-card-foreground)',
        },

        popover: {
          DEFAULT: 'var(--color-popover)',
          foreground: 'var(--color-popover-foreground)',
        },

        primary: {
          DEFAULT: 'var(--color-primary)',
          hover: 'var(--color-primary-hover)',
          foreground: 'var(--color-primary-foreground)',
        },

        secondary: {
          DEFAULT: 'var(--color-secondary)',
          foreground: 'var(--color-secondary-foreground)',
        },

        accent: {
          DEFAULT: 'var(--color-accent)',
          foreground: 'var(--color-accent-foreground)',
        },

        muted: {
          DEFAULT: 'var(--color-muted)',
          foreground: 'var(--color-muted-foreground)',
        },

        destructive: {
          DEFAULT: 'var(--color-destructive)',
          foreground: 'var(--color-destructive-foreground)',
        },

        success: {
          DEFAULT: 'var(--color-success)',
          foreground: 'var(--color-success-foreground)',
        },

        warning: {
          DEFAULT: 'var(--color-warning)',
          foreground: 'var(--color-warning-foreground)',
        },

        error: {
          DEFAULT: 'var(--color-error)',
          foreground: 'var(--color-error-foreground)',
        },

        border: 'var(--color-border)',
        input: 'var(--color-input)',
        ring: 'var(--color-ring)',
      },

      fontFamily: {
        heading: ['Plus Jakarta Sans', 'Manrope', 'system-ui', 'sans-serif'],
        body: ['DM Sans', 'system-ui', 'sans-serif'],
        caption: ['DM Sans', 'system-ui', 'sans-serif'],
        data: ['JetBrains Mono', 'monospace'],
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        /** Catálogo público: ver `src/utils/catalogTypography.js` */
        catalog: [
          'Inter',
          'Manrope',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
      },

      fontSize: {
        'display': ['3.5rem', { lineHeight: '1.05', letterSpacing: '-0.04em', fontWeight: '800' }],
        'h1': ['2.75rem', { lineHeight: '1.1', letterSpacing: '-0.03em' }],
        'h2': ['2.25rem', { lineHeight: '1.15', letterSpacing: '-0.025em' }],
        'h3': ['1.625rem', { lineHeight: '1.25', letterSpacing: '-0.02em' }],
        'h4': ['1.25rem', { lineHeight: '1.35', letterSpacing: '-0.015em' }],
        'h5': ['1.125rem', { lineHeight: '1.45' }],
        'body-lg': ['1.0625rem', { lineHeight: '1.65' }],
        'body': ['0.9375rem', { lineHeight: '1.6' }],
        'body-sm': ['0.875rem', { lineHeight: '1.55' }],
        'caption': ['0.8125rem', { lineHeight: '1.5' }],
        'xs': ['0.75rem', { lineHeight: '1.4' }],
        'data': ['0.875rem', { lineHeight: '1.4' }],
      },

      spacing: {
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '7': '28px',
        '8': '32px',
        '9': '36px',
        '10': '40px',
        '11': '44px',
        '12': '48px',
        '14': '56px',
        '16': '64px',
        '20': '80px',
        '24': '96px',
        '28': '112px',
        '32': '128px',
        'sidebar': '240px',
        'sidebar-collapsed': '64px',
      },

      borderRadius: {
        'xs': '4px',
        'sm': '6px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
        '2xl': '20px',
        '3xl': '24px',
        DEFAULT: '8px',
      },

      boxShadow: {
        'xs': '0 1px 2px rgba(15, 23, 42, 0.04)',
        'sm': '0 1px 3px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04)',
        'md': '0 4px 8px rgba(15, 23, 42, 0.06), 0 2px 4px rgba(15, 23, 42, 0.04)',
        'lg': '0 10px 20px rgba(15, 23, 42, 0.08), 0 4px 8px rgba(15, 23, 42, 0.04)',
        'xl': '0 20px 40px rgba(15, 23, 42, 0.10), 0 8px 16px rgba(15, 23, 42, 0.06)',
        '2xl': '0 32px 64px rgba(15, 23, 42, 0.12)',
        'violet': '0 4px 20px rgba(124, 58, 237, 0.25)',
        'violet-lg': '0 8px 32px rgba(124, 58, 237, 0.30)',
        'inner-sm': 'inset 0 1px 2px rgba(15, 23, 42, 0.06)',
      },

      transitionTimingFunction: {
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'bounce': 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      },

      transitionDuration: {
        DEFAULT: '200ms',
        'fast': '120ms',
        'slow': '300ms',
      },

      zIndex: {
        'navigation': '100',
        'modal': '200',
        'toast': '300',
      },

      width: {
        'sidebar': '240px',
        'sidebar-collapsed': '64px',
      },

      maxWidth: {
        'prose': '72ch',
        'screen-xs': '480px',
      },

      minHeight: {
        'touch': '44px',
        'touch-lg': '52px',
      },

      minWidth: {
        'touch': '44px',
      },

      backgroundImage: {
        'violet-gradient': 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
        'violet-gradient-soft': 'linear-gradient(135deg, rgba(124,58,237,0.08) 0%, rgba(109,40,217,0.04) 100%)',
        'hero-gradient': 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(124,58,237,0.1) 0%, transparent 70%)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('@tailwindcss/forms'),
    require('tailwindcss-animate'),
  ],
};