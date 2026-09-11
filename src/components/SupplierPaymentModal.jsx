import React, { useState, useEffect } from 'react';
import Icon from 'components/AppIcon';
import { formatMoney, fmtMoneyInput, parseMoneyInput } from '../utils/formatMoney';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'check', label: 'Cheque' },
  { value: 'other', label: 'Otro' },
];

/**
 * PROVEEDORES-CORE-3 §7: el monto del pago NUNCA se ingresa a mano --
 * se deriva SIEMPRE como la suma de lo asignado a cada factura tildada,
 * así que payment.amount = SUM(allocations.amount) se cumple por
 * construcción de la UI, no solo porque la RPC lo vuelve a validar
 * server-side (que también lo hace, siempre).
 */
export default function SupplierPaymentModal({ open, onClose, onSave, supplier, invoices = [] }) {
  const today = new Date().toISOString().slice(0, 10);
  const [selected, setSelected] = useState({}); // invoiceId -> amount string
  const [paymentDate, setPaymentDate] = useState(today);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const pendingInvoices = invoices.filter((inv) => Number(inv.balance) > 0);

  useEffect(() => {
    if (open) {
      setSelected({});
      setPaymentDate(today);
      setPaymentMethod('cash');
      setReference('');
      setNotes('');
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggleInvoice = (invoice) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[invoice.id] !== undefined) {
        delete next[invoice.id];
      } else {
        // Default: pago total de esa factura -- el usuario puede editarlo
        // hacia abajo para un pago parcial.
        next[invoice.id] = String(invoice.balance);
      }
      return next;
    });
  };

  const setAmount = (invoiceId, raw) => {
    setSelected((prev) => ({ ...prev, [invoiceId]: raw.replace(/\D/g, '') }));
  };

  const allocations = Object.entries(selected)
    .map(([invoiceId, amount]) => ({ invoiceId, amount: parseMoneyInput(amount) }))
    .filter((a) => a.amount > 0);
  const totalAmount = allocations.reduce((sum, a) => sum + a.amount, 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (allocations.length === 0) { setError('Seleccioná al menos una factura para aplicar el pago.'); return; }
    if (totalAmount <= 0) { setError('Ingresá un monto válido para al menos una factura.'); return; }
    for (const a of allocations) {
      const invoice = pendingInvoices.find((inv) => inv.id === a.invoiceId);
      if (invoice && a.amount > Number(invoice.balance)) {
        setError(`El monto asignado a ${invoice.documentNumber || invoice.documentType} supera su saldo pendiente.`);
        return;
      }
    }
    setSaving(true);
    setError('');
    try {
      await onSave({
        amount: totalAmount,
        paymentMethod,
        paymentDate,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        allocations,
      });
      onClose();
    } catch (err) {
      setError(err?.message ?? 'Error al registrar el pago');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(2px)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border shadow-xl overflow-hidden max-h-[90vh] flex flex-col" style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--color-border)' }}>
          <div className="min-w-0">
            <h2 className="text-sm font-bold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>Registrar pago</h2>
            {supplier?.name && <p className="text-xs truncate" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{supplier.name}</p>}
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors flex-shrink-0" aria-label="Cerrar">
            <Icon name="X" size={15} color="var(--color-muted-foreground)" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 overflow-y-auto">
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2" style={{ fontFamily: 'var(--font-caption)' }}>{error}</p>}

          {pendingInvoices.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              Este proveedor no tiene facturas pendientes.
            </p>
          ) : (
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                Facturas a pagar *
              </label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {pendingInvoices.map((invoice) => {
                  const isChecked = selected[invoice.id] !== undefined;
                  return (
                    <div key={invoice.id} className="rounded-lg border p-2.5" style={{ borderColor: isChecked ? 'var(--color-primary)' : 'var(--color-border)' }}>
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input type="checkbox" checked={isChecked} onChange={() => toggleInvoice(invoice)} className="mt-0.5 rounded" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold truncate" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                              {invoice.documentNumber ? `${invoice.documentType === 'boleta' ? 'Boleta' : 'Factura'} ${invoice.documentNumber}` : (invoice.documentType === 'boleta' ? 'Boleta' : 'Factura')}
                            </span>
                            <span className="text-xs font-bold flex-shrink-0" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                              Saldo $ {formatMoney(invoice.balance)}
                            </span>
                          </div>
                        </div>
                      </label>
                      {isChecked && (
                        <div className="mt-2 pl-6">
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--color-muted-foreground)' }}>$</span>
                            <input
                              type="text" inputMode="numeric"
                              value={fmtMoneyInput(selected[invoice.id])}
                              onChange={(e) => setAmount(invoice.id, e.target.value)}
                              className="w-full pl-6 pr-2 py-1.5 rounded-lg border text-xs focus:outline-none focus:ring-2"
                              style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center rounded-lg px-3 py-2" style={{ backgroundColor: '#ECFDF5' }}>
            <span className="text-xs font-medium" style={{ color: '#059669', fontFamily: 'var(--font-caption)' }}>Monto del pago</span>
            <span className="text-sm font-bold" style={{ color: '#059669', fontFamily: 'var(--font-stat)' }}>$ {formatMoney(totalAmount)}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>Fecha</label>
              <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)', fontSize: '13px' }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>Método</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)', fontSize: '13px' }}>
                {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Referencia" value={reference} onChange={setReference} placeholder="N° transferencia..." />
            <Field label="Notas" value={notes} onChange={setNotes} placeholder="Opcional" />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors hover:bg-muted" style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
              Cancelar
            </button>
            <button type="submit" disabled={saving || pendingInvoices.length === 0} className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-60" style={{ backgroundColor: '#10B981', color: '#fff', fontFamily: 'var(--font-caption)' }}>
              {saving ? 'Registrando...' : 'Registrar pago'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)', fontSize: '13px' }}
      />
    </div>
  );
}
