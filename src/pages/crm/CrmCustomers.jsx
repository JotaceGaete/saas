import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { getCrmCustomers, createCrmCustomer, updateCrmCustomer, deleteCrmCustomer } from '../../services/crmService';

const EMPTY_FORM = { name: '', company: '', rut: '', phone: '', whatsapp: '', email: '', address: '', notes: '' };

function CustomerModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a2535] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-5 border-b border-white/10">
          <h2 className="text-white font-semibold text-lg">{initial?.id ? 'Editar cliente' : 'Nuevo cliente'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><Icon name="X" size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {[
            { key: 'name', label: 'Nombre *', required: true },
            { key: 'company', label: 'Empresa' },
            { key: 'rut', label: 'RUT / CUIT / DNI' },
            { key: 'phone', label: 'Teléfono' },
            { key: 'whatsapp', label: 'WhatsApp' },
            { key: 'email', label: 'Email', type: 'email' },
            { key: 'address', label: 'Dirección' },
          ].map(({ key, label, required, type }) => (
            <div key={key}>
              <label className="block text-sm text-gray-400 mb-1">{label}</label>
              <input
                type={type || 'text'}
                required={required}
                value={form[key]}
                onChange={e => set(key, e.target.value)}
                className="w-full bg-[#0f1720] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          ))}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Notas</label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={3}
              className="w-full bg-[#0f1720] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-white/10 text-gray-300 hover:bg-white/5 text-sm">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CrmCustomers() {
  const navigate = useNavigate();
  const { business } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'new' | customer object
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState(null);

  const load = async () => {
    if (!business?.id) return;
    setLoading(true);
    const { data } = await getCrmCustomers(business.id);
    setCustomers(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [business?.id]);

  const handleSave = async (form) => {
    if (modal?.id) {
      await updateCrmCustomer(modal.id, form);
    } else {
      await createCrmCustomer(business.id, form);
    }
    setModal(null);
    load();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este cliente?')) return;
    setDeleting(id);
    await deleteCrmCustomer(id);
    setDeleting(null);
    load();
  };

  const filtered = customers.filter(c =>
    !search ||
    (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.company || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardAppShell>
      <DashboardLayoutContent>
        <PanelHeader
          title="Clientes"
          subtitle={`${customers.length} cliente${customers.length !== 1 ? 's' : ''}`}
          icon="Users"
          action={<button onClick={() => setModal('new')} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"><Icon name="UserPlus" size={16} />Nuevo cliente</button>}
        />

        <div className="mb-4">
          <input
            type="text"
            placeholder="Buscar por nombre, empresa o email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full max-w-sm bg-[#1a2535] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Icon name="Loader2" size={32} className="animate-spin text-blue-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <Icon name="Users" size={40} className="mx-auto mb-3 opacity-30" />
            <p>{search ? 'Sin resultados.' : 'Sin clientes todavía.'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(c => (
              <div key={c.id} className="bg-[#1a2535] rounded-xl p-4 hover:bg-[#1f2d40] transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-blue-700 flex items-center justify-center text-sm font-bold text-white shrink-0">
                      {(c.name || '?')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-white font-medium truncate">{c.name || 'Sin nombre'}</p>
                      {c.company && <p className="text-xs text-gray-400 truncate">{c.company}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setModal(c)} className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/5"><Icon name="Pencil" size={15} /></button>
                    <button onClick={() => handleDelete(c.id)} disabled={deleting === c.id} className="p-1.5 text-gray-400 hover:text-red-400 rounded-lg hover:bg-white/5"><Icon name="Trash2" size={15} /></button>
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  {c.phone && <p className="text-xs text-gray-400 flex items-center gap-1"><Icon name="Phone" size={12} />{c.phone}</p>}
                  {c.email && <p className="text-xs text-gray-400 flex items-center gap-1"><Icon name="Mail" size={12} />{c.email}</p>}
                  {c.rut && <p className="text-xs text-gray-400">RUT: {c.rut}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        {modal && (
          <CustomerModal
            initial={modal === 'new' ? null : modal}
            onSave={handleSave}
            onClose={() => setModal(null)}
          />
        )}
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
