import React, { useState, useEffect, useCallback } from 'react';
import Icon from 'components/AppIcon';
import {
  getMercadoPagoConnectionStatus,
  startMercadoPagoOAuth,
  disconnectMercadoPago,
  fetchMercadoPagoPointTerminals,
} from '../../../services/mpConnectionService';

// MP-POINT-0 — mensajes comprensibles por reason de la Edge Function
// (mp-point-terminals). Nunca se muestra el error crudo/técnico ni nada
// que mencione tokens.
const TERMINALS_ERROR_MESSAGES = {
  MP_NOT_CONNECTED: 'Este negocio no tiene Mercado Pago conectado.',
  MP_CONNECTION_EXPIRED: 'La conexión de Mercado Pago expiró. Reconéctala para poder buscar terminales.',
  MP_TOKEN_REJECTED: 'Mercado Pago rechazó la conexión (token vencido o inválido). Reconéctala e intenta de nuevo.',
  MP_FORBIDDEN: 'La cuenta de Mercado Pago conectada no tiene permiso para listar terminales.',
  MP_UNEXPECTED_ERROR: 'Mercado Pago devolvió un error inesperado. Intenta nuevamente en unos minutos.',
  MP_UNEXPECTED_RESPONSE: 'Mercado Pago devolvió una respuesta inesperada. Intenta nuevamente.',
  MP_REQUEST_FAILED: 'No se pudo contactar a Mercado Pago. Revisa tu conexión e intenta de nuevo.',
};
const TERMINALS_DEFAULT_ERROR = 'No se pudo buscar terminales. Intenta nuevamente.';

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

  // MP-POINT-0 — diagnóstico temporal de terminales Point. Puramente de
  // lectura: no permite cambiar operating_mode ni ninguna otra acción.
  const [terminalsSearched, setTerminalsSearched] = useState(false);
  const [terminalsLoading, setTerminalsLoading] = useState(false);
  const [terminals, setTerminals] = useState([]);
  const [terminalsError, setTerminalsError] = useState('');

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

  const handleSearchTerminals = async () => {
    setTerminalsLoading(true);
    setTerminalsError('');
    const { data, error: err } = await fetchMercadoPagoPointTerminals();
    setTerminalsLoading(false);
    setTerminalsSearched(true);
    if (err) {
      setTerminals([]);
      setTerminalsError(TERMINALS_ERROR_MESSAGES[err.reason] || TERMINALS_DEFAULT_ERROR);
      return;
    }
    setTerminals(data?.terminals ?? []);
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

      {/* MP-POINT-0 — sección temporal de diagnóstico. Solo lectura: no
          permite cambiar operating_mode ni ninguna otra acción sobre la
          terminal. Solo visible con Mercado Pago conectado (sin conexión,
          la Edge Function respondería MP_NOT_CONNECTED de todos modos). */}
      {isConnected && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-3.5 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                <Icon name="Tablet" size={17} color="#475569" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900">Terminales Point</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Diagnóstico: busca las terminales físicas registradas en esta cuenta de Mercado Pago.
                </p>
              </div>
            </div>
            <button
              onClick={handleSearchTerminals}
              disabled={terminalsLoading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold transition-colors disabled:opacity-60 shrink-0"
            >
              {terminalsLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                  Buscando…
                </>
              ) : (
                <>
                  <Icon name="Search" size={13} />
                  Buscar terminales
                </>
              )}
            </button>
          </div>

          {terminalsError && (
            <div className="px-4 py-3 flex items-start gap-2 bg-red-50 border-b border-red-100 text-xs text-red-700">
              <Icon name="AlertCircle" size={14} className="shrink-0 mt-0.5" />
              {terminalsError}
            </div>
          )}

          {terminalsSearched && !terminalsError && terminals.length === 0 && (
            <div className="px-4 py-4 text-xs text-gray-500">
              Esta cuenta de Mercado Pago no tiene terminales Point registradas.
            </div>
          )}

          {terminals.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400">
                    <th className="text-left font-semibold px-4 py-2">id</th>
                    <th className="text-left font-semibold px-4 py-2">pos_id</th>
                    <th className="text-left font-semibold px-4 py-2">store_id</th>
                    <th className="text-left font-semibold px-4 py-2">external_pos_id</th>
                    <th className="text-left font-semibold px-4 py-2">operating_mode</th>
                  </tr>
                </thead>
                <tbody>
                  {terminals.map((terminal, index) => (
                    <tr key={terminal.id || index} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-2 font-mono text-gray-700">{terminal.id ?? '—'}</td>
                      <td className="px-4 py-2 font-mono text-gray-700">{terminal.posId ?? '—'}</td>
                      <td className="px-4 py-2 font-mono text-gray-700">{terminal.storeId ?? '—'}</td>
                      <td className="px-4 py-2 font-mono text-gray-700">{terminal.externalPosId ?? '—'}</td>
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
                          {terminal.operatingMode ?? '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!terminalsSearched && (
            <div className="px-4 py-4 text-xs text-gray-400">
              Pulsa "Buscar terminales" para consultar Mercado Pago.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
