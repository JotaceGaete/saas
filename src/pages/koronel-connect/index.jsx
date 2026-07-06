import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';
import PremiumLoader from 'components/ui/PremiumLoader';
import { useAuth } from '../../contexts/AuthContext';
import { linkKoronelBusiness } from '../../services/waBusinessService';
import { getKoronelHandoff, clearKoronelHandoff } from '../../utils/koronelHandoff';

/**
 * Fase 2 Koronel↔Walinka: cuando un usuario autenticado que ya tiene un
 * wa_businesses llega con un handoff de Koronel pendiente, esta pantalla le
 * permite conectar ese negocio existente con la RPC `request_business_walinka_link`.
 */
export default function KoronelConnect() {
  const navigate = useNavigate();
  const { business, businessLoading } = useAuth();
  const [handoff] = useState(() => getKoronelHandoff());
  const [status, setStatus] = useState('idle'); // idle | linking | success | error

  useEffect(() => {
    if (businessLoading) return;
    if (!handoff || !business) {
      navigate(business ? '/dashboard' : '/business-registration', { replace: true });
    }
  }, [handoff, business, businessLoading, navigate]);

  if (businessLoading || !handoff || !business) {
    return <PremiumLoader fullScreen text="Preparando tu conexión con Koronel..." />;
  }

  const handleConnect = async () => {
    setStatus('linking');
    try {
      const { error } = await linkKoronelBusiness({
        koronelBusinessId: handoff.koronelBusinessId,
        walinkaBusinessId: business.id,
      });
      setStatus(error ? 'error' : 'success');
    } catch {
      setStatus('error');
    } finally {
      clearKoronelHandoff();
    }
  };

  const handleSkip = () => {
    clearKoronelHandoff();
    navigate('/dashboard', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="w-full max-w-md text-center">
        {status === 'idle' || status === 'linking' ? (
          <>
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: 'rgba(124,58,237,0.1)' }}
            >
              <Icon name="Link2" size={26} color="var(--color-primary)" />
            </div>
            <h1 className="text-lg font-bold mb-2" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
              Conectar tu catálogo con Koronel
            </h1>
            <p className="text-sm mb-6" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              {handoff?.name
                ? `Vienes desde el negocio "${handoff.name}" en Koronel. `
                : 'Vienes desde Koronel. '}
              Podemos conectar tu catálogo <strong>{business?.name}</strong> con ese negocio para que aparezca su enlace en el directorio.
            </p>
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleConnect}
                disabled={status === 'linking'}
                className="w-full h-12 rounded-lg font-semibold text-sm"
                style={{
                  backgroundColor: status === 'linking' ? 'rgba(124,58,237,0.7)' : 'var(--color-primary)',
                  color: '#fff',
                  fontFamily: 'var(--font-caption)',
                  cursor: status === 'linking' ? 'not-allowed' : 'pointer',
                }}
              >
                {status === 'linking' ? 'Conectando...' : 'Conectar catálogo'}
              </button>
              <button
                type="button"
                onClick={handleSkip}
                disabled={status === 'linking'}
                className="w-full h-12 rounded-lg font-semibold text-sm border"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
              >
                Ahora no
              </button>
            </div>
          </>
        ) : (
          <>
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: status === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' }}
            >
              <Icon
                name={status === 'success' ? 'CheckCircle2' : 'AlertCircle'}
                size={26}
                color={status === 'success' ? 'var(--color-success, #10b981)' : 'var(--color-error)'}
              />
            </div>
            <h1 className="text-lg font-bold mb-2" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
              {status === 'success' ? 'Catálogo conectado con Koronel' : 'No se pudo conectar con Koronel'}
            </h1>
            <p className="text-sm mb-6" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              {status === 'success'
                ? 'Tu negocio en Koronel ya muestra este catálogo.'
                : 'Puedes continuar igual — inténtalo de nuevo más tarde desde Koronel.'}
            </p>
            <button
              type="button"
              onClick={() => navigate('/dashboard', { replace: true })}
              className="w-full h-12 rounded-lg font-semibold text-sm"
              style={{ backgroundColor: 'var(--color-primary)', color: '#fff', fontFamily: 'var(--font-caption)' }}
            >
              Ir al dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
}
