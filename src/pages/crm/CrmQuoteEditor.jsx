import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import {
  getCrmQuote, createCrmQuote, updateCrmQuote,
  getCrmCustomers, formatQuoteNumber,
} from '../../services/crmService';
import { getProducts } from '../../services/waBusinessService';
import CrmDocumentPdf from './CrmDocumentPdf';

function calcItemSubtotal(unitPrice, quantity, discountPct) {
  const base = (unitPrice || 0) * (quantity || 1);
  return +(base - (base * (discountPct || 0)) / 100).toFixed(2);
}

const EMPTY_ITEM = { product_id: null, name: '', description: '', unit_price: 0, quantity: 1, discount_pct: 0, subtotal: 0 };

function ItemRow({ item, idx, products, onChange, onRemove, isLast }) {
  const handleProductSelect = (productId) => {
    if (!productId) return;
    const p = products.find(pr => pr.id === productId);
    if (!p) return;
    onChange(idx, {
      product_id: p.id,
      name: p.name,
      description: p.description || '',
      unit_price: +(p.price || 0),
      quantity: item.quantity || 1,
      discount_pct: item.discount_pct || 0,
      subtotal: calcItemSubtotal(+(p.price || 0), item.quantity || 1, item.discount_pct || 0),
    });
  };

  const set = (key, val) => {
    const next = { ...item, [key]: val };
    next.subtotal = calcItemSubtotal(+next.unit_price, +next.quantity, +next.discount_pct);
    onChange(idx, next);
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ítem {idx + 1}</span>
        <button onClick={() => onRemove(idx)} className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50" title="Eliminar ítem">
          <Icon name="Trash2" size={15} />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Selector de producto del catálogo */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Producto del catálogo (opcional)</label>
          <select
            onChange={e => handleProductSelect(e.target.value)}
            value={item.product_id || ''}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">— Seleccionar o completar manual —</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>{p.name} · {new Intl.NumberFormat('es-CL').format(p.price)}</option>
            ))}
          </select>
        </div>
        {/* Nombre / descripción */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Descripción del ítem *</label>
          <input
            type="text"
            placeholder="Ej: Flete, Diseño, Servicio…"
            value={item.name}
            onChange={e => set('name', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {/* Precio unitario */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Precio unitario</label>
          <input
            type="number" min="0" step="1"
            value={item.unit_price}
            onChange={e => set('unit_price', +e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {/* Cantidad */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Cantidad</label>
          <input
            type="number" min="1" step="1"
            value={item.quantity}
            onChange={e => set('quantity', Math.max(1, +e.target.value))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {/* Descuento */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Descuento %</label>
          <input
            type="number" min="0" max="100" step="0.5"
            value={item.discount_pct}
            onChange={e => set('discount_pct', Math.min(100, Math.max(0, +e.target.value)))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {/* Subtotal */}
        <div className="flex items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Subtotal</label>
            <p className="text-base font-bold text-gray-900">
              {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(item.subtotal)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CrmQuoteEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { business } = useAuth();
  const isNew = !id || id === 'nuevo';

  const [pageLoading, setPageLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [showPdf, setShowPdf] = useState(false);
  const [saved, setSaved] = useState(null);
  const [saveError, setSaveError] = useState('');

  // Campos del documento
  const [customerId, setCustomerId] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);
  // Condiciones comerciales
  const [paymentTerms, setPaymentTerms] = useState('');
  const [deliveryDays, setDeliveryDays] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState('');
  const [commercialNotes, setCommercialNotes] = useState('');

  useEffect(() => {
    if (!business?.id) return;
    getCrmCustomers(business.id).then(r => setCustomers(r.data || []));
    getProducts(business.id).then(r => setProducts(r.data || []));
    if (!isNew) {
      getCrmQuote(id).then(({ data, error }) => {
        if (error || !data) { navigate('/crm/presupuestos'); return; }
        setSaved(data);
        setCustomerId(data.customer_id || '');
        setValidUntil(data.valid_until || '');
        setNotes(data.notes || '');
        setItems(data.crm_quote_items?.length ? data.crm_quote_items.map(it => ({ ...it })) : [{ ...EMPTY_ITEM }]);
        setPaymentTerms(data.payment_terms || '');
        setDeliveryDays(data.delivery_days || '');
        setDeliveryMethod(data.delivery_method || '');
        setCommercialNotes(data.commercial_notes || '');
        setPageLoading(false);
      });
    }
  }, [business?.id, id, isNew]);

  const handleItemChange = (idx, updated) => setItems(prev => { const n = [...prev]; n[idx] = updated; return n; });
  const handleItemRemove = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));
  const addItem = () => setItems(prev => [...prev, { ...EMPTY_ITEM }]);

  const subtotal = items.reduce((s, i) => s + (i.subtotal || 0), 0);
  const discountTotal = items.reduce((s, i) => {
    const base = (i.unit_price || 0) * (i.quantity || 1);
    return s + base * (i.discount_pct || 0) / 100;
  }, 0);

  const fmt = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: business?.currency || 'CLP', maximumFractionDigits: 0 }).format(n || 0);

  const buildPayload = () => ({
    customerId: customerId || null,
    validUntil: validUntil || null,
    notes: notes || null,
    paymentTerms: paymentTerms || null,
    deliveryDays: deliveryDays || null,
    deliveryMethod: deliveryMethod || null,
    commercialNotes: commercialNotes || null,
    items: items
      .filter(i => i.name?.trim())
      .map((i, idx) => ({
        product_id: i.product_id || null,
        name: i.name.trim(),
        description: i.description || null,
        unit_price: +(i.unit_price || 0),
        quantity: +(i.quantity || 1),
        discount_pct: +(i.discount_pct || 0),
        sort_order: idx,
      })),
  });

  const handleSave = async () => {
    setSaveError('');
    const payload = buildPayload();
    if (!payload.items.length) { setSaveError('Agrega al menos un ítem con descripción.'); return; }
    setSaving(true);
    if (isNew) {
      const { data, error } = await createCrmQuote(business.id, payload);
      setSaving(false);
      if (error) { setSaveError(error.message || 'Error al guardar.'); return; }
      navigate(`/crm/presupuestos/${data.id}`, { replace: true });
    } else {
      const { data, error } = await updateCrmQuote(id, payload);
      setSaving(false);
      if (error) { setSaveError(error.message || 'Error al guardar.'); return; }
      setSaved(data);
    }
  };

  const docTitle = isNew
    ? 'Nuevo presupuesto'
    : `Presupuesto ${saved ? formatQuoteNumber(saved.quote_number) : ''}`;

  const pdfCustomer = customers.find(c => c.id === (saved?.customer_id || customerId));

  if (pageLoading) return (
    <DashboardAppShell>
      <div className="flex justify-center py-20"><Icon name="Loader2" size={32} className="animate-spin text-blue-500" /></div>
    </DashboardAppShell>
  );

  return (
    <DashboardAppShell>
      <PanelHeader
        title={<h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>{docTitle}</h1>}
        leftAction={
          <button onClick={() => navigate('/crm/presupuestos')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            <Icon name="ChevronLeft" size={20} />
          </button>
        }
        leftSpacer={false}
      >
        <div className="flex items-center gap-2">
          {!isNew && (
            <button
              onClick={() => setShowPdf(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium"
            >
              <Icon name="FileDown" size={15} />PDF
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-60"
          >
            {saving ? <Icon name="Loader2" size={15} className="animate-spin" /> : <Icon name="Save" size={15} />}
            {isNew ? 'Crear presupuesto' : 'Guardar cambios'}
          </button>
        </div>
      </PanelHeader>

      <DashboardLayoutContent>
        <div className="max-w-3xl space-y-6">
          {saveError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <Icon name="AlertCircle" size={16} />
              {saveError}
            </div>
          )}

          {/* Cabecera del documento */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Datos del presupuesto</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                <select
                  value={customerId}
                  onChange={e => setCustomerId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Sin cliente asignado</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Válido hasta</label>
                <input
                  type="date"
                  value={validUntil}
                  onChange={e => setValidUntil(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas (visibles en el PDF)</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Observaciones generales…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>
          </div>

          {/* Condiciones comerciales */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Condiciones comerciales <span className="text-gray-400 font-normal">(opcionales)</span></h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Forma de pago</label>
                <input type="text" value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} placeholder="Ej: 50% anticipo, 50% contra entrega" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plazo de entrega</label>
                <input type="text" value={deliveryDays} onChange={e => setDeliveryDays(e.target.value)} placeholder="Ej: 5 días hábiles" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Método de entrega</label>
                <input type="text" value={deliveryMethod} onChange={e => setDeliveryMethod(e.target.value)} placeholder="Ej: Despacho a domicilio, Retiro en tienda" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones comerciales</label>
                <input type="text" value={commercialNotes} onChange={e => setCommercialNotes(e.target.value)} placeholder="Ej: Precios no incluyen IVA" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>

          {/* Ítems */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700">Productos y servicios</h3>
              <span className="text-xs text-gray-400">{items.length} ítem{items.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="space-y-3">
              {items.map((item, idx) => (
                <ItemRow
                  key={idx}
                  item={item}
                  idx={idx}
                  products={products}
                  onChange={handleItemChange}
                  onRemove={handleItemRemove}
                  isLast={items.length === 1}
                />
              ))}
            </div>
            <button
              onClick={addItem}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600 text-sm font-medium w-full justify-center transition-colors"
            >
              <Icon name="Plus" size={16} />
              Agregar ítem (producto, flete, servicio, etc.)
            </button>
          </div>

          {/* Totales */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex flex-col items-end gap-2 max-w-xs ml-auto">
              <div className="flex justify-between w-full text-sm">
                <span className="text-gray-500">Subtotal bruto</span>
                <span className="text-gray-700">{fmt(subtotal + discountTotal)}</span>
              </div>
              {discountTotal > 0 && (
                <div className="flex justify-between w-full text-sm">
                  <span className="text-gray-500">Descuentos</span>
                  <span className="text-green-600">-{fmt(discountTotal)}</span>
                </div>
              )}
              <div className="flex justify-between w-full border-t border-gray-200 pt-2">
                <span className="font-bold text-gray-900 text-base">Total</span>
                <span className="font-bold text-gray-900 text-base">{fmt(subtotal)}</span>
              </div>
            </div>
          </div>

          {/* Guardar (también al pie para UX en móvil) */}
          {saveError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <Icon name="AlertCircle" size={16} />{saveError}
            </div>
          )}
          <div className="flex justify-end gap-3 pb-6">
            <button onClick={() => navigate('/crm/presupuestos')} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm">
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-60"
            >
              {saving ? <Icon name="Loader2" size={15} className="animate-spin" /> : <Icon name="Save" size={15} />}
              {isNew ? 'Crear presupuesto' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </DashboardLayoutContent>

      {showPdf && saved && (
        <CrmDocumentPdf
          type="quote"
          document={{ ...saved, crm_quote_items: items }}
          business={business}
          customer={pdfCustomer}
          extra={{ paymentTerms, deliveryDays, deliveryMethod, commercialNotes }}
          onClose={() => setShowPdf(false)}
        />
      )}
    </DashboardAppShell>
  );
}
