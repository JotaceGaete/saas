import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import {
  getCrmQuote,
  createCrmQuote,
  updateCrmQuote,
  getCrmCustomers,
  formatQuoteNumber,
  getQuoteDocLabel,
} from '../../services/crmService';
import { getProducts } from '../../services/waBusinessService';
import CrmDocumentPdf from './CrmDocumentPdf';
import {
  CrmLineItemCard,
  CrmLineItemTableRow,
  calcItemSubtotal,
  EMPTY_ITEM,
  fmtCLP,
} from './components/CrmLineItemRow';
import { formatMoney } from '../../utils/formatMoney';
import { CrmProductSearchModal } from './components/CrmProductSearchModal';
import { ChileanDateInput } from './components/ChileanDateInput';

const MANUAL_CHARGES = [
  { name: 'Flete', icon: 'Truck' },
  { name: 'Embalaje', icon: 'Package2' },
  { name: 'Diseño', icon: 'Pen' },
  { name: 'Instalación', icon: 'Wrench' },
  { name: 'Servicio técnico', icon: 'Settings' },
  { name: 'Otro', icon: 'Plus' },
];

const fieldClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

export default function CrmQuoteEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { business } = useAuth();
  const isNew = !id || id === 'nuevo';
  const chargeMenuRef = useRef(null);

  const [pageLoading, setPageLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [showPdf, setShowPdf] = useState(false);
  const [saved, setSaved] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [showProductModal, setShowProductModal] = useState(false);
  const [showChargeMenu, setShowChargeMenu] = useState(false);

  const [customerId, setCustomerId] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]);
  const [paymentTerms, setPaymentTerms] = useState('');
  const [deliveryDays, setDeliveryDays] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState('');
  const [commercialNotes, setCommercialNotes] = useState('');

  useEffect(() => {
    if (!business?.id) return;
    getCrmCustomers(business.id).then((r) => setCustomers(r.data || []));
    getProducts(business.id).then((r) => setProducts(r.data || []));
    if (!isNew) {
      getCrmQuote(id).then(({ data, error }) => {
        if (error || !data) { navigate('/crm/presupuestos'); return; }
        setSaved(data);
        setCustomerId(data.customer_id || '');
        setValidUntil(data.valid_until || '');
        setNotes(data.notes || '');
        setItems(data.crm_quote_items?.length ? data.crm_quote_items.map((it) => ({ ...it })) : []);
        setPaymentTerms(data.payment_terms || '');
        setDeliveryDays(data.delivery_days || '');
        setDeliveryMethod(data.delivery_method || '');
        setCommercialNotes(data.commercial_notes || '');
        setPageLoading(false);
      });
    }
  }, [business?.id, id, isNew]);

  useEffect(() => {
    if (!showChargeMenu) return;
    const handler = (e) => {
      if (chargeMenuRef.current && !chargeMenuRef.current.contains(e.target)) {
        setShowChargeMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showChargeMenu]);

  const handleItemChange = (idx, updated) =>
    setItems((prev) => { const n = [...prev]; n[idx] = updated; return n; });
  const handleItemRemove = (idx) =>
    setItems((prev) => prev.filter((_, i) => i !== idx));

  const addProductFromCatalog = (product) => {
    setItems((prev) => [
      ...prev,
      {
        product_id: product.id,
        name: product.name,
        description: product.description || '',
        unit_price: +(product.price || 0),
        quantity: 1,
        discount_pct: 0,
        subtotal: calcItemSubtotal(+(product.price || 0), 1, 0),
      },
    ]);
    setShowProductModal(false);
  };

  const addManualCharge = (name) => {
    setItems((prev) => [...prev, { ...EMPTY_ITEM, name: name === 'Otro' ? '' : name }]);
    setShowChargeMenu(false);
  };

  const subtotal = items.reduce((s, i) => s + (i.subtotal || 0), 0);
  const discountTotal = items.reduce((s, i) => {
    const base = (i.unit_price || 0) * (i.quantity || 1);
    if (i.discount_type === 'fixed') return s + Math.min(i.discount_pct || 0, base);
    return s + (base * (i.discount_pct || 0)) / 100;
  }, 0);

  // Documento para vista previa — funciona con o sin guardado previo
  const previewDoc = {
    ...(saved || {}),
    quote_number:    saved?.quote_number    ?? null,
    status:          saved?.status          || 'borrador',
    total:           subtotal,
    discount_amount: discountTotal,
    notes,
    valid_until:     validUntil,
    created_at:      saved?.created_at || new Date().toISOString(),
    crm_quote_items: items,
    payment_terms:   paymentTerms,
    delivery_days:   deliveryDays,
    delivery_method: deliveryMethod,
    commercial_notes: commercialNotes,
  };

  const fmt = (n) => formatMoney(n, business?.currency);

  const buildPayload = () => ({
    customerId: customerId || null,
    validUntil: validUntil || null,
    notes: notes || null,
    paymentTerms: paymentTerms || null,
    deliveryDays: deliveryDays || null,
    deliveryMethod: deliveryMethod || null,
    commercialNotes: commercialNotes || null,
    items: items
      .filter((i) => i.name?.trim())
      .map((i, idx) => ({
        product_id: i.product_id || null,
        name: i.name.trim(),
        description: i.description || null,
        unit_price: +(i.unit_price || 0),
        quantity: +(i.quantity || 1),
        discount_pct: +(i.discount_pct || 0),
        discount_type: i.discount_type || 'percentage',
        sort_order: idx,
      })),
  });

  const handleSave = async () => {
    setSaveError('');
    const payload = buildPayload();
    if (!payload.items.length) {
      setSaveError('Agrega al menos un ítem con descripción.');
      return;
    }
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

  const docLabel = getQuoteDocLabel(business?.documentTitleType);
  const docTitle = isNew
    ? docLabel.nuevo
    : `${docLabel.title} ${saved ? formatQuoteNumber(saved.quote_number, business?.documentTitleType) : ''}`;

  const pdfCustomer = customers.find((c) => c.id === (saved?.customer_id || customerId));

  if (pageLoading) {
    return (
      <DashboardAppShell>
        <div className="flex justify-center py-20">
          <Icon name="Loader2" size={32} className="animate-spin text-blue-500" />
        </div>
      </DashboardAppShell>
    );
  }

  const getItemImage = (item) => {
    if (!item.product_id) return null;
    const p = products.find(pr => pr.id === item.product_id);
    return p?.cardImageUrl || p?.imageUrl || null;
  };

  // ─── Sección de ítems compartida ───────────────────────────────────────────
  const ItemsSection = (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">Productos y servicios</h3>
        {items.length > 0 && (
          <span className="text-xs text-gray-400">{items.length} ítem{items.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">
          Aún no hay ítems. Agregá un producto o un cargo manual.
        </p>
      ) : (
        <>
          {/* Desktop: tabla compacta */}
          <div className="hidden sm:block overflow-x-auto mb-4">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide pb-2 pr-3">Producto / Descripción</th>
                  <th className="text-center text-xs font-medium text-gray-400 uppercase tracking-wide pb-2 px-2 w-20">Cant.</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide pb-2 px-2 w-32">Precio unit.</th>
                  <th className="text-center text-xs font-medium text-gray-400 uppercase tracking-wide pb-2 px-2 w-44">Desc.</th>
                  <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wide pb-2 px-2 w-28">Total</th>
                  <th className="w-8 pb-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <CrmLineItemTableRow
                    key={idx}
                    item={item}
                    idx={idx}
                    onChange={handleItemChange}
                    onRemove={handleItemRemove}
                    imageUrl={getItemImage(item)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards apiladas */}
          <div className="sm:hidden space-y-3 mb-4">
            {items.map((item, idx) => (
              <CrmLineItemCard
                key={idx}
                item={item}
                idx={idx}
                onChange={handleItemChange}
                onRemove={handleItemRemove}
                imageUrl={getItemImage(item)}
              />
            ))}
          </div>
        </>
      )}

      {/* Botones agregar */}
      <div className="flex flex-col sm:flex-row gap-2 mt-2">
        <button
          type="button"
          onClick={() => setShowProductModal(true)}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-blue-200 text-blue-600 hover:border-blue-400 hover:bg-blue-50 text-sm font-medium transition-colors"
        >
          <Icon name="Search" size={15} />
          Producto del catálogo
        </button>

        <div className="relative flex-1" ref={chargeMenuRef}>
          <button
            type="button"
            onClick={() => setShowChargeMenu((v) => !v)}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-gray-600 hover:border-gray-400 hover:bg-gray-50 text-sm font-medium transition-colors"
          >
            <Icon name="Plus" size={15} />
            Cargo manual
            <Icon name="ChevronDown" size={13} />
          </button>

          {showChargeMenu && (
            <div className="absolute bottom-full mb-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-10">
              {MANUAL_CHARGES.map((charge) => (
                <button
                  key={charge.name}
                  type="button"
                  onClick={() => addManualCharge(charge.name)}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-700 transition-colors border-b border-gray-50 last:border-0"
                >
                  <Icon name={charge.icon} size={14} color="#9ca3af" />
                  {charge.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <DashboardAppShell>
      <PanelHeader
        title={
          <h1
            className="text-base font-bold"
            style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}
          >
            {docTitle}
          </h1>
        }
        leftAction={
          <button
            onClick={() => navigate('/crm/presupuestos')}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
          >
            <Icon name="ChevronLeft" size={20} />
          </button>
        }
        leftSpacer={false}
        mobileActions={
          <div className="flex gap-2 w-full">
            {items.length > 0 && (
              <button
                onClick={() => setShowPdf(true)}
                className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium"
              >
                <Icon name="Eye" size={15} />
                Vista previa
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-60"
            >
              {saving ? <Icon name="Loader2" size={15} className="animate-spin" /> : <Icon name="Save" size={15} />}
              {isNew ? docLabel.crear : 'Guardar'}
            </button>
          </div>
        }
      >
        {/* Desktop: botones inline a la derecha */}
        {items.length > 0 && (
          <button
            onClick={() => setShowPdf(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium"
          >
            <Icon name="Eye" size={15} />
            Vista previa
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
      </PanelHeader>

      <DashboardLayoutContent>
        <div className="max-w-3xl space-y-6">
          {saveError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <Icon name="AlertCircle" size={16} />{saveError}
            </div>
          )}

          {/* Datos del presupuesto */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Datos del {docLabel.singular}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">Sin cliente asignado</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.company?.trim() && c.company.trim().toLowerCase() !== 'sin empresa' ? ` — ${c.company}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Válido hasta</label>
                <ChileanDateInput
                  value={validUntil}
                  onChange={setValidUntil}
                  className={fieldClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas (visibles en el PDF)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Observaciones generales…"
                  className={`${fieldClass} resize-none`}
                />
              </div>
            </div>
          </div>

          {/* Condiciones comerciales */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">
              Condiciones comerciales{' '}
              <span className="text-gray-400 font-normal">(opcionales)</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Forma de pago</label>
                <input type="text" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="Ej: 50% anticipo, 50% contra entrega" className={fieldClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plazo de entrega</label>
                <input type="text" value={deliveryDays} onChange={(e) => setDeliveryDays(e.target.value)} placeholder="Ej: 5 días hábiles" className={fieldClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Método de entrega</label>
                <input type="text" value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value)} placeholder="Ej: Despacho a domicilio, Retiro en tienda" className={fieldClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones comerciales</label>
                <input type="text" value={commercialNotes} onChange={(e) => setCommercialNotes(e.target.value)} placeholder="Ej: Precios no incluyen IVA" className={fieldClass} />
              </div>
            </div>
          </div>

          {ItemsSection}

          {/* Totales */}
          <div className="rounded-xl overflow-hidden bg-gray-900">
            {discountTotal > 0 && (
              <div className="flex justify-between items-center px-5 py-3 border-b border-white/10">
                <span className="text-sm text-gray-400">Subtotal bruto</span>
                <span className="text-sm text-gray-300">{fmt(subtotal + discountTotal)}</span>
              </div>
            )}
            {discountTotal > 0 && (
              <div className="flex justify-between items-center px-5 py-3 border-b border-white/10">
                <span className="text-sm text-gray-400">Descuentos</span>
                <span className="text-sm text-green-400">−{fmt(discountTotal)}</span>
              </div>
            )}
            <div className="flex justify-between items-center px-5 py-4">
              <span className="text-base font-semibold text-white">Total</span>
              <span className="text-xl font-bold text-white">{fmt(subtotal)}</span>
            </div>
          </div>

          {saveError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <Icon name="AlertCircle" size={16} />{saveError}
            </div>
          )}
          <div className="flex flex-col sm:flex-row sm:justify-end gap-3 pb-8">
            <button
              onClick={() => navigate('/crm/presupuestos')}
              className="w-full sm:w-auto px-5 py-3 sm:py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium text-center transition-colors"
            >
              Cancelar
            </button>
            {items.length > 0 && (
              <button
                onClick={() => setShowPdf(true)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 sm:py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium transition-colors"
              >
                <Icon name="Eye" size={15} />
                Vista previa
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 sm:py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-60 transition-colors"
            >
              {saving ? <Icon name="Loader2" size={15} className="animate-spin" /> : <Icon name="CheckCircle" size={15} />}
              {isNew ? docLabel.crear : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </DashboardLayoutContent>

      {showProductModal && (
        <CrmProductSearchModal
          products={products}
          onSelect={addProductFromCatalog}
          onClose={() => setShowProductModal(false)}
        />
      )}

      {showPdf && (
        <CrmDocumentPdf
          type="quote"
          document={previewDoc}
          business={business}
          customer={pdfCustomer}
          onClose={() => setShowPdf(false)}
        />
      )}
    </DashboardAppShell>
  );
}
