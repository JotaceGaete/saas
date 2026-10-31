import React from 'react';

/**
 * CrmFiscalEmitAction — acción «Emitir boleta electrónica» en la venta pagada.
 *
 * DESHABILITADA. No hay ninguna llamada de emisión en esta interfaz: el proveedor DTECore
 * aún no está verificado y la función fiscal-emit no emite nada hoy. La acción se habilitará
 * solo cuando el contrato DTECore esté verificado y se autorice la emisión real del comercio.
 */
export default function CrmFiscalEmitAction() {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
      <button
        type="button"
        disabled
        aria-disabled="true"
        className="w-full rounded-lg px-4 py-2 text-sm font-semibold text-white/60 bg-white/10 cursor-not-allowed"
      >
        Emitir boleta electrónica
      </button>
      <p className="text-xs text-white/50">
        Disponible cuando la cuenta DTECore de tu negocio esté verificada.
      </p>
    </div>
  );
}
