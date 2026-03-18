import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCountry } from '../../contexts/CountryContext';
import { COUNTRY_CODES, getCountryConfig } from '../../config/countryConfig';
import Icon from '../../components/AppIcon';

/**
 * Pantalla inicial en go.ventalink.app: selector de país.
 * Al elegir y continuar se guarda la selección y redirige a la app.
 */
export default function CountrySelectPage() {
  const navigate = useNavigate();
  const { setCountry, isSelectable } = useCountry();
  const [selected, setSelected] = React.useState(null);

  const handleContinue = () => {
    if (!selected || !COUNTRY_CODES.includes(selected)) return;
    setCountry(selected);
    navigate('/dashboard', { replace: true });
  };

  if (!isSelectable) {
    navigate('/dashboard', { replace: true });
    return null;
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{
        background: 'linear-gradient(135deg, var(--color-background) 0%, var(--color-muted) 100%)',
        fontFamily: 'var(--font-body)',
      }}
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>
            Elige tu país
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
            Ajustaremos moneda, WhatsApp y opciones de pago según tu ubicación.
          </p>
        </div>

        <div className="grid gap-2 mb-8">
          {COUNTRY_CODES.map((code) => {
            const config = getCountryConfig(code);
            const isActive = selected === code;
            return (
              <button
                key={code}
                type="button"
                onClick={() => setSelected(code)}
                className="flex items-center gap-3 w-full p-4 rounded-xl border-2 text-left transition-all"
                style={{
                  borderColor: isActive ? 'var(--color-primary)' : 'var(--color-border)',
                  backgroundColor: isActive ? 'rgba(124, 58, 237, 0.08)' : 'var(--color-background)',
                  color: 'var(--color-foreground)',
                }}
              >
                <span className="text-2xl">{config.flag}</span>
                <div className="flex-1 min-w-0">
                  <span className="font-semibold block">{config.name}</span>
                  <span className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                    {config.phonePrefix} · {config.currency} {config.symbol}
                  </span>
                </div>
                {isActive && (
                  <Icon name="Check" size={20} style={{ color: 'var(--color-primary)' }} />
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleContinue}
          disabled={!selected}
          className="w-full py-3 px-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}
        >
          Continuar a la app
          <Icon name="ArrowRight" size={18} color="white" />
        </button>
      </div>
    </div>
  );
}
