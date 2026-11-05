import React, { useCallback, useEffect, useState } from 'react';
import Icon from 'components/AppIcon';
import {
  getFiscalConnection,
  submitFiscalApplication,
  setFiscalTaxDefault,
  disconnectFiscal,
  confirmFiscalRut,
  describeFiscalError,
} from '../../../services/fiscalConnectionService';
import { TAX_TREATMENT, TAX_TREATMENT_LABELS } from '../../../lib/fiscal/taxTreatment';

/**
 * FiscalConnectionSettings — Configuración → Facturación.
 *
 * Alta simple, en un solo formulario: RUT, API key de DTE Core y resolución SII (+ sucursal
 * opcional) → «Enviar a revisión». Walinka revisa cada alta y la aprueba; recién entonces el
 * comercio puede emitir boletas.
 *
 * Reglas de la interfaz:
 *  - La API key se escribe en un campo de contraseña, se envía una vez y se borra del estado
 *    antes de la llamada. Nunca se muestra después de guardarla.
 *  - Enviar nunca habilita la emisión: solo la aprobación de Walinka lo hace.
 *  - Cambiar la API key o los datos vuelve la solicitud a revisión.
 */

const STEPS = [
  { key: 'connect', label: 'Conecta tu cuenta' },
  { key: 'review', label: 'Walinka revisa' },
  { key: 'ready', label: 'Listo para emitir' },
];

function stepIndex(status) {
  if (status === 'approved') return 2;
  if (status === 'pending_review') return 1;
  return 0;
}

const EMPTY_FORM = { issuerRut: '', apiKey: '', resolucionNumero: '', resolucionFecha: '', sucursalNombre: '', sucursalCodigo: '' };

function formFrom(connection) {
  if (!connection) return EMPTY_FORM;
  return {
    issuerRut: connection.issuerRut ?? '',
    apiKey: '',
    resolucionNumero: connection.resolucionNumero != null ? String(connection.resolucionNumero) : '',
    resolucionFecha: connection.resolucionFecha ?? '',
    sucursalNombre: connection.sucursalNombre ?? '',
    sucursalCodigo: connection.sucursalCodigo ?? '',
  };
}

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function FiscalConnectionSettings({ businessId }) {
  const [connection, setConnection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(false);
  const [showSucursal, setShowSucursal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState(null); // null | 'disconnect'
  const [disconnecting, setDisconnecting] = useState(false);
  const [taxSaving, setTaxSaving] = useState(false);
  const [confirmingRut, setConfirmingRut] = useState(false);
  const [rutAck, setRutAck] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const next = await getFiscalConnection(businessId);
      setConnection(next);
      setForm(formFrom(next));
      setShowSucursal(Boolean(next?.sucursalNombre || next?.sucursalCodigo));
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
  const status = connection?.reviewStatus || 'draft';
  // El formulario se muestra para completar, corregir tras un rechazo o suspensión, o al editar.
  const formOpen = editing || !connected || ['draft', 'rejected', 'suspended'].includes(status);
  const keySaved = connected && form.issuerRut.replace(/[.\s]/g, '').toUpperCase() === String(connection?.issuerRut ?? '');
  const canSubmit = form.issuerRut.trim() && form.resolucionNumero.trim() && form.resolucionFecha
    && (form.apiKey.trim() || keySaved);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving || !canSubmit) return;
    setSaving(true);
    setFormError('');
    setNotice('');
    const payload = {
      ...form,
      issuerRut: form.issuerRut.trim(),
      sucursalNombre: showSucursal ? form.sucursalNombre : '',
      sucursalCodigo: showSucursal ? form.sucursalCodigo : '',
    };
    // La clave se borra del estado antes de la llamada, aunque la petición falle.
    setForm((f) => ({ ...f, apiKey: '' }));
    try {
      const next = await submitFiscalApplication(businessId, payload);
      setConnection(next);
      setForm(formFrom(next));
      setEditing(false);
      setNotice('Solicitud enviada. Walinka la revisará y te avisaremos aquí cuando puedas emitir boletas.');
    } catch (err) {
      setFormError(describeFiscalError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleTaxDefault = async (value) => {
    if (taxSaving) return;
    setTaxSaving(true);
    setFormError('');
    setNotice('');
    try {
      const next = await setFiscalTaxDefault(businessId, value || null);
      setConnection(next);
      setNotice(value ? 'Listo: el IVA por defecto quedó guardado.' : 'Ahora el IVA se define en cada producto.');
    } catch (err) {
      setFormError(describeFiscalError(err));
    } finally {
      setTaxSaving(false);
    }
  };

  // El propietario confirma expresamente el RUT mostrado (antes de la primera boleta y cada vez que
  // cambian la API key o el RUT). Se envía el RUT que se ve: si cambió entretanto, el servidor lo rechaza.
  const handleConfirmRut = async () => {
    setConfirmingRut(true);
    setFormError('');
    setNotice('');
    try {
      const next = await confirmFiscalRut(businessId, connection?.issuerRut);
      setConnection((prev) => ({ ...next, allowed: prev?.allowed }));
      setRutAck(false);
      setNotice('RUT confirmado. Ya puedes emitir boletas cuando Walinka habilite tu cuenta.');
    } catch (err) {
      setFormError(describeFiscalError(err));
    } finally {
      setConfirmingRut(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setFormError('');
    setNotice('');
    try {
      const next = await disconnectFiscal(businessId);
      setConnection(next);
      setForm(formFrom(next));
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
  const inputClass = 'w-full rounded-lg border px-3 py-2.5 text-sm min-h-[44px]';
  const inputStyle = {
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background)',
    color: 'var(--color-text-primary)',
  };

  if (loading) {
    return <p className="text-sm" style={labelStyle}>Cargando facturación electrónica…</p>;
  }

  const current = stepIndex(status);

  // Alcance actual: solo las empresas autorizadas por Walinka en el servidor. El servidor rechaza
  // igual cualquier intento de otro negocio; aquí solo se evita mostrar un formulario inútil.
  if (connection?.allowed === false) {
    return (
      <div className="rounded-xl border p-4 text-sm" style={cardStyle} data-testid="fiscal-not-available">
        <p style={{ color: 'var(--color-text-primary)' }}>
          La boleta electrónica todavía no está disponible para este negocio. Tus ventas siguen
          imprimiendo el comprobante interno de siempre.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="fiscal-onboarding">
      {/* Confirmación del RUT (migración H): antes de la primera boleta con esta API key. */}
      {connection?.connected && (
        <div className="rounded-xl border p-3 text-sm space-y-2" style={cardStyle} data-testid="fiscal-rut-confirmation"
             data-confirmed={connection.rutConfirmed ? 'true' : 'false'}>
          {connection.rutConfirmed ? (
            <p style={{ color: 'var(--color-text-primary)' }}>
              RUT emisor confirmado: <strong data-testid="fiscal-rut-confirmed">{connection.issuerRut}</strong>
            </p>
          ) : (
            <>
              <p style={{ color: 'var(--color-text-primary)' }}>
                Las boletas se emitirán con el RUT{' '}
                <strong className="text-base" data-testid="fiscal-rut-to-confirm">{connection.issuerRut}</strong>.
                {' '}Revisa que sea el de tu empresa y que la API key sea de su cuenta en DTE Core: Walinka no
                puede comprobarlo por ti. Hasta confirmarlo, tus ventas imprimen el comprobante interno de siempre.
              </p>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={rutAck} onChange={(e) => setRutAck(e.target.checked)}
                       data-testid="fiscal-rut-ack" className="mt-1" />
                <span>Confirmo que {connection.issuerRut} es el RUT de mi empresa y que la API key ingresada es de esa cuenta.</span>
              </label>
              <button type="button" onClick={handleConfirmRut} disabled={!rutAck || confirmingRut}
                      className="rounded-lg border px-3 py-2 text-sm min-h-[44px]" style={cardStyle}
                      data-testid="fiscal-rut-confirm">
                {confirmingRut ? 'Confirmando…' : 'Confirmar RUT'}
              </button>
            </>
          )}
        </div>
      )}
      {/* Progreso */}
      <ol className="grid grid-cols-3 gap-2" aria-label="Pasos para emitir boletas">
        {STEPS.map((s, i) => {
          const done = i < current || (i === current && status === 'approved');
          const active = i === current && status !== 'approved';
          return (
            <li key={s.key} className="flex flex-col items-center gap-1 text-center" aria-current={active ? 'step' : undefined}>
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
                style={{
                  backgroundColor: done ? '#16a34a' : active ? '#0284c7' : 'rgba(100,116,139,0.15)',
                  color: done || active ? '#fff' : '#475569',
                }}
              >
                {done ? <Icon name="Check" size={14} color="#fff" /> : i + 1}
              </span>
              <span className="text-[11px] font-semibold leading-tight" style={{ color: 'var(--color-text-primary)' }}>{s.label}</span>
            </li>
          );
        })}
      </ol>

      {loadError && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{loadError}</div>
      )}

      {/* Estado de la solicitud */}
      {status === 'pending_review' && (
        <div role="status" data-testid="fiscal-status-pending" className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          <p className="font-semibold">Tu solicitud está en revisión</p>
          <p className="mt-1">
            Walinka está revisando tu cuenta DTE Core{connection?.submittedAt ? ` (enviada el ${formatDate(connection.submittedAt)})` : ''}.
            Mientras tanto tus ventas siguen imprimiendo el ticket de siempre.
          </p>
        </div>
      )}
      {status === 'approved' && (
        <div role="status" data-testid="fiscal-status-approved" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">¡Listo! Tu negocio puede emitir boletas electrónicas</p>
          <p className="mt-1">Las ventas pagadas en efectivo o con Point emitirán su boleta al confirmar el cobro.</p>
        </div>
      )}
      {status === 'rejected' && (
        <div role="alert" data-testid="fiscal-status-rejected" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">Walinka no pudo aprobar tu solicitud</p>
          {connection?.reviewNote && <p className="mt-1">Motivo: {connection.reviewNote}</p>}
          <p className="mt-1">Corrige los datos y vuelve a enviarla.</p>
        </div>
      )}
      {status === 'suspended' && (
        <div role="alert" data-testid="fiscal-status-suspended" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">La emisión de boletas está suspendida</p>
          {connection?.reviewNote && <p className="mt-1">Motivo: {connection.reviewNote}</p>}
          <p className="mt-1">Revisa los datos y vuelve a enviar la solicitud, o escríbenos.</p>
        </div>
      )}

      {notice && (
        <div role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>
      )}
      {formError && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{formError}</div>
      )}

      {/* Resumen (en revisión o aprobada) */}
      {!formOpen && (
        <div className="rounded-xl border p-4 text-sm space-y-1.5" style={cardStyle} data-testid="fiscal-summary">
          <p><span style={labelStyle}>RUT del emisor:</span> <strong>{connection.issuerRut}</strong></p>
          <p><span style={labelStyle}>API key de DTE Core:</span> guardada de forma segura</p>
          <p>
            <span style={labelStyle}>Resolución SII:</span> N° {connection.resolucionNumero}
            {connection.resolucionFecha ? ` del ${formatDate(connection.resolucionFecha)}` : ''}
          </p>
          {(connection.sucursalNombre || connection.sucursalCodigo) && (
            <p><span style={labelStyle}>Sucursal:</span> {connection.sucursalNombre || '—'}{connection.sucursalCodigo ? ` (código ${connection.sucursalCodigo})` : ''}</p>
          )}
          <button
            type="button"
            onClick={() => { setEditing(true); setNotice(''); }}
            className="mt-2 min-h-[44px] rounded-lg border px-3 text-sm font-semibold"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
          >
            Cambiar datos
          </button>
          {status === 'approved' && (
            <p className="text-xs" style={labelStyle}>Si cambias los datos, Walinka volverá a revisarlos y la emisión se pausará mientras tanto.</p>
          )}
        </div>
      )}

      {/* Formulario único */}
      {formOpen && (
        <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4" data-testid="fiscal-form">
          <div className="rounded-xl border p-3 text-xs" style={{ ...cardStyle, ...labelStyle }}>
            Necesitas una cuenta de <strong>DTE Core</strong> a nombre de tu negocio (la contratas y pagas directamente con DTE Core)
            y estar autorizado por el SII como emisor de boletas electrónicas.
          </div>

          <div>
            <label htmlFor="fiscal-rut" className="block text-sm font-medium mb-1" style={labelStyle}>RUT de tu negocio</label>
            <input id="fiscal-rut" type="text" autoComplete="off" placeholder="12.345.678-5"
              value={form.issuerRut} onChange={update('issuerRut')} className={inputClass} style={inputStyle} required />
          </div>

          <div>
            <label htmlFor="fiscal-api-key" className="block text-sm font-medium mb-1" style={labelStyle}>API key de DTE Core</label>
            <input id="fiscal-api-key" type="password" autoComplete="new-password" spellCheck={false}
              placeholder={keySaved ? 'Ya está guardada · déjala vacía para mantenerla' : 'Pega aquí tu API key'}
              value={form.apiKey} onChange={update('apiKey')} className={inputClass} style={inputStyle}
              required={!keySaved} />
            <p className="text-xs mt-1" style={labelStyle}>
              La encuentras en tu cuenta de DTE Core. Se guarda cifrada y nadie, ni Walinka, puede volver a verla.
            </p>
          </div>

          <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <legend className="mb-1 text-sm font-medium" style={labelStyle}>Resolución del SII</legend>
            <div>
              <label htmlFor="fiscal-res-numero" className="block text-xs mb-1" style={labelStyle}>Número</label>
              <input id="fiscal-res-numero" type="text" inputMode="numeric" placeholder="80"
                value={form.resolucionNumero} onChange={(e) => setForm((f) => ({ ...f, resolucionNumero: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                className={inputClass} style={inputStyle} required />
            </div>
            <div>
              <label htmlFor="fiscal-res-fecha" className="block text-xs mb-1" style={labelStyle}>Fecha</label>
              <input id="fiscal-res-fecha" type="date" min="2003-01-01" max={new Date().toISOString().slice(0, 10)}
                value={form.resolucionFecha} onChange={update('resolucionFecha')} className={inputClass} style={inputStyle} required />
            </div>
            <p className="text-xs sm:col-span-2" style={labelStyle}>
              Aparecen en la autorización del SII como emisor electrónico. Se imprimen en cada boleta.
            </p>
          </fieldset>

          {!showSucursal ? (
            <button type="button" onClick={() => setShowSucursal(true)} className="text-sm font-semibold" style={{ color: '#0284c7' }}>
              + Mi negocio tiene más de un local (sucursal)
            </button>
          ) : (
            <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <legend className="mb-1 text-sm font-medium" style={labelStyle}>Sucursal (opcional)</legend>
              <div>
                <label htmlFor="fiscal-suc-nombre" className="block text-xs mb-1" style={labelStyle}>Nombre</label>
                <input id="fiscal-suc-nombre" type="text" maxLength={80} placeholder="Casa Matriz"
                  value={form.sucursalNombre} onChange={update('sucursalNombre')} className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label htmlFor="fiscal-suc-codigo" className="block text-xs mb-1" style={labelStyle}>Código SII</label>
                <input id="fiscal-suc-codigo" type="text" inputMode="numeric" placeholder="1"
                  value={form.sucursalCodigo} onChange={(e) => setForm((f) => ({ ...f, sucursalCodigo: e.target.value.replace(/\D/g, '').slice(0, 9) }))}
                  className={inputClass} style={inputStyle} />
              </div>
            </fieldset>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="submit" disabled={saving || !canSubmit}
              className="min-h-[48px] rounded-lg px-5 text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: '#0284c7' }}>
              {saving ? 'Enviando…' : 'Enviar a revisión'}
            </button>
            {editing && (
              <button type="button" onClick={() => { setEditing(false); setForm(formFrom(connection)); setFormError(''); }}
                className="min-h-[48px] rounded-lg px-4 text-sm" style={labelStyle}>
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}

      {connected && (
        <div className="rounded-xl border p-4 space-y-2" style={cardStyle} data-testid="fiscal-tax-default">
          <label htmlFor="fiscal-tax-default" className="block text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            IVA de tus productos
          </label>
          <select
            id="fiscal-tax-default"
            value={connection?.defaultTaxCategory || ''}
            disabled={taxSaving}
            onChange={(e) => handleTaxDefault(e.target.value)}
            className={inputClass}
            style={inputStyle}
          >
            <option value={TAX_TREATMENT.AFECTO}>Todo lo que vendo está {TAX_TREATMENT_LABELS[TAX_TREATMENT.AFECTO].toLowerCase()} — lo habitual</option>
            <option value="">Lo defino en cada producto</option>
            <option value={TAX_TREATMENT.EXENTO}>Todo lo que vendo está exento de IVA</option>
            <option value={TAX_TREATMENT.NO_AFECTO}>Todo lo que vendo es no afecto a IVA</option>
          </select>
          <p className="text-xs" style={labelStyle}>
            Los precios incluyen IVA. Se aplica a los productos sin un tratamiento propio y a los artículos manuales del TPV;
            si un producto es distinto, cámbialo en su ficha. No se elige en cada venta.
          </p>
          {!connection?.defaultTaxCategory && (
            <p className="text-xs font-semibold text-amber-700">
              Sin IVA por defecto, solo emiten boleta las ventas cuyos productos tengan su tratamiento definido.
            </p>
          )}
          <p className="text-xs" style={labelStyle}>
            Por ahora Walinka emite boletas solo con productos afectos. Las ventas con productos exentos o no afectos
            imprimen el comprobante interno y debes emitir su documento tributario por otro medio.
          </p>
        </div>
      )}

      {connected && (
        <div className="border-t pt-5" style={{ borderColor: 'var(--color-border)' }}>
          {confirm !== 'disconnect' ? (
            <button type="button" onClick={() => setConfirm('disconnect')} className="text-sm font-semibold text-red-600">
              Desconectar cuenta DTE Core
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm" style={labelStyle}>
                Al desconectar se borra la API key guardada y se deshabilita la emisión de boletas.
              </p>
              <div className="flex gap-3">
                <button type="button" onClick={handleDisconnect} disabled={disconnecting}
                  className="min-h-[44px] rounded-lg px-4 text-sm font-semibold text-white bg-red-600 disabled:opacity-50">
                  {disconnecting ? 'Desconectando…' : 'Sí, desconectar'}
                </button>
                <button type="button" onClick={() => setConfirm(null)} className="text-sm" style={labelStyle}>Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
