import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function CrmFiscalDocument({ businessId, invoiceId }) {
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!businessId || !invoiceId) return;

    let cancelled = false;

    async function loadDocument() {
      setLoading(true);
      setError('');
      setDocument(null);

      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.access_token) {
          throw new Error('Debes iniciar sesión.');
        }

        const params = new URLSearchParams({
          businessId,
          invoiceId,
        });

        const response = await fetch(
          `/api/fiscal/document?${params}`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error('No se pudo consultar el documento tributario.');
        }

        const result = await response.json();

        if (!cancelled) setDocument(result.document);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDocument();

    return () => {
      cancelled = true;
    };
  }, [businessId, invoiceId]);

  if (loading) {
    return <p className="text-sm text-gray-500">Consultando documento tributario...</p>;
  }

  if (error) {
    return <p role="alert" className="text-sm text-red-600">{error}</p>;
  }

  if (!document) return null;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="text-base font-semibold mb-3">
        Documento tributario asociado
      </h3>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-gray-500">Documento</p>
          <p className="font-medium">Boleta electrónica (DTE 39)</p>
        </div>

        <div>
          <p className="text-gray-500">Folio</p>
          <p className="font-semibold">{document.folio ?? 'Pendiente'}</p>
        </div>

        <div>
          <p className="text-gray-500">Estado del proveedor</p>
          <p className="font-medium">
            {document.status === 'issued'
              ? 'Emitida (aceptación SII no verificada)'
              : document.status}
          </p>
        </div>

        <div>
          <p className="text-gray-500">Total de la nota de venta</p>
          <p className="font-semibold">
            {Number(document.total).toLocaleString('es-CL', {
              style: 'currency',
              currency: 'CLP',
              maximumFractionDigits: 0,
            })}
          </p>
        </div>
      </div>
    </section>
  );
}
