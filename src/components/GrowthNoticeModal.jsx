import React, { useEffect, useState } from 'react';

const STORAGE_KEY = 'walinka:growth_notice_seen:v1';

/**
 * Aviso informativo de una sola vez, mostrado tras cargar el negocio.
 * No bloquea el uso de la app: es un aviso, no un requisito de acción.
 */
export default function GrowthNoticeModal({ ready }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let alreadySeen = true;
    try {
      alreadySeen = localStorage.getItem(STORAGE_KEY) === '1';
    } catch (_) {
      alreadySeen = true;
    }
    if (!alreadySeen) setOpen(true);
  }, [ready]);

  const handleClose = () => {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch (_) {
      // localStorage no disponible; no bloquear el cierre del aviso por esto.
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-slate-900/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="growth-notice-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-6 shadow-xl">
        <h2 id="growth-notice-title" className="text-base font-bold text-gray-900">
          Aviso Importante
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          En los últimos días hemos tenido una alta demanda en la plataforma, por eso estamos
          realizando mejoras de rendimiento y estabilidad.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          Tu catálogo y tus herramientas siguen funcionando normalmente. Si notas algo extraño,
          puedes escribirnos por soporte.
        </p>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
