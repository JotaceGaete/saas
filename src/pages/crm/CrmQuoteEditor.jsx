import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { getCrmQuote, createCrmQuote, updateCrmQuote, getCrmCustomers } from '../../services/crmService';
import { getProducts } from '../../services/waBusinessService';
import CrmDocumentPdf from './CrmDocumentPdf';

const EMPTY_ITEM = { product_id: null, name: '', description: '', unit_price: 0, quantity: 1, discount_pct: 0, subtotal: 0 };

function calcSubtotal(unit_price, quantity, discount_pct) {
  const base = unit_price * quantity;
  return +(base - (base * discount_pct) / 100).toFixed(2);
}

export default function CrmQuoteEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { business } = useAuth();
  const isNew = !id || id === 'nuevo';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [showPdf, setShowPdf] = useState(false);

  const [customerId, setCustomerId] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);
  const [savedQuote, setSavedQuote] = useState(null);

  useEffect(() => {
    if (!business?.id) return;
    getCrmCustomers(business.id).then(r => setCustomers(r.data || []));
    getProducts(business.id).then(r => setProducts(r.data || []));
    if (!isNew) {
      getCrmQuote(id).then(({ data }) => {
        if (!data) { navigate('/crm/presupuestos'); return; }
        setSavedQuote(data);
        setCustomerId(data.customer_id || '');
        setValidUntil(data.valid_until || '');
        setNotes(data.notes || '');
        setItems(data.crm_quote_items?.length ? data.crm_quote_items : [{ ...EMPTY_ITEM }]);
        setLoading(false);
      });
    }
  }, [business?.id, id, isNew]);

  const setItem = (idx, key, val) => {
    setItems(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: val };
      next[idx].subtotal = calcSubtotal(+next[idx].unit_price, +next[idx].quantity, +next[idx].discount_pct);
      return next;
    });
  };

  const selectProduct = (idx, productId) => {
    const p = products.find(pr => pr.id === productId);
    if (!p) return;
    setItems(prev => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        product_id: p.id,
        name: p.name,
        description: p.description || '',
        unit_price: +(p.price || 0),
        subtotal: calcSubtotal(+(p.price || 0), next[idx].quantity, next[idx].discount_pct),
      };
      return next;
    });
  };

  const addItem = () => setItems(prev => [...prev, { ...EMPTY_ITEM }]);
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));

  const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
  const total = subtotal;

  const fmt = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: business?.currency || 'CLP', maximumFractionDigits: 0 }).format(n || 0);

  const handleSave = async () => {
    if (!items.some(i => i.name.trim())) { alert('Agrega al menos un ítem.'); return; }
    setSaving(true);
    const payload = {
      customerId: customerId || null,
      validUntil: validUntil || null,
      notes: notes || null,
      items: items.filter(i => i.name.trim()).map(i => ({
        product_id: i.product_id || null,
        name: i.name,
        description: i.description || null,
        unit_price: +(i.unit_price || 0),
        quantity: +(i.quantity || 1),
        discount_pct: +(i.discount_pct || 0),
      })),
    };
    let result;
    if (isNew) {
      result = await createCrmQuote(business.id, payload);
      if (result.data?.id) { navigate(`/crm/presupuestos/${result.data.id}`, { replace: true }); }
    } else {
      result = await updateCrmQuote(id, payload);
      if (result.data) { setSavedQuote(result.data); }
    }
    setSaving(false);
  };

  if (loading) return (
    <DashboardAppShell><DashboardLayoutContent>
      <div className="flex justify-center py-16"><Icon name="Loader2" size={32} className="animate-spin text-blue-400" /></div>
    </DashboardLayoutContent></DashboardAppShell>
  );

  return (
    <DashboardAppShell>
      <DashboardLayoutContent>
        <PanelHeader
          title={isNew ? 'Nuevo presupuesto' : `Presupuesto ${savedQuote?.quote_number ? 'PRES-' + String(savedQuote.quote_number).padStart(4,'0') : ''}`}
          icon="FileText"
          action={
            <div className="flex gap-2">
              {!isNew && <button onClick={() => setShowPdf(true)} className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/15 text-white rounded-lg text-sm"><Icon name="Printer" size={15} />PDF</button>}
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
                {saving ? <Icon name="Loader2" size={15} className="animate-spin" /> : <Icon name="Save" size={15} />}
                {isNew ? 'Crear' : 'Guardar'}
              </button>
            </div>
          }
        />

        <div className="max-w-3xl space-y-6">
          {/* Cabecera del documento */}
          <div className="bg-[#1a2535] rounded-xl p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Cliente</label>
              <select value={customerId} onChange={e => setCustomerId(e.target.value)} className="w-full bg-[#0f1720] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                <option value="">Sin cliente</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Válido hasta</label>
              <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className="w-full bg-[#0f1720] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm text-gray-400 mb-1">Notas</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full bg-[#0f1720] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none" />
            </div>
          </div>

          {/* Ítems */}
          <div className="bg-[#1a2535] rounded-xl p-5">
            <h3 className="text-white font-semibold mb-4">Productos / Servicios</h3>
            <div className="space-y-4">
              {items.map((item, idx) => (
                <div key={idx} className="border border-white/10 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Ítem #{idx + 1}</span>
                    {items.length > 1 && (
                      <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-300"><Icon name="Trash2" size={15} /></button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Producto del catálogo (opcional)</label>
                      <select onChange={e => selectProduct(idx, e.target.value)} value={item.product_id || ''} className="w-full bg-[#0f1720] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                        <option value="">Seleccionar o escribir manual…</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Descripción del ítem *</label>
                      <input type="text" value={item.name} onChange={e => setItem(idx, 'name', e.target.value)} className="w-full bg-[#0f1720] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Precio unitario</label>
                      <input type="number" min="0" step="1" value={item.unit_price} onChange={e => setItem(idx, 'unit_price', +e.target.value)} className="w-full bg-[#0f1720] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Cantidad</label>
                      <input type="number" min="1" step="1" value={item.quantity} onChange={e => setItem(idx, 'quantity', +e.target.value)} className="w-full bg-[#0f1720] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Descuento %</label>
                      <input type="number" min="0" max="100" step="0.1" value={item.discount_pct} onChange={e => setItem(idx, 'discount_pct', +e.target.value)} className="w-full bg-[#0f1720] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                    </div>
                    <div className="flex items-end">
                      <p className="text-white font-semibold">Subtotal: {fmt(item.subtotal)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={addItem} className="mt-4 flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300">
              <Icon name="Plus" size={16} />Agregar ítem
            </button>
          </div>

          {/* Totales */}
          <div className="bg-[#1a2535] rounded-xl p-5 flex flex-col items-end gap-2">
            <div className="flex justify-between w-full max-w-xs">
              <span className="text-gray-400">Subtotal</span><span className="text-white">{fmt(subtotal)}</span>
            </div>
            <div className="flex justify-between w-full max-w-xs border-t border-white/10 pt-2">
              <span className="text-white font-bold text-lg">Total</span><span className="text-white font-bold text-lg">{fmt(total)}</span>
            </div>
          </div>
        </div>

        {showPdf && savedQuote && (
          <CrmDocumentPdf
            type="quote"
            document={savedQuote}
            business={business}
            customer={customers.find(c => c.id === (savedQuote.customer_id || customerId))}
            onClose={() => setShowPdf(false)}
          />
        )}
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
