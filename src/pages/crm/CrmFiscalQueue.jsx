import React, { useCallback, useEffect, useState } from 'react';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import CrmBreadcrumb from 'components/ui/CrmBreadcrumb';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { FISCAL_STATUS_LABELS, canEmitFromQueue, fetchFiscalQueue, emitPendingFromQueue } from '../../services/fiscalQueueService';
import { formatMoney } from '../../utils/formatMoney';

const STATE_HINT = {
  unknown: 'El proveedor no confirmó el resultado. No se reintenta automáticamente; conciliar antes de cualquier acción.',
  sending: 'Emisión en curso. Si permanece así, requiere conciliación.',
  failed: 'El proveedor rechazó la emisión. No se reintenta desde el panel.',
};

export default function CrmFiscalQueue() {
  const { business } = useAuth();
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState(null);

  const token = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  }, []);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    setError(null);
    const accessToken = await token();
    if (!accessToken) { setError('Sesión no disponible.'); setLoading(false); return; }
    const result = await fetchFiscalQueue({ businessId: business.id, accessToken });
    if (!result.ok) setError(result.status === 403 ? 'No tienes acceso a este negocio.' : 'No se pudo cargar la cola fiscal.');
    else { setItems(result.items); setCounts(result.counts); }
    setLoading(false);
  }, [business?.id, token]);

  useEffect(() => { load(); }, [load]);

  const emit = async (saleId) => {
    if (busyId) return;
    if (!window.confirm('¿Emitir la boleta de esta venta? Se enviará al proveedor una sola vez.')) return;
    setBusyId(saleId);
    setMessage(null);
    try {
      const accessToken = await token();
      const result = await emitPendingFromQueue({ businessId: business.id, invoiceId: saleId, accessToken });
      if (result.state === 'issued') setMessage(`Boleta emitida. Folio ${result.folio ?? 'sin folio'}.`);
      else if (result.state === 'blocked') setMessage(`No se emitió: ${result.reason}.`);
      else setMessage('Resultado no confirmado. Quedará marcado para conciliación; no volver a emitir.');
    } finally {
      setBusyId(null);
      load();
    }
  };

  return (
    <DashboardAppShell>
      <DashboardLayoutContent>
        <CrmBreadcrumb items={[{ label: 'CRM', path: '/crm' }, { label: 'Cola fiscal' }]} />
        <PanelHeader title="Cola fiscal" subtitle="Boletas por venta. Las ventas pendientes se registran automáticamente y se emiten solo desde aquí." />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '12px 0' }}>
          {Object.entries(FISCAL_STATUS_LABELS).map(([key, label]) => (
            <span key={key} style={{ fontSize: 13 }}>{label}: <strong>{counts[key] || 0}</strong></span>
          ))}
        </div>
        {message && <p role="status" style={{ fontSize: 13 }}>{message}</p>}
        {error && <p role="alert" style={{ color: '#b91c1c', fontSize: 13 }}>{error}</p>}
        {loading ? <p>Cargando…</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                <th align="left">Venta</th><th align="right">Total</th><th align="left">Estado</th>
                <th align="left">Folio</th><th align="left">Acción</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={5}>Sin registros fiscales.</td></tr>}
              {items.map((item) => (
                <tr key={item.saleId} style={{ borderTop: '1px solid #eee' }}>
                  <td style={{ fontFamily: 'monospace' }}>{item.saleId.slice(0, 8)}</td>
                  <td align="right">{item.total != null ? formatMoney(item.total) : '—'}</td>
                  <td>
                    {FISCAL_STATUS_LABELS[item.status] || item.status}
                    {STATE_HINT[item.status] && <div style={{ fontSize: 12, color: '#6b7280' }}>{STATE_HINT[item.status]}</div>}
                  </td>
                  <td>{item.folio ?? '—'}</td>
                  <td>
                    {canEmitFromQueue(item.status) ? (
                      <button type="button" disabled={busyId === item.saleId} onClick={() => emit(item.saleId)}>
                        {busyId === item.saleId ? 'Emitiendo…' : 'Emitir boleta'}
                      </button>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
