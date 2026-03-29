import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lightbulb, X } from 'lucide-react';
import { hasCompleteBankDetails } from 'pages/orders/components/TransferPaymentSection';

const BANK_ALERT_DISMISS_PREFIX = 'ventalink-bank-alert-dismissed-';

/**
 * Aviso delgado: solo si faltan datos bancarios. Cerrable con X (persistente por negocio).
 * Usar bajo el título de Dashboard o Pedidos.
 */
export default function BankTransferSetupSlimAlert({ business }) {
  const complete = hasCompleteBankDetails(business);
  const bid = business?.id;
  const storageKey = bid ? `${BANK_ALERT_DISMISS_PREFIX}${bid}` : null;
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') {
      setDismissed(false);
      return;
    }
    try {
      setDismissed(window.localStorage.getItem(storageKey) === '1');
    } catch {
      setDismissed(false);
    }
  }, [storageKey]);

  const handleDismiss = () => {
    if (storageKey) {
      try {
        window.localStorage.setItem(storageKey, '1');
      } catch {
        /* ignore */
      }
    }
    setDismissed(true);
  };

  if (complete || dismissed || !bid) return null;

  return (
    <div
      className="relative flex items-start gap-2.5 rounded-lg border bg-amber-50 pl-3 pr-10 py-2.5 mb-4"
      style={{ borderColor: 'rgba(245, 158, 11, 0.35)' }}
      role="status"
    >
      <Lightbulb className="h-4 w-4 shrink-0 text-amber-800/85 mt-0.5" strokeWidth={2} aria-hidden />
      <p className="text-sm leading-snug text-amber-950/90 min-w-0" style={{ fontFamily: 'var(--font-caption)' }}>
        Configura tus datos de transferencia para enviar cobros rápidos.{' '}
        <Link
          to="/business-configuration#datos-transferencia"
          className="font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950"
        >
          Configurar
        </Link>
      </p>
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-amber-900/70 hover:bg-amber-100/90 hover:text-amber-950 transition-colors"
        aria-label="Cerrar aviso"
      >
        <X className="h-4 w-4" strokeWidth={2} />
      </button>
    </div>
  );
}
