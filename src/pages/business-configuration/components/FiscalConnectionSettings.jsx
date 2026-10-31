import React, { useCallback, useEffect, useState } from 'react';
import Icon from 'components/AppIcon';
import {
  getFiscalConnection,
  connectFiscal,
  disconnectFiscal,
  describeFiscalError,
} from '../../../services/fiscalConnectionService';

/**
 * FiscalConnectionSettings — Configuración → Facturación electrónica.
 *
 * Conecta la cuenta DTECore de ESTE comercio. Cada comercio contrata y paga su propia
 * suscripción directamente con DTECore; Walinka no cobra ni comparte credenciales.
 *
 * Reglas de la interfaz:
 *  - La API key se escribe en un campo de contraseña, se envía una vez y se borra del estado
 *    en cuanto se guarda (o cuando falla). Nunca se muestra después de guardarla.
 *  - Guardar credenciales NO habilita emisión: la conexión queda pendiente de verificación.
 */
export default function FiscalConnectionSettings({ businessId }) {
  const [connection, setConnection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ issuerRut: '', apiKey: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState(null); // null | 'disconnect'
  const [disconnecting, setDisconnecting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setConnection(await getFiscalConnection(businessId));
    } catch (err) {
      setConnection(null);
      setLoadError(describeFiscalError(err));
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    if (businessId) load();
  }, [businessId, load]);

  const connected = connection?.connected === true;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError('');
    setNotice('');
    const payload = { issuerRut: form.issuerRut.trim(), apiKey: form.apiKey };
    // Se borra antes de la llamada: no queda en el estado aunque la petición falle.
    setForm({ issuerRut: payload.issuerRut, apiKey: '' });
    try {
      const next = await connectFiscal(businessId, payload);
      setConnection(next);
      setNotice(connected
        ? 'Credenciales reemplazadas. La cuenta queda pendiente de verificación.'
        : 'Cuenta conectada. Queda pendiente de verificación antes de emitir.');
    } catch (err) {
      setFormError(describeFiscalError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setFormError('');
    setNotice('');
    try {
      setConnection(await disconnectFiscal(businessId));
      setConfirm(null);
      setNotice('Cuenta desconectada. Las boletas no se pueden emitir hasta volver a conectarla.');
    } catch (err) {
      setFormError(describeFiscalError(err));
    } finally {
      setDisconnecting(false);
    }
  };

  const cardStyle = { borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' };
  const labelStyle = { color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' };
  const inputClass = 'w-full rounded-lg border px-3 py-2 text-sm';
  const inputStyle = {
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background)',
    color: 'var(--color-text-primary)',
  };

  if (loading) {
    return <p className="text-sm" style={labelStyle}>Cargando facturación electrónica…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border p-4 text-sm" style={cardStyle}>
        <p className="font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>
          Suscripción a DTECore
        </p>
        <p style={labelStyle}>
          La suscripción se contrata directamente con DTECore y la paga tu negocio. Walinka no cobra
          ni comparte suscripciones. Cada comercio tiene su propia API key.
        </p>
      </div>

      {loadError && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      <div className="rounded-xl border p-4" style={cardStyle}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              {connected ? 'Cuenta conectada' : 'Sin cuenta conectada'}
            </p>
            {connected && (
              <p className="text-xs mt-1" style={labelStyle}>RUT del emisor: {connection.issuerRut}</p>
            )}
          </div>
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{
              backgroundColor: connected ? 'rgba(22,163,74,0.12)' : 'rgba(100,116,139,0.12)',
              color: connected ? '#15803d' : '#475569',
            }}
          >
            {connected ? 'Conectada' : 'No conectada'}
          </span>
        </div>

        {connected && !connection.verified && (
          <p className="mt-3 text-xs" style={labelStyle}>
            Verificación pendiente. Walinka no emite boletas con esta cuenta hasta verificarla.
          </p>
        )}
        {connected && connection.verified && !connection.enabled && (
          <p className="mt-3 text-xs" style={labelStyle}>Cuenta verificada, emisión deshabilitada.</p>
        )}
      </div>

      {notice && (
        <div role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </div>
      )}
      {formError && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {formError}
        </div>
      )}

      <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4">
        <div>
          <label htmlFor="fiscal-rut" className="block text-sm font-medium mb-1" style={labelStyle}>
            RUT del emisor
          </label>
          <input
            id="fiscal-rut"
            name="fiscal-rut"
            type="text"
            inputMode="text"
            autoComplete="off"
            placeholder="12.345.678-5"
            value={form.issuerRut}
            onChange={(e) => setForm((f) => ({ ...f, issuerRut: e.target.value }))}
            className={inputClass}
            style={inputStyle}
            required
          />
        </div>
        <div>
          <label htmlFor="fiscal-api-key" className="block text-sm font-medium mb-1" style={labelStyle}>
            API key de DTECore
          </label>
          <input
            id="fiscal-api-key"
            name="fiscal-api-key"
            type="password"
            autoComplete="new-password"
            spellCheck={false}
            value={form.apiKey}
            onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
            className={inputClass}
            style={inputStyle}
            required
          />
          <p className="text-xs mt-1" style={labelStyle}>
            Se guarda cifrada y no vuelve a mostrarse. Para cambiarla, ingresa una nueva.
          </p>
        </div>
        <button
          type="submit"
          disabled={saving || !form.issuerRut || !form.apiKey}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: '#0284c7' }}
        >
          {saving ? 'Guardando…' : connected ? 'Reemplazar credenciales' : 'Conectar cuenta DTECore'}
        </button>
      </form>

      {connected && (
        <div className="border-t pt-5" style={{ borderColor: 'var(--color-border)' }}>
          {confirm !== 'disconnect' ? (
            <button
              type="button"
              onClick={() => setConfirm('disconnect')}
              className="text-sm font-semibold text-red-600"
            >
              Desconectar cuenta
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm" style={labelStyle}>
                Al desconectar se borra la API key guardada y se deshabilita la emisión de boletas.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white bg-red-600 disabled:opacity-50"
                >
                  {disconnecting ? 'Desconectando…' : 'Sí, desconectar'}
                </button>
                <button type="button" onClick={() => setConfirm(null)} className="text-sm" style={labelStyle}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-xs" style={labelStyle}>
        <Icon name="Info" size={12} /> La emisión de boletas estará disponible cuando DTECore esté verificado para este comercio.
      </p>
    </div>
  );
}
