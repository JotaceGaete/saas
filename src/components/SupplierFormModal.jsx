import React, { useState, useEffect } from 'react';
import Icon from 'components/AppIcon';

const SUPPLIER_TYPES = [
  { value: 'mercaderia', label: 'Mercadería' },
  { value: 'insumos',    label: 'Insumos' },
  { value: 'servicios',  label: 'Servicios' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'arriendo',   label: 'Arriendo' },
  { value: 'marketing',  label: 'Marketing' },
  { value: 'otros',      label: 'Otros' },
];

export default function SupplierFormModal({ open, onClose, onSave, supplier = null }) {
  const [form, setForm] = useState({ name: '', contactName: '', phone: '', email: '', notes: '', supplierType: 'otros' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm({
        name: supplier?.name ?? '',
        contactName: supplier?.contactName ?? '',
        phone: supplier?.phone ?? '',
        email: supplier?.email ?? '',
        notes: supplier?.notes ?? '',
        supplierType: supplier?.supplierType ?? 'otros',
      });
      setError('');
    }
  }, [open, supplier]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('El nombre es obligatorio'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave(form);
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
        className="w-full max-w-md rounded-2xl border shadow-xl overflow-hidden"
        style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#EEF2FF' }}>
              <Icon name="Truck" size={14} color="#6366F1" />
            </div>
            <h2 className="text-sm font-bold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
              {supplier ? 'Editar proveedor' : 'Nuevo proveedor'}
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

          <Field label="Nombre del proveedor *" value={form.name} onChange={(v) => setForm((p) => ({ ...p, name: v }))} placeholder="Ej: Distribuidora Norte" />

          {/* Categoría */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>Categoría</label>
            <div className="flex flex-wrap gap-1.5">
              {SUPPLIER_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, supplierType: t.value }))}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                  style={{
                    fontFamily: 'var(--font-caption)',
                    backgroundColor: form.supplierType === t.value ? '#6366F1' : '#F3F4F6',
                    color: form.supplierType === t.value ? '#fff' : 'var(--color-muted-foreground)',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <Field label="Nombre de contacto" value={form.contactName} onChange={(v) => setForm((p) => ({ ...p, contactName: v }))} placeholder="Ej: Juan Pérez" />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Teléfono" value={form.phone} onChange={(v) => setForm((p) => ({ ...p, phone: v }))} placeholder="+54 9 11..." type="tel" />
            <Field label="Email" value={form.email} onChange={(v) => setForm((p) => ({ ...p, email: v }))} placeholder="proveedor@..." type="email" />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>Notas</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              rows={2}
              placeholder="Condiciones, horarios de entrega..."
              className="w-full rounded-lg border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)', fontSize: '13px' }}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors hover:bg-muted" style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-60" style={{ backgroundColor: 'var(--color-primary)', color: '#fff', fontFamily: 'var(--font-caption)' }}>
              {saving ? 'Guardando...' : supplier ? 'Guardar cambios' : 'Crear proveedor'}
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
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)', fontSize: '13px' }}
      />
    </div>
  );
}
