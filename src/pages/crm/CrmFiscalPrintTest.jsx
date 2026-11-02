import React from 'react';
import { useParams } from 'react-router-dom';
import CrmFiscalThermalPrint from './CrmFiscalThermalPrint';
import { FISCAL_THERMAL_PRINT_ENABLED } from '../../services/fiscalThermalPrintService';

// Laboratorio de reimpresión: carga XML local; nunca emite documentos.
export default function CrmFiscalPrintTest() {
  const { businessId } = useParams();
  if (!FISCAL_THERMAL_PRINT_ENABLED) {
    return <main className="p-6">La prueba de impresión fiscal no está habilitada.</main>;
  }
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">Prueba de boleta térmica · XP-80C</h1>
      <p className="mt-2 text-sm text-gray-600">
        Selecciona un XML DTE 39 ya emitido. Solo reimprime y diagnostica el timbre;
        no genera folios ni solicita emisión al SII.
      </p>
      <CrmFiscalThermalPrint businessId={businessId} />
    </main>
  );
}
