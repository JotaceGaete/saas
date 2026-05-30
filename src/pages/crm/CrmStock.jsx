import React, { useEffect, useState } from 'react';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { getCrmStockProducts, registerStockMovement, updateStockMinimo } from '../../services/crmService';

function MovementModal({ product, onSave, onClose }) {
  const [type, setType] = useState('entrada');
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!quantity || quantity <= 0) { alert('Ingresa una cantidad válida.'); return; }
    setSaving(true);
    await onSave({ type, quantity: +quantity, notes });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a2535] rounded-2xl w-full max-w-sm">
        <div className="flex justify-between items-center p-5 border-b border-white/10">
          <h2 className="text-white font-semibold">Registrar movimiento</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><Icon name="X" size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-sm text-gray-400">{product.name}</p>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Tipo</label>
            <div className="flex gap-2">
              {[['entrada', 'Entrada', 'text-green-400'], ['salida', 'Salida', 'text-red-400'], ['ajuste', 'Ajuste', 'text-blue-400']].map(([v, l, c]) => (
                <button type="button" key={v} onClick={() => setType(v)} className={`flex-1 py-2 rounded-lg text-sm font-medium border ${type === v ? 'border-blue-500 bg-blue-900/30 text-white' : 'border-white/10 text-gray-400 hover:bg-white/5'}`}>
                  <span className={c}>{l}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              {type === 'ajuste' ? 'Nuevo stock total' : 'Cantidad'}
            </label>
            <input type="number" min={type === 'ajuste' ? 0 : 1} step="1" value={quantity} onChange={e => setQuantity(e.target.value)} className="w-full bg-[#0f1720] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Notas (opcional)</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} className="w-full bg-[#0f1720] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-white/10 text-gray-300 hover:bg-white/5 text-sm">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium">
              {saving ? 'Guardando…' : 'Registrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CrmStock() {
  const { business } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [editMinimo, setEditMinimo] = useState({});
  const [search, setSearch] = useState('');

  const load = async () => {
    if (!business?.id) return;
    setLoading(true);
    const { data } = await getCrmStockProducts(business.id);
    setProducts(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [business?.id]);

  const handleMovement = async (mov) => {
    await registerStockMovement(business.id, { productId: modal.id, ...mov });
    setModal(null);
    load();
  };

  const handleMinimoSave = async (productId, val) => {
    await updateStockMinimo(productId, val === '' ? null : +val);
    setEditMinimo(prev => { const n = { ...prev }; delete n[productId]; return n; });
    load();
  };

  const filtered = products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  const withControl = filtered.filter(p => p.stock_actual != null);
  const withoutControl = filtered.filter(p => p.stock_actual == null);

  const stockStatus = (p) => {
    if (p.stock_actual == null) return null;
    if (p.stock_minimo != null && p.stock_actual < p.stock_minimo) return 'bajo';
    if (p.stock_actual === 0) return 'agotado';
    return 'ok';
  };

  const ProductRow = ({ p }) => {
    const status = stockStatus(p);
    return (
      <div className="bg-[#1a2535] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {p.thumbnail_url ? (
            <img src={p.thumbnail_url} alt={p.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0"><Icon name="Package" size={18} className="text-gray-500" /></div>
          )}
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">{p.name}</p>
            {p.category && <p className="text-xs text-gray-500">{p.category}</p>}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Stock actual */}
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-0.5">Stock actual</p>
            <p className={`text-lg font-bold ${status === 'bajo' || status === 'agotado' ? 'text-yellow-400' : 'text-white'}`}>
              {p.stock_actual ?? '—'}
            </p>
          </div>

          {/* Stock mínimo editable */}
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-0.5">Mínimo</p>
            {editMinimo[p.id] !== undefined ? (
              <div className="flex items-center gap-1">
                <input
                  type="number" min="0" step="1"
                  value={editMinimo[p.id]}
                  onChange={e => setEditMinimo(prev => ({ ...prev, [p.id]: e.target.value }))}
                  className="w-16 bg-[#0f1720] border border-blue-500 rounded px-2 py-1 text-white text-sm focus:outline-none"
                />
                <button onClick={() => handleMinimoSave(p.id, editMinimo[p.id])} className="text-green-400 hover:text-green-300"><Icon name="Check" size={14} /></button>
                <button onClick={() => setEditMinimo(prev => { const n = { ...prev }; delete n[p.id]; return n; })} className="text-gray-500 hover:text-gray-300"><Icon name="X" size={14} /></button>
              </div>
            ) : (
              <button onClick={() => setEditMinimo(prev => ({ ...prev, [p.id]: p.stock_minimo ?? '' }))} className="text-sm text-gray-400 hover:text-white underline underline-offset-2">
                {p.stock_minimo ?? 'Definir'}
              </button>
            )}
          </div>

          {status === 'bajo' && <span className="text-xs bg-yellow-900/40 text-yellow-400 px-2 py-0.5 rounded-full">Stock bajo</span>}
          {status === 'agotado' && <span className="text-xs bg-red-900/40 text-red-400 px-2 py-0.5 rounded-full">Agotado</span>}

          <button onClick={() => setModal(p)} className="flex items-center gap-1 text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
            <Icon name="ArrowUpDown" size={13} />Movimiento
          </button>
        </div>
      </div>
    );
  };

  return (
    <DashboardAppShell>
      <DashboardLayoutContent>
        <PanelHeader title="Control de stock" subtitle="Gestión de inventario básico" icon="Package" />

        <div className="mb-4">
          <input
            type="text"
            placeholder="Buscar producto…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full max-w-sm bg-[#1a2535] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Icon name="Loader2" size={32} className="animate-spin text-blue-400" /></div>
        ) : (
          <div className="space-y-6">
            {withControl.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Con control de stock</h3>
                <div className="space-y-3">{withControl.map(p => <ProductRow key={p.id} p={p} />)}</div>
              </section>
            )}
            {withoutControl.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Sin control de stock — haz clic en "Movimiento" para activarlo</h3>
                <div className="space-y-3">{withoutControl.map(p => <ProductRow key={p.id} p={p} />)}</div>
              </section>
            )}
            {filtered.length === 0 && (
              <div className="text-center py-16 text-gray-500"><Icon name="Package" size={40} className="mx-auto mb-3 opacity-30" /><p>Sin productos.</p></div>
            )}
          </div>
        )}

        {modal && <MovementModal product={modal} onSave={handleMovement} onClose={() => setModal(null)} />}
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
