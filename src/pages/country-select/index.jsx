import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCountry } from '../../contexts/CountryContext';
import { useAuth } from '../../contexts/AuthContext';
import { COUNTRY_CODES, getCountryConfig, getManualMarketChoice, getStoredCountryCode } from '../../config/countryConfig';
import Icon from '../../components/AppIcon';
import { fetchSuggestCountryFromIp } from '../../utils/suggestCountryFromIp';

export default function CountrySelectPage() {
  const navigate = useNavigate();
  const { setCountry, isSelectable } = useCountry();
  const { user, persistOnboardingCountry } = useAuth();
  const [selected, setSelected] = React.useState(() => getStoredCountryCode());
  const [geoLoading, setGeoLoading] = React.useState(false);
  const [geoHint, setGeoHint] = React.useState(null);
  const allowManualSelection = isSelectable || typeof window !== 'undefined';

  React.useEffect(() => {
    if (!allowManualSelection) return;
    if (getStoredCountryCode()) return;
    if (getManualMarketChoice() === 'GLOBAL') {
      setGeoLoading(false);
      return;
    }

    let cancelled = false;
    setGeoLoading(true);

    fetchSuggestCountryFromIp()
      .then((result) => {
        if (cancelled) return;
        setGeoLoading(false);
        if (result?.code && COUNTRY_CODES.includes(result.code)) {
          setGeoHint(result);
        }
      })
      .catch(() => {
        if (!cancelled) setGeoLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [allowManualSelection]);

  const handleContinue = async () => {
    if (!selected || !COUNTRY_CODES.includes(selected)) return;

    setCountry(selected);
    if (user) {
      await persistOnboardingCountry(selected);
    }
    navigate('/business-registration', { replace: true });
  };

  const geoCountryName = geoHint?.code ? getCountryConfig(geoHint.code).name : '';
  const selectedConfig = selected ? getCountryConfig(selected) : null;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{
        background: 'linear-gradient(135deg, var(--color-background) 0%, var(--color-muted) 100%)',
        fontFamily: 'var(--font-body)',
      }}
    >
      <div className="w-full max-w-md">
        <p className="text-center mb-4">
          <Link
            to="/"
            className="text-sm font-medium hover:underline"
            style={{ color: 'var(--color-primary)' }}
          >
            Volver al inicio
          </Link>
        </p>

        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>
            Elige tu pais
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
            Ajustaremos moneda, WhatsApp y opciones de pago segun tu ubicacion desde el primer paso.
          </p>
          {!isSelectable && (
            <p className="text-xs mt-2" style={{ color: 'var(--color-muted-foreground)' }}>
              Estas en un entorno de preview, asi que habilitamos la seleccion manual para probar el onboarding completo.
            </p>
          )}
          {selectedConfig && (
            <p className="text-xs mt-2" style={{ color: 'var(--color-muted-foreground)' }}>
              Continuaras con <strong>{selectedConfig.currency}</strong> y prefijo <strong>{selectedConfig.phonePrefix}</strong>.
            </p>
          )}
        </div>

        {geoLoading && (
          <p className="text-sm text-center mb-4" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            Detectando region...
          </p>
        )}

        {!geoLoading && geoHint && !geoHint.approximate && (
          <div
            className="mb-4 p-4 rounded-xl border text-left"
            style={{
              backgroundColor: 'rgba(124, 58, 237, 0.06)',
              borderColor: 'var(--color-border)',
            }}
            role="status"
          >
            <p className="text-sm font-medium m-0 mb-1" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
              Detectamos tu pais: {geoCountryName}
            </p>
            <p className="text-xs m-0" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              Si no coincide, puedes elegir otro antes de seguir.
            </p>
          </div>
        )}

        {!geoLoading && geoHint?.approximate && (
          <div
            className="mb-4 p-4 rounded-xl border text-left"
            style={{
              backgroundColor: 'rgba(124, 58, 237, 0.06)',
              borderColor: 'var(--color-border)',
            }}
            role="status"
          >
            <p className="text-sm font-medium m-0 mb-1" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
              Tu region sugiere configuracion internacional ({geoCountryName} · USD)
            </p>
            <p className="text-xs m-0" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              Confirma el pais correcto para configurar bien moneda, WhatsApp y cobros.
            </p>
          </div>
        )}

        <div className="grid gap-2 mb-6">
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
          Continuar al registro
          <Icon name="ArrowRight" size={18} color="white" />
        </button>
      </div>
    </div>
  );
}
