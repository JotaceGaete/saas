import React, { useEffect, useState } from 'react';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { getCrmCustomers, createCrmCustomer, updateCrmCustomer, deleteCrmCustomer } from '../../services/crmService';

const EMPTY_FORM = { name: '', company: '', rut: '', phone: '', whatsapp: '', email: '', address: '', notes: '' };

const FIELDS = [
  { key: 'name', label: 'Nombre *', required: true, type: 'text' },
  { key: 'company', label: 'Empresa', type: 'text' },
  { key: 'rut', label: 'RUT / CUIT / DNI', type: 'text' },
  { key: 'phone', label: 'Teléfono', type: 'text' },
  { key: 'whatsapp', label: 'WhatsApp', type: 'text' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'address', label: 'Dirección', type: 'text' },
];

function CustomerModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial ? { ...EMPTY_FORM, ...initial } : { ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('El nombre es obligatorio.'); return; }
    setSaving(true);
    setError('');
    const { error: err } = await onSave(form);
    if (err) { setError(err.message || 'Error al guardar.'); setSaving(false); return; }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <h2 className="font-bold text-gray-900 text-lg">{initial?.id ? 'Editar cliente' : 'Nuevo cliente'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <Icon name="X" size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
          <div className="px-6 py-4 space-y-4">
            {FIELDS.map(({ key, label, required, type }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input
                  type={type}
                  required={required}
                  value={form[key]}
                  onChange={e => set(key, e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notas internas</label>
              <textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          </div>
          <div className="px-6 py-4 border-t flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2">
              {saving && <Icon name="Loader2" size={15} className="animate-spin" />}
              {saving ? 'Guardando…' : initial?.id ? 'Guardar cambios' : 'Crear cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CrmCustomers() {
  const { business } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState(null);

  const load = async () => {
    if (!business?.id) return;
    setLoading(true);
    const { data } = await getCrmCustomers(business.id);
    setCustomers(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [business?.id]);

  const handleSave = async (form) => {
    let result;
    if (modal?.id) {
      result = await updateCrmCustomer(modal.id, form);
    } else {
      result = await createCrmCustomer(business.id, form);
    }
    if (!result.error) { setModal(null); load(); }
    return result;
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este cliente? Esta acción no se puede deshacer.')) return;
    setDeleting(id);
    await deleteCrmCustomer(id);
    setDeleting(null);
    load();
  };

  const filtered = customers.filter(c =>
    !search ||
    (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.company || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').includes(search)
  );

  return (
    <DashboardAppShell>
      <PanelHeader
        title={<h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>Clientes CRM</h1>}
        subtitle={<p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>{loading ? 'Cargando…' : `${customers.length} cliente${customers.length !== 1 ? 's' : ''}`}</p>}
      >
        <button
          onClick={() => setModal('new')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--color-primary, #2563eb)' }}
        >
          <Icon name="UserPlus" size={16} />
          Nuevo cliente
        </button>
      </PanelHeader>

      <DashboardLayoutContent>
        {/* Buscador */}
        <div className="mb-5">
          <div className="relative max-w-sm">
            <Icon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, empresa, email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{ backgroundColor: 'var(--color-surface, #fff)' }}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Icon name="Loader2" size={32} className="animate-spin text-blue-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <Icon name="Users" size={48} className="mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 font-medium">{search ? 'Sin resultados para esa búsqueda.' : 'Todavía no hay clientes.'}</p>
            {!search && (
              <button
                onClick={() => setModal('new')}
                className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
              >
                <Icon name="UserPlus" size={16} />Crear primer cliente
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(c => (
              <div
                key={c.id}
                className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold text-white shrink-0">
                      {(c.name || '?')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{c.name || 'Sin nombre'}</p>
                      {c.company && <p className="text-xs text-gray-500 truncate">{c.company}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => setModal(c)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                      title="Editar"
                    >
                      <Icon name="Pencil" size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      disabled={deleting === c.id}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                      title="Eliminar"
                    >
                      {deleting === c.id ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Trash2" size={14} />}
                    </button>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5">
                  {c.phone && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Icon name="Phone" size={13} className="text-gray-400 shrink-0" />
                      <span>{c.phone}</span>
                    </div>
                  )}
                  {c.email && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Icon name="Mail" size={13} className="text-gray-400 shrink-0" />
                      <span className="truncate">{c.email}</span>
                    </div>
                  )}
                  {c.rut && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Icon name="Hash" size={13} className="text-gray-400 shrink-0" />
                      <span>{c.rut}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DashboardLayoutContent>

      {modal && (
        <CustomerModal
          initial={modal === 'new' ? null : modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </DashboardAppShell>
  );
}
