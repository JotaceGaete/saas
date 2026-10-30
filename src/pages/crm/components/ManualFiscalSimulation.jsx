import React, { useState } from 'react';
import { supabase } from '../../../lib/supabase';

/**
 * Optional, explicit manual fiscal simulation. Never runs on sale creation.
 * Hidden by default until the controlled pilot is enabled in the frontend.
 */
export default function ManualFiscalSimulation({ businessId, invoiceId, paymentMethod, pendingBalance }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  if (import.meta.env.VITE_SII_MANUAL_PILOT !== 'simulation' ||
      !businessId || !invoiceId || paymentMethod !== 'cash' ||
      Number(pendingBalance || 0) !== 0) return null;

  const emit = async () => {
    if (busy || status) return;
    if (!window.confirm('¿Solicitar una boleta de SIMULACIÓN? Esto no es un documento tributario real.')) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data?.session?.access_token) throw new Error('Sesión no disponible');
      const response = await fetch('/api/siisolutions-manual-cash', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ businessId, invoiceId }),
      });
      const result = await response.json();
      if (!response.ok) {
        setStatus(response.status === 409
          ? 'La venta ya tiene una solicitud fiscal. Revisar antes de volver a intentar.'
          : 'No se pudo confirmar la operación. Revisar el registro fiscal antes de volver a intentar.');
      } else {
        setStatus(result.state === 'issued'
          ? `Documento de simulación registrado. Folio: ${result.folio ?? 'sin folio'}`
          : 'Solicitud registrada. Estado pendiente de revisión; no volver a emitir.');
      }
    } catch {
      setStatus('Resultado incierto. Revisar el registro fiscal antes de volver a intentar.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ padding: '10px 16px', borderTop: '1px solid #eee' }}>
      <button type="button" disabled={busy || Boolean(status)} onClick={emit}
        style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #aaa', background: '#fff', cursor: busy || status ? 'default' : 'pointer' }}>
        {busy ? 'Solicitando…' : 'Emitir boleta (SIMULACIÓN)'}
      </button>
      {status && <p role="status" style={{ fontSize: 12, marginTop: 8 }}>{status}</p>}
    </div>
  );
}
