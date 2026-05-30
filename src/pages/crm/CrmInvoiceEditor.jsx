import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { getCrmInvoice, createCrmInvoice, getCrmCustomers, formatInvoiceNumber } from '../../services/crmService';
import { getProducts } from '../../services/waBusinessService';
import CrmDocumentPdf from './CrmDocumentPdf';

const EMPTY_ITEM = { product_id: null, name: '', description: '', unit_price: 0, quantity: 1, discount_pct: 0, subtotal: 0 };

function calcSubtotal(unit_price, quantity, discount_pct) {
  const base = unit_price * quantity;
  return +(base - (base * discount_pct) / 100).toFixed(2);
}

export default function CrmInvoiceEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { business } = useAuth();
  const isNew = !id || id === 'nueva';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [showPdf, setShowPdf] = useState(false);

  const [customerId, setCustomerId] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);
  const [savedInvoice, setSavedInvoice] = useState(null);

  useEffect(() => {
    if (!business?.id) return;
    getCrmCustomers(business.id).then(r => setCustomers(r.data || []));
    getProducts(business.id).then(r => setProducts(r.data || []));
    if (!isNew) {
      getCrmInvoice(id).then(({ data }) => {
        if (!data) { navigate('/crm/facturas'); return; }
        setSavedInvoice(data);
        setCustomerId(data.customer_id || '');
        setIssueDate(data.issue_date || new Date().toISOString().slice(0, 10));
        setDueDate(data.due_date || '');
        setNotes(data.notes || '');
        setItems(data.crm_invoice_items?.length ? data.crm_invoice_items : [{ ...EMPTY_ITEM }]);
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
      next[idx] = { ...next[idx], product_id: p.id, name: p.name, description: p.description || '', unit_price: +(p.price || 0), subtotal: calcSubtotal(+(p.price || 0), next[idx].quantity, next[idx].discount_pct) };
      return next;
    });
  };

  const addItem = () => setItems(prev => [...prev, { ...EMPTY_ITEM }]);
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));
  const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
  const fmt = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: business?.currency || 'CLP', maximumFractionDigits: 0 }).format(n || 0);

  const handleSave = async () => {
    if (!items.some(i => i.name.trim())) { alert('Agrega al menos un ítem.'); return; }
    setSaving(true);
    const payload = {
      customerId: customerId || null,
      issueDate,
      dueDate: dueDate || null,
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
    const { data } = await createCrmInvoice(business.id, payload);
    setSaving(false);
    if (data?.id) navigate(`/crm/facturas/${data.id}`, { replace: true });
  };

  if (loading) return (
    <DashboardAppShell><DashboardLayoutContent>
      <div className="flex justify-center py-16"><Icon name="Loader2" size={32} className="animate-spin text-blue-400" /></div>
    </DashboardLayoutContent></DashboardAppShell>
  );

  const title = isNew ? 'Nueva factura' : `Factura ${savedInvoice?.invoice_number ? formatInvoiceNumber(savedInvoice.invoice_number) : ''}`;

  return (
    <DashboardAppShell>
      <DashboardLayoutContent>
        <PanelHeader
          title={title}
          icon="Receipt"
          action={
            <div className="flex gap-2">
              {!isNew && <button onClick={() => setShowPdf(true)} className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/15 text-white rounded-lg text-sm"><Icon name="Printer" size={15} />PDF</button>}
              {isNew && (
                <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
                  {saving ? <Icon name="Loader2" size={15} className="animate-spin" /> : <Icon name="Save" size={15} />}
                  Crear factura
                </button>
              )}
            </div>
          }
        />

        <div className="max-w-3xl space-y-6">
          <div className="bg-[#1a2535] rounded-xl p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Cliente</label>
              <select disabled={!isNew} value={customerId} onChange={e => setCustomerId(e.target.value)} className="w-full bg-[#0f1720] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50">
                <option value="">Sin cliente</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Fecha emisión</label>
              <input type="date" disabled={!isNew} value={issueDate} onChange={e => setIssueDate(e.target.value)} className="w-full bg-[#0f1720] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Vencimiento (opcional)</label>
              <input type="date" disabled={!isNew} value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full bg-[#0f1720] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm text-gray-400 mb-1">Notas</label>
              <textarea disabled={!isNew} value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full bg-[#0f1720] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none disabled:opacity-50" />
            </div>
          </div>

          {/* Ítems */}
          <div className="bg-[#1a2535] rounded-xl p-5">
            <h3 className="text-white font-semibold mb-4">Productos / Servicios</h3>
            {!isNew ? (
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
                    <div>
                      <p className="text-sm text-white">{item.name}</p>
                      <p className="text-xs text-gray-400">{item.quantity} × {fmt(item.unit_price)}{item.discount_pct > 0 ? ` (-${item.discount_pct}%)` : ''}</p>
                    </div>
                    <p className="text-white font-medium">{fmt(item.subtotal)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {items.map((item, idx) => (
                  <div key={idx} className="border border-white/10 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Ítem #{idx + 1}</span>
                      {items.length > 1 && <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-300"><Icon name="Trash2" size={15} /></button>}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Producto del catálogo (opcional)</label>
                        <select onChange={e => selectProduct(idx, e.target.value)} value={item.product_id || ''} className="w-full bg-[#0f1720] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                          <option value="">Escribir manual…</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Descripción *</label>
                        <input type="text" value={item.name} onChange={e => setItem(idx, 'name', e.target.value)} className="w-full bg-[#0f1720] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Precio unitario</label>
                        <input type="number" min="0" value={item.unit_price} onChange={e => setItem(idx, 'unit_price', +e.target.value)} className="w-full bg-[#0f1720] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Cantidad</label>
                        <input type="number" min="1" value={item.quantity} onChange={e => setItem(idx, 'quantity', +e.target.value)} className="w-full bg-[#0f1720] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Descuento %</label>
                        <input type="number" min="0" max="100" value={item.discount_pct} onChange={e => setItem(idx, 'discount_pct', +e.target.value)} className="w-full bg-[#0f1720] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                      </div>
                      <div className="flex items-end"><p className="text-white font-semibold">Subtotal: {fmt(item.subtotal)}</p></div>
                    </div>
                  </div>
                ))}
                <button onClick={addItem} className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"><Icon name="Plus" size={16} />Agregar ítem</button>
              </div>
            )}
          </div>

          <div className="bg-[#1a2535] rounded-xl p-5 flex flex-col items-end gap-2">
            <div className="flex justify-between w-full max-w-xs">
              <span className="text-gray-400">Subtotal</span><span className="text-white">{fmt(subtotal)}</span>
            </div>
            <div className="flex justify-between w-full max-w-xs border-t border-white/10 pt-2">
              <span className="text-white font-bold text-lg">Total</span><span className="text-white font-bold text-lg">{fmt(subtotal)}</span>
            </div>
          </div>
        </div>

        {showPdf && savedInvoice && (
          <CrmDocumentPdf
            type="invoice"
            document={savedInvoice}
            business={business}
            customer={customers.find(c => c.id === savedInvoice.customer_id)}
            onClose={() => setShowPdf(false)}
          />
        )}
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
