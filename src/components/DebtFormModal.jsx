import React, { useState, useEffect } from 'react';
import Icon from 'components/AppIcon';

export default function DebtFormModal({ open, onClose, onSave, debt = null }) {
  const [form, setForm] = useState({ description: '', amount: '', dueDate: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm({
        description: debt?.description ?? '',
        amount: debt?.amount != null ? String(debt.amount) : '',
        dueDate: debt?.dueDate ?? '',
      });
      setError('');
    }
  }, [open, debt]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.description.trim()) { setError('La descripción es obligatoria'); return; }
    const amount = parseFloat(form.amount);
    if (!form.amount || isNaN(amount) || amount <= 0) { setError('Ingresá un monto válido'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({ description: form.description.trim(), amount, dueDate: form.dueDate || null });
      onClose();
    } catch (err) {
      setError(err?.message ?? 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border shadow-xl overflow-hidden"
        style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#FEF2F2' }}>
              <Icon name="Receipt" size={14} color="#EF4444" />
            </div>
            <h2 className="text-sm font-bold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
              {debt ? 'Editar deuda' : 'Registrar deuda'}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors" aria-label="Cerrar">
            <Icon name="X" size={15} color="var(--color-muted-foreground)" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2" style={{ fontFamily: 'var(--font-caption)' }}>{error}</p>
          )}

          <Field label="Descripción *" value={form.description} onChange={(v) => setForm((p) => ({ ...p, description: v }))} placeholder="Ej: Factura materiales marzo" />

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>Monto total *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>$</span>
              <input
                type="number" min="0" step="0.01"
                value={form.amount}
                onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                placeholder="0.00"
                className="w-full pl-7 pr-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)', fontSize: '13px' }}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
              Fecha de vencimiento
              <span className="ml-1 font-normal opacity-60">(opcional)</span>
            </label>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)', fontSize: '13px' }}
            />
          </div>

          {!debt && (
            <p className="text-xs px-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              💡 Podés registrar abonos parciales desde el detalle del proveedor.
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors hover:bg-muted" style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-60" style={{ backgroundColor: 'var(--color-primary)', color: '#fff', fontFamily: 'var(--font-caption)' }}>
              {saving ? 'Guardando...' : debt ? 'Guardar' : 'Registrar deuda'}
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
