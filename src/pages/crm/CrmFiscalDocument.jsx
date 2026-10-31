import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function CrmFiscalDocument({ businessId, invoiceId }) {
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pdfError, setPdfError] = useState('');
  const [openingPdf, setOpeningPdf] = useState(false);

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

  async function openFiscalPdf() {
    if (openingPdf || document?.status !== 'issued' || !document?.folio) return;
    const tab = window.open('', '_blank');
    if (!tab) {
      setPdfError('El navegador bloqueó la pestaña. Permití las ventanas emergentes.');
      return;
    }
    setOpeningPdf(true);
    setPdfError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Debes iniciar sesión.');
      const params = new URLSearchParams({ businessId, invoiceId });
      const response = await fetch(`/api/fiscal/pdf?${params}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('No se pudo recuperar el PDF tributario.');
      const blob = await response.blob();
      if (blob.type.split(';')[0] !== 'application/pdf' || blob.size === 0) {
        throw new Error('El servidor no devolvió un PDF válido.');
      }
      const url = URL.createObjectURL(blob);
      tab.location.replace(url);
      window.setTimeout(() => URL.revokeObjectURL(url), 300000);
    } catch (err) {
      tab.close();
      setPdfError(err.message || 'No se pudo abrir el PDF.');
    } finally {
      setOpeningPdf(false);
    }
  }

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
      {document.status === 'issued' && document.folio && (
        <div className="mt-5">
          <button type="button" onClick={openFiscalPdf} disabled={openingPdf}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {openingPdf ? 'Abriendo PDF...' : `Ver PDF oficial — Boleta ${document.folio}`}
          </button>
          {pdfError && <p role="alert" className="mt-2 text-sm text-red-600">{pdfError}</p>}
        </div>
      )}
    </section>
  );
}
