import React, { useState, useEffect, useCallback } from 'react';
import Icon from 'components/AppIcon';
import {
  getMercadoPagoConnectionStatus,
  startMercadoPagoOAuth,
  disconnectMercadoPago,
} from '../../../services/mpConnectionService';

/**
 * MercadoPagoConnect — MP-OAUTH-1.
 * Inspirado visualmente en CustomDomainSettings.jsx (misma tarjeta con
 * borde, header + badge de estado, acción con confirmación de dos pasos),
 * sin reutilizar su lógica de DNS/verificación (no aplica acá).
 *
 * Nunca muestra access_token, refresh_token, scope técnico ni ninguna
 * credencial de Walinka -- solo lo que devuelve
 * wa_get_my_mp_connection_status(): connected, status, providerUserId,
 * connectedAt, liveMode.
 */
export default function MercadoPagoConnect() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await getMercadoPagoConnectionStatus();
    if (err) {
      setError('No se pudo obtener el estado de la conexión con Mercado Pago.');
      setLoading(false);
      return;
    }
    setStatus(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleConnect = async () => {
    setError('');
    setConnecting(true);
    const { error: err } = await startMercadoPagoOAuth();
    // En éxito, startMercadoPagoOAuth navega el browser a Mercado Pago —
    // si volvemos a este punto con error, la navegación no llegó a ocurrir.
    if (err) {
      setConnecting(false);
      setError(
        err.reason === 'MP_COUNTRY_NOT_SUPPORTED'
          ? 'Mercado Pago aún no está disponible para tu país.'
          : 'No se pudo iniciar la conexión con Mercado Pago. Intenta nuevamente.',
      );
    }
  };

  const handleDisconnect = async () => {
    if (!confirmDisconnect) { setConfirmDisconnect(true); return; }
    setConfirmDisconnect(false);
    setError('');
    setDisconnecting(true);
    const { error: err } = await disconnectMercadoPago();
    setDisconnecting(false);
    if (err) {
      setError('No se pudo desconectar Mercado Pago. Intenta nuevamente.');
      return;
    }
    setStatus({ connected: false, status: 'disconnected' });
  };

  if (loading) {
    return (
      <div className="py-6 flex justify-center">
        <div className="w-5 h-5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isConnected = !!status?.connected;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3.5 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-sky-50 flex items-center justify-center shrink-0">
              <Icon name="Wallet" size={17} color="#0284c7" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900">Mercado Pago</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {isConnected
                  ? 'Tu cuenta de Mercado Pago está conectada.'
                  : 'Conecta tu propia cuenta de Mercado Pago.'}
              </p>
            </div>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
              isConnected
                ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                : 'text-slate-600 bg-slate-50 border-slate-200'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isConnected ? 'bg-emerald-500' : 'bg-slate-400'}`} />
            {isConnected ? 'Conectado' : 'No conectado'}
          </span>
        </div>

        {!isConnected && (
          <div className="px-4 py-4">
            <p className="text-xs text-gray-500 leading-snug mb-4">
              Conecta tu cuenta de Mercado Pago desde aquí. Walinka nunca ve ni guarda tu contraseña
              de Mercado Pago -- la autorización ocurre directamente en el sitio de Mercado Pago.
            </p>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold transition-colors disabled:opacity-60"
            >
              {connecting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                  Conectando…
                </>
              ) : (
                <>
                  <Icon name="Link" size={13} />
                  Conectar Mercado Pago
                </>
              )}
            </button>
          </div>
        )}

        {isConnected && (
          <>
            <div className="px-4 py-3 border-b border-gray-50 space-y-1">
              {status?.providerUserId && (
                <p className="text-xs text-gray-500">
                  Cuenta: <span className="font-mono text-gray-700">{status.providerUserId}</span>
                </p>
              )}
              {status?.connectedAt && (
                <p className="text-xs text-gray-400">
                  Conectado el {new Date(status.connectedAt).toLocaleDateString('es-CL')}
                </p>
              )}
            </div>
            <div className="px-4 py-3 flex flex-wrap gap-2">
              {confirmDisconnect ? (
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-xs text-red-700 font-semibold">¿Confirmar desconexión?</span>
                  <button
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors disabled:opacity-60"
                  >
                    {disconnecting ? (
                      <div className="w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                    ) : (
                      'Sí, desconectar'
                    )}
                  </button>
                  <button
                    onClick={() => setConfirmDisconnect(false)}
                    className="px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-semibold transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold transition-colors disabled:opacity-60 ml-auto"
                >
                  <Icon name="Unlink" size={13} />
                  Desconectar
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <Icon name="AlertCircle" size={15} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}
    </div>
  );
}
