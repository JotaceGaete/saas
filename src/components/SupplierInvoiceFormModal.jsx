import React, { useState, useEffect } from 'react';
import Icon from 'components/AppIcon';
import { formatMoney, fmtMoneyInput, parseMoneyInput } from '../utils/formatMoney';

// document_type ofrecidos en v1 -- 'nota_credito' y 'legacy_debt' quedan
// deliberadamente fuera (PROVEEDORES-CORE-3 §3): nota_credito porque
// wa_supplier_invoice_balances no tiene semántica de resta para ella hoy
// (un monto positivo siempre suma al balance, nunca resta), y legacy_debt
// está reservado para datos migrados, nunca para carga manual.
const DOCUMENT_TYPES = [
  { value: 'factura', label: 'Factura' },
  { value: 'boleta', label: 'Boleta' },
  { value: 'other', label: 'Otro' },
];

const PURCHASE_TYPES = [
  { value: '', label: 'Sin especificar' },
  { value: 'mercaderia', label: 'Mercadería' },
  { value: 'gasto_con_iva', label: 'Gasto con IVA' },
  { value: 'gasto_sin_iva', label: 'Gasto sin IVA' },
  { value: 'servicio', label: 'Servicio' },
  { value: 'otros', label: 'Otros' },
];

// Mismo algoritmo que calcAmounts() de CrmPurchases.jsx (patrón ya probado
// en el repo para neto/IVA/total) -- duplicado acá a propósito en vez de
// importado: CrmPurchases.jsx y crm_purchase_invoices quedan fuera de
// alcance de CORE-3, no se toca ese archivo para exportar nada.
function calcAmounts(total, taxRate, taxIncluded) {
  const t = +total || 0;
  const r = +taxRate || 0;
  if (!taxIncluded) {
    const tax = +(t * r / 100).toFixed(2);
    return { net_amount: t, tax_amount: tax, total_amount: +(t + tax).toFixed(2) };
  }
  const net = +(t / (1 + r / 100)).toFixed(2);
  const tax = +(t - net).toFixed(2);
  return { net_amount: net, tax_amount: tax, total_amount: t };
}

function getDefaultTaxRate(country) {
  if (!country) return 19;
  const c = String(country).toLowerCase();
  if (c === 'ar' || c === 'argentina') return 21;
  return 19;
}

export default function SupplierInvoiceFormModal({ open, onClose, onSave, invoice = null, supplier, country }) {
  const today = new Date().toISOString().slice(0, 10);
  const defaultTaxRate = getDefaultTaxRate(country);

  // Una factura con pagos ya no puede tocar sus campos monetarios ni su
  // clasificación (PROVEEDORES-CORE-3 §8) -- preferir readonly antes que
  // una edición financiera incorrecta, dado que la DB no tiene ningún
  // CHECK que impida bajar total_amount por debajo de lo ya asignado.
  const isLocked = Boolean(invoice) && Number(invoice?.paidAmount ?? 0) > 0;

  const [documentType, setDocumentType] = useState('factura');
  const [documentNumber, setDocumentNumber] = useState('');
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState('');
  const [purchaseType, setPurchaseType] = useState('');
  const [taxRate, setTaxRate] = useState(String(defaultTaxRate));
  const [taxIncluded, setTaxIncluded] = useState(true);
  const [total, setTotal] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setDocumentType(invoice?.documentType ?? 'factura');
    setDocumentNumber(invoice?.documentNumber ?? '');
    setIssueDate(invoice?.issueDate ?? today);
    setDueDate(invoice?.dueDate ?? '');
    setPurchaseType(invoice?.purchaseType ?? '');
    setTaxRate(invoice ? String(invoice.taxRate ?? defaultTaxRate) : String(defaultTaxRate));
    setTaxIncluded(true);
    setTotal(invoice ? String(invoice.totalAmount ?? '') : '');
    setNotes(invoice?.notes ?? '');
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoice]);

  const parsedTotal = invoice && isLocked ? Number(invoice.totalAmount) : parseMoneyInput(total);
  const hasIva = purchaseType !== 'gasto_sin_iva';
  const calc = hasIva
    ? calcAmounts(parsedTotal, taxRate, taxIncluded)
    : { net_amount: parsedTotal, tax_amount: 0, total_amount: parsedTotal };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isLocked) {
      if (!parsedTotal || parsedTotal <= 0) { setError('Ingresá un total válido.'); return; }
      if (!issueDate) { setError('Ingresá la fecha de emisión.'); return; }
    }
    setSaving(true);
    setError('');
    try {
      const payload = isLocked
        ? { documentNumber: documentNumber.trim() || null, dueDate: dueDate || null, notes: notes.trim() || null }
        : {
            documentType,
            documentNumber: documentNumber.trim() || null,
            issueDate,
            dueDate: dueDate || null,
            purchaseType: purchaseType || null,
            netAmount: calc.net_amount,
            taxRate: hasIva ? +taxRate : 0,
            taxAmount: calc.tax_amount,
            totalAmount: calc.total_amount,
            notes: notes.trim() || null,
          };
      await onSave(payload);
      onClose();
    } catch (err) {
      setError(err?.message ?? 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(2px)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border shadow-xl overflow-hidden max-h-[90vh] overflow-y-auto" style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0" style={{ borderColor: 'var(--color-border)', backgroundColor: '#FFFFFF' }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#EEF2FF' }}>
              <Icon name="FileText" size={14} color="#6366F1" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                {invoice ? 'Editar factura' : 'Registrar factura'}
              </h2>
              {supplier?.name && (
                <p className="text-xs truncate" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{supplier.name}</p>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors flex-shrink-0" aria-label="Cerrar">
            <Icon name="X" size={15} color="var(--color-muted-foreground)" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2" style={{ fontFamily: 'var(--font-caption)' }}>{error}</p>}

          {isLocked && (
            <p className="text-xs px-3 py-2 rounded-lg flex items-start gap-1.5" style={{ backgroundColor: '#FFFBEB', color: '#92400E', fontFamily: 'var(--font-caption)' }}>
              <Icon name="Lock" size={12} color="#92400E" className="flex-shrink-0 mt-0.5" />
              Esta factura ya tiene pagos registrados. Solo se pueden editar el número de documento, el vencimiento y las notas.
            </p>
          )}

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>Tipo de documento</label>
            <div className="flex gap-1.5">
              {DOCUMENT_TYPES.map((t) => (
                <button
                  key={t.value} type="button" disabled={isLocked}
                  onClick={() => setDocumentType(t.value)}
                  className="flex-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                  style={{ fontFamily: 'var(--font-caption)', backgroundColor: documentType === t.value ? '#6366F1' : '#F3F4F6', color: documentType === t.value ? '#fff' : 'var(--color-muted-foreground)' }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <Field label="Número de documento" value={documentNumber} onChange={setDocumentNumber} placeholder="Ej: 18452" />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>Fecha emisión {!isLocked && '*'}</label>
              <input type="date" value={issueDate} disabled={isLocked} onChange={(e) => setIssueDate(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 disabled:opacity-50"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)', fontSize: '13px' }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>Vencimiento <span className="font-normal opacity-60">(opcional)</span></label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)', fontSize: '13px' }} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>Tipo de compra</label>
            <select value={purchaseType} disabled={isLocked} onChange={(e) => setPurchaseType(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)', fontSize: '13px' }}>
              {PURCHASE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>Total {!isLocked && '*'}</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>$</span>
              {isLocked ? (
                <input type="text" disabled value={formatMoney(parsedTotal)}
                  className="w-full pl-7 pr-3 py-2 rounded-lg border text-sm opacity-50"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }} />
              ) : (
                <input type="text" inputMode="numeric" value={fmtMoneyInput(total)} onChange={(e) => setTotal(e.target.value.replace(/\D/g, ''))} placeholder="0"
                  className="w-full pl-7 pr-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }} />
              )}
            </div>
          </div>

          {hasIva && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>IVA</label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                    <input type="checkbox" checked={taxIncluded} disabled={isLocked} onChange={(e) => setTaxIncluded(e.target.checked)} className="rounded" />
                    Incluido en el total
                  </label>
                  <div className="flex items-center gap-1">
                    <input type="number" min="0" max="100" step="0.5" value={taxRate} disabled={isLocked} onChange={(e) => setTaxRate(e.target.value)}
                      className="w-14 rounded-lg border px-2 py-1 text-xs text-center focus:outline-none focus:ring-2 disabled:opacity-50"
                      style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }} />
                    <span className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>%</span>
                  </div>
                </div>
              </div>
              {parsedTotal > 0 && (
                <div className="rounded-lg px-3 py-2 text-xs space-y-1" style={{ backgroundColor: '#EEF2FF' }}>
                  <div className="flex justify-between" style={{ color: 'var(--color-muted-foreground)' }}>
                    <span>Neto</span><span className="font-semibold">{formatMoney(calc.net_amount)}</span>
                  </div>
                  <div className="flex justify-between" style={{ color: '#6366F1' }}>
                    <span>IVA ({taxRate}%)</span><span className="font-semibold">{formatMoney(calc.tax_amount)}</span>
                  </div>
                  <div className="flex justify-between font-bold border-t pt-1" style={{ color: 'var(--color-foreground)', borderColor: '#C7D2FE' }}>
                    <span>Total</span><span>{formatMoney(calc.total_amount)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>Notas</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Observaciones..."
              className="w-full rounded-lg border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)', fontSize: '13px' }} />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors hover:bg-muted" style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-60" style={{ backgroundColor: 'var(--color-primary)', color: '#fff', fontFamily: 'var(--font-caption)' }}>
              {saving ? 'Guardando...' : invoice ? 'Guardar cambios' : 'Registrar factura'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)', fontSize: '13px' }}
      />
    </div>
  );
}
