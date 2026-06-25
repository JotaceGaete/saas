import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import {
  getCrmInvoice,
  createCrmInvoice,
  updateCrmInvoice,
  getCrmCustomers,
  createCrmCustomer,
  formatInvoiceNumber,
  updateCrmInvoiceStatus,
  updateDocumentAdminFields,
  getDocumentChanges,
} from '../../services/crmService';
import { getProducts } from '../../services/waBusinessService';
import { listAllPaymentsByInvoice, createPayment } from '../../services/crmPaymentsService';
import { voidCrmPayment } from '../../services/crmService';
import VoidPaymentModal from './components/VoidPaymentModal';
import CrmDocumentPdf from './CrmDocumentPdf';
import {
  CrmLineItemCard,
  CrmLineItemTableRow,
  CrmLineItemReadOnly,
  calcItemSubtotal,
  EMPTY_ITEM,
} from './components/CrmLineItemRow';
import { formatMoney } from '../../utils/formatMoney';
import { CrmProductSearchModal } from './components/CrmProductSearchModal';
import { ChileanDateInput } from './components/ChileanDateInput';
import { QuickCustomerModal } from './components/QuickCustomerModal';

const STATUS_STYLES = {
  pendiente: 'bg-yellow-100 text-yellow-700',
  parcial: 'bg-amber-100 text-amber-700',
  pagada: 'bg-green-100 text-green-700',
  anulada: 'bg-red-100 text-red-600',
};

const PAYMENT_METHOD_LABELS = {
  cash: 'Efectivo',
  bank_transfer: 'Transferencia',
  card: 'Tarjeta',
  check: 'Cheque',
  other: 'Otro',
};

const ADMIN_FIELD_LABELS = {
  notes: 'Notas',
  payment_terms: 'Forma de pago',
  delivery_days: 'Plazo de entrega',
  delivery_method: 'Método de entrega',
  commercial_notes: 'Observaciones comerciales',
  purchase_order_number: 'N° OC',
  dispatch_instructions: 'Instrucciones de despacho',
};

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
const fieldClassDisabled =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50';

export default function CrmInvoiceEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { business } = useAuth();
  const isNew = !id || id === 'nueva';
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
  const [showNewCustomer, setShowNewCustomer] = useState(false);

  // Pagos
  const [payments, setPayments] = useState([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_date: new Date().toISOString().slice(0, 10),
    payment_method: 'bank_transfer',
    reference: '',
    notes: '',
  });
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [markingPaid, setMarkingPaid] = useState(false);
  const [voidingPayment, setVoidingPayment] = useState(null);
  const [voidBusy, setVoidBusy] = useState(false);
  const [voidError, setVoidError] = useState('');

  // Campos financieros (bloqueados cuando hay pagos o no es pendiente)
  const [customerId, setCustomerId] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [items, setItems] = useState([]);

  // Campos administrativos (editables mientras no esté anulada)
  const [notes, setNotes] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [deliveryDays, setDeliveryDays] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState('');
  const [commercialNotes, setCommercialNotes] = useState('');
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState('');
  const [dispatchInstructions, setDispatchInstructions] = useState('');

  // Admin save state
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminSaveError, setAdminSaveError] = useState('');
  const [adminSaveSuccess, setAdminSaveSuccess] = useState(false);

  // Change history
  const [changeHistory, setChangeHistory] = useState([]);
  const [showChangeHistory, setShowChangeHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (!business?.id) return;
    getCrmCustomers(business.id).then((r) => setCustomers(r.data || []));
    getProducts(business.id).then((r) => setProducts(r.data || []));
    if (!isNew) {
      getCrmInvoice(id).then(({ data, error }) => {
        if (error || !data) { navigate('/crm/facturas'); return; }
        setSaved(data);
        setCustomerId(data.customer_id || '');
        setIssueDate(data.issue_date || new Date().toISOString().slice(0, 10));
        setDueDate(data.due_date || '');
        setNotes(data.notes || '');
        setItems(data.crm_invoice_items?.length ? data.crm_invoice_items.map((it) => ({ ...it })) : []);
        setPaymentTerms(data.payment_terms || '');
        setDeliveryDays(data.delivery_days || '');
        setDeliveryMethod(data.delivery_method || '');
        setCommercialNotes(data.commercial_notes || '');
        setPurchaseOrderNumber(data.purchase_order_number || '');
        setDispatchInstructions(data.dispatch_instructions || '');
        setPageLoading(false);
        listAllPaymentsByInvoice(id).then((r) => setPayments(r.data || []));
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
    const b = (i.unit_price || 0) * (i.quantity || 1);
    if (i.discount_type === 'fixed') return s + Math.min(i.discount_pct || 0, b);
    return s + (b * (i.discount_pct || 0)) / 100;
  }, 0);

  const activePayments = payments.filter((p) => !p.voided_at);
  const canEditFinancial = isNew || (saved?.status === 'pendiente' && activePayments.length === 0);
  const canEditAdmin = !isNew && saved?.status !== 'anulada';

  // Documento para vista previa — funciona con o sin guardado previo
  const previewDoc = {
    ...(saved || {}),
    invoice_number:       saved?.invoice_number  ?? null,
    status:               saved?.status          || 'pendiente',
    total:                subtotal,
    discount_amount:      discountTotal,
    notes,
    issue_date:           issueDate,
    due_date:             dueDate || null,
    crm_invoice_items:    items,
    payment_terms:        paymentTerms,
    delivery_days:        deliveryDays,
    delivery_method:      deliveryMethod,
    commercial_notes:     commercialNotes,
    purchase_order_number: purchaseOrderNumber,
    dispatch_instructions: dispatchInstructions,
  };

  const fmt = (n) => formatMoney(n, business?.currency);

  const handleCreateCustomer = async (fields) => {
    const { data, error } = await createCrmCustomer(business.id, fields);
    if (error) return { error };
    setCustomers(prev => [data, ...prev]);
    setCustomerId(data.id);
    setShowNewCustomer(false);
    return { data };
  };

  const handleMarkPaid = async () => {
    setMarkingPaid(true);
    await updateCrmInvoiceStatus(id, 'pagada');
    setSaved((prev) => ({ ...prev, status: 'pagada' }));
    setMarkingPaid(false);
  };

  const handlePaymentSave = async () => {
    setPaymentError('');
    const amount = parseFloat(paymentForm.amount);
    if (!amount || amount <= 0) { setPaymentError('Ingresa un monto válido.'); return; }
    if (!paymentForm.payment_date) { setPaymentError('Selecciona una fecha.'); return; }
    setPaymentSaving(true);
    const { data, error } = await createPayment({
      business_id: business.id,
      customer_id: saved?.customer_id || null,
      invoice_id: id,
      amount,
      payment_method: paymentForm.payment_method,
      payment_date: paymentForm.payment_date,
      reference: paymentForm.reference || null,
      notes: paymentForm.notes || null,
    });
    setPaymentSaving(false);
    if (error) { setPaymentError(error.code === 'CASH_SESSION_REQUIRED' ? 'CASH_SESSION_REQUIRED' : (error.message || 'Error al registrar pago.')); return; }
    const [paymentsRes, invoiceRes] = await Promise.all([
      listAllPaymentsByInvoice(id),
      getCrmInvoice(id),
    ]);
    setPayments(paymentsRes.data || [data, ...payments]);
    if (invoiceRes.data) setSaved((prev) => ({ ...prev, ...invoiceRes.data }));
    setShowPaymentModal(false);
    setPaymentForm({
      amount: '',
      payment_date: new Date().toISOString().slice(0, 10),
      payment_method: 'bank_transfer',
      reference: '',
      notes: '',
    });
  };

  const handleVoidPayment = async (reason) => {
    setVoidBusy(true);
    setVoidError('');
    const { error } = await voidCrmPayment(voidingPayment.id, reason, business?.id);
    setVoidBusy(false);
    if (error) {
      setVoidError(error.code === 'CASH_SESSION_REQUIRED' ? 'CASH_SESSION_REQUIRED' : (error.message || 'Error al anular pago.'));
      return;
    }
    const [paymentsRes, invoiceRes] = await Promise.all([
      listAllPaymentsByInvoice(id),
      getCrmInvoice(id),
    ]);
    setPayments(paymentsRes.data || []);
    if (invoiceRes.data) setSaved(prev => ({ ...prev, ...invoiceRes.data }));
    setVoidingPayment(null);
  };

  const handleSave = async () => {
    setSaveError('');
    if (!canEditFinancial) {
      setSaveError('Este documento no se puede editar en su estado actual.');
      return;
    }
    const validItems = items.filter((i) => i.name?.trim());
    if (!validItems.length) {
      setSaveError('Agrega al menos un ítem con descripción.');
      return;
    }
    const payload = {
      customerId: customerId || null,
      issueDate,
      dueDate: dueDate || null,
      notes: notes || null,
      paymentTerms: paymentTerms || null,
      deliveryDays: deliveryDays || null,
      deliveryMethod: deliveryMethod || null,
      commercialNotes: commercialNotes || null,
      purchaseOrderNumber: purchaseOrderNumber || null,
      dispatchInstructions: dispatchInstructions || null,
      items: validItems.map((i, idx) => ({
        product_id: i.product_id || null,
        name: i.name.trim(),
        description: i.description || null,
        unit_price: +(i.unit_price || 0),
        quantity: +(i.quantity || 1),
        discount_pct: +(i.discount_pct || 0),
        discount_type: i.discount_type || 'percentage',
        sort_order: idx,
      })),
    };

    setSaving(true);
    const { data, error } = isNew
      ? await createCrmInvoice(business.id, payload)
      : await updateCrmInvoice(id, payload);
    setSaving(false);
    if (error) { setSaveError(error.message || 'Error al guardar.'); return; }
    if (isNew) {
      navigate(`/crm/facturas/${data.id}`, { replace: true });
    } else {
      setSaved((prev) => ({ ...prev, ...data }));
    }
  };

  const handleAdminSave = async () => {
    setAdminSaveError('');
    setAdminSaveSuccess(false);
    if (!canEditAdmin) return;
    setAdminSaving(true);
    const fields = { notes, paymentTerms, deliveryDays, deliveryMethod, commercialNotes, purchaseOrderNumber, dispatchInstructions };
    const prevValues = {
      notes: saved?.notes || '',
      paymentTerms: saved?.payment_terms || '',
      deliveryDays: saved?.delivery_days || '',
      deliveryMethod: saved?.delivery_method || '',
      commercialNotes: saved?.commercial_notes || '',
      purchaseOrderNumber: saved?.purchase_order_number || '',
      dispatchInstructions: saved?.dispatch_instructions || '',
    };
    const { data, error } = await updateDocumentAdminFields('invoice', id, business.id, fields, prevValues);
    setAdminSaving(false);
    if (error) { setAdminSaveError(error.message || 'Error al guardar.'); return; }
    setSaved((prev) => ({ ...prev, ...data }));
    setAdminSaveSuccess(true);
    setTimeout(() => setAdminSaveSuccess(false), 3000);
    // Refresh change history if visible
    if (showChangeHistory) loadChangeHistory();
  };

  const loadChangeHistory = async () => {
    setHistoryLoading(true);
    const { data } = await getDocumentChanges('invoice', id);
    setChangeHistory(data || []);
    setHistoryLoading(false);
  };

  const handleToggleHistory = () => {
    if (!showChangeHistory) loadChangeHistory();
    setShowChangeHistory((v) => !v);
  };

  const docTitle = isNew
    ? 'Nueva factura interna'
    : `Factura ${saved ? formatInvoiceNumber(saved.invoice_number) : ''}`;

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

  // ─── Sección de ítems editable ─────────────────────────────────────────────
  const EditableItemsSection = (
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

  const ReadOnlyItemsSection = (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">Productos y servicios</h3>
        <span className="text-xs text-gray-400">{items.length} ítem{items.length !== 1 ? 's' : ''}</span>
      </div>
      <div>
        {items.map((item, idx) => (
          <CrmLineItemReadOnly key={idx} item={item} imageUrl={getItemImage(item)} />
        ))}
      </div>
    </div>
  );

  // ─── Sección administrativa (siempre visible cuando canEditAdmin) ──────────
  const AdminSection = canEditAdmin ? (
    <div className="bg-white border border-blue-100 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Icon name="Pencil" size={15} className="text-blue-500" />
        <h3 className="text-sm font-semibold text-gray-700">Información administrativa</h3>
        <span className="ml-auto text-xs text-blue-500 font-medium">Siempre editable</span>
      </div>
      <p className="text-xs text-gray-400 mb-4">Estos campos se pueden actualizar aunque el documento esté pagado o aprobado.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">N° OC del cliente</label>
          <input type="text" value={purchaseOrderNumber} onChange={(e) => setPurchaseOrderNumber(e.target.value)} placeholder="Ej: OC-2026-0042" className={fieldClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Instrucciones de despacho</label>
          <input type="text" value={dispatchInstructions} onChange={(e) => setDispatchInstructions(e.target.value)} placeholder="Ej: Entregar en bodega 3, contactar a Juan" className={fieldClass} />
        </div>
      </div>

      {adminSaveError && (
        <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{adminSaveError}</p>
      )}
      {adminSaveSuccess && (
        <div className="mt-3 flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <Icon name="CheckCircle2" size={14} />
          Información actualizada.
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={handleAdminSave}
          disabled={adminSaving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-60 transition-colors"
        >
          {adminSaving ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Save" size={14} />}
          Actualizar información
        </button>
      </div>
    </div>
  ) : null;

  // ─── Historial de cambios ──────────────────────────────────────────────────
  const ChangeHistorySection = (!isNew && canEditAdmin) ? (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={handleToggleHistory}
        className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon name="History" size={15} className="text-gray-400" />
          Historial de cambios administrativos
        </div>
        <Icon name={showChangeHistory ? 'ChevronUp' : 'ChevronDown'} size={15} className="text-gray-400" />
      </button>
      {showChangeHistory && (
        <div className="border-t border-gray-100 px-5 py-4">
          {historyLoading ? (
            <div className="flex justify-center py-4">
              <Icon name="Loader2" size={20} className="animate-spin text-gray-400" />
            </div>
          ) : changeHistory.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-2">Sin cambios registrados.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {changeHistory.map((ch) => (
                <div key={ch.id} className="py-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-gray-600">{ADMIN_FIELD_LABELS[ch.field_name] || ch.field_name}</span>
                    <span className="text-xs text-gray-400">
                      {new Date(ch.changed_at).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex items-start gap-2 mt-1">
                    <span className="text-xs text-red-500 line-through min-w-0 break-all">{ch.old_value || '—'}</span>
                    <Icon name="ArrowRight" size={11} className="text-gray-300 shrink-0 mt-0.5" />
                    <span className="text-xs text-green-700 min-w-0 break-all">{ch.new_value || '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  ) : null;

  // Banner de estado de edición
  const statusBanner = !isNew && (
    <div className={`flex items-center gap-2 p-3 rounded-lg text-sm border ${
      canEditFinancial
        ? 'bg-blue-50 border-blue-200 text-blue-700'
        : canEditAdmin
          ? 'bg-amber-50 border-amber-200 text-amber-700'
          : 'bg-gray-50 border-gray-200 text-gray-600'
    }`}>
      <Icon name={canEditFinancial ? 'Info' : canEditAdmin ? 'PencilLine' : 'Lock'} size={16} />
      {canEditFinancial
        ? 'Puedes corregir esta factura mientras esté pendiente y sin pagos.'
        : canEditAdmin
          ? 'Los datos contables están bloqueados. Puedes actualizar la información administrativa.'
          : 'Este documento está anulado y no puede modificarse.'}
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
            onClick={() => navigate('/crm/facturas')}
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
            {canEditFinancial && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-60"
              >
                {saving ? <Icon name="Loader2" size={15} className="animate-spin" /> : <Icon name="Save" size={15} />}
                {isNew ? 'Crear factura' : 'Guardar'}
              </button>
            )}
          </div>
        }
      >
        {!isNew && saved && (
          <>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_STYLES[saved.status] || ''}`}>
              {saved.status.charAt(0).toUpperCase() + saved.status.slice(1)}
            </span>
            {items.length > 0 && (
              <button
                onClick={() => setShowPdf(true)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium"
              >
                <Icon name="Eye" size={15} />
                Vista previa
              </button>
            )}
          </>
        )}
        {canEditFinancial && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-60"
          >
            {saving ? <Icon name="Loader2" size={15} className="animate-spin" /> : <Icon name="Save" size={15} />}
            {isNew ? 'Crear factura' : 'Guardar cambios'}
          </button>
        )}
      </PanelHeader>

      <DashboardLayoutContent>
        <div className="max-w-3xl space-y-6">
          {saveError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <Icon name="AlertCircle" size={16} />{saveError}
            </div>
          )}
          {statusBanner}

          {/* Datos de la factura — bloqueados contablemente */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-sm font-semibold text-gray-700">Datos de la factura</h3>
              {!canEditFinancial && !isNew && (
                <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                  <Icon name="Lock" size={11} />
                  Bloqueado
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                <div className="flex gap-2">
                  <select
                    disabled={!canEditFinancial}
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className={`flex-1 min-w-0 ${fieldClassDisabled}`}
                  >
                    <option value="">Sin cliente asignado</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}{c.company?.trim() && c.company.trim().toLowerCase() !== 'sin empresa' ? ` — ${c.company}` : ''}
                      </option>
                    ))}
                  </select>
                  {canEditFinancial && (
                    <button
                      type="button"
                      onClick={() => setShowNewCustomer(true)}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors whitespace-nowrap"
                      title="Crear nuevo cliente"
                    >
                      <Icon name="UserPlus" size={15} />
                      Nuevo
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de emisión</label>
                <ChileanDateInput
                  value={issueDate}
                  onChange={setIssueDate}
                  disabled={!canEditFinancial}
                  className={fieldClassDisabled}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de vencimiento (opcional)</label>
                <ChileanDateInput
                  value={dueDate}
                  onChange={setDueDate}
                  disabled={!canEditFinancial}
                  className={fieldClassDisabled}
                />
              </div>
              {/* Notas sólo en modo financial cuando el admin section no está disponible */}
              {!canEditAdmin && (
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notas (visibles en el PDF)</label>
                  <textarea
                    disabled
                    value={notes}
                    rows={2}
                    className={`${fieldClassDisabled} resize-none`}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Condiciones comerciales — sólo visible en modo financiero (cuando canEditAdmin muestra AdminSection) */}
          {canEditFinancial && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">
                Condiciones comerciales{' '}
                <span className="text-gray-400 font-normal">(opcionales)</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">N° OC del cliente</label>
                  <input type="text" value={purchaseOrderNumber} onChange={(e) => setPurchaseOrderNumber(e.target.value)} placeholder="Ej: OC-2026-0042" className={fieldClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Instrucciones de despacho</label>
                  <input type="text" value={dispatchInstructions} onChange={(e) => setDispatchInstructions(e.target.value)} placeholder="Ej: Entregar en bodega 3, contactar a Juan" className={fieldClass} />
                </div>
              </div>
            </div>
          )}

          {canEditFinancial ? EditableItemsSection : ReadOnlyItemsSection}

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

          {/* Sección administrativa */}
          {!canEditFinancial && AdminSection}

          {/* ── PAGOS RECIBIDOS (solo facturas guardadas) ── */}
          {!isNew && saved && (() => {
            const totalPagado = payments.filter(p => !p.voided_at).reduce((s, p) => s + (p.amount || 0), 0);
            const saldo = subtotal - totalPagado;
            const fullPaid = saldo <= 0 && payments.length > 0;
            const partial  = saldo > 0 && totalPagado > 0;
            return (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-700">Historial de abonos</h3>
                    {fullPaid && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                        <Icon name="CheckCircle2" size={11} />
                        Completamente pagada
                      </span>
                    )}
                    {partial && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">
                        <Icon name="Clock" size={11} />
                        Pago parcial
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {fullPaid && saved.status !== 'pagada' && (
                      <button
                        type="button"
                        onClick={handleMarkPaid}
                        disabled={markingPaid}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors disabled:opacity-60"
                      >
                        {markingPaid ? <Icon name="Loader2" size={12} className="animate-spin" /> : <Icon name="CheckCircle2" size={12} />}
                        Marcar como pagada
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowPaymentModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors"
                    >
                      <Icon name="Plus" size={13} />
                      Registrar pago
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-center">
                    <p className="text-xs text-gray-400 mb-0.5">Total factura</p>
                    <p className="text-sm font-bold text-gray-900">{fmt(subtotal)}</p>
                  </div>
                  <div className={`rounded-lg px-3 py-2.5 text-center ${totalPagado > 0 ? 'bg-green-50' : 'bg-gray-50'}`}>
                    <p className="text-xs text-gray-400 mb-0.5">Pagado</p>
                    <p className={`text-sm font-bold ${totalPagado > 0 ? 'text-green-700' : 'text-gray-400'}`}>{fmt(totalPagado)}</p>
                  </div>
                  <div className={`rounded-lg px-3 py-2.5 text-center ${fullPaid ? 'bg-green-50' : saldo > 0 ? 'bg-yellow-50' : 'bg-gray-50'}`}>
                    <p className="text-xs text-gray-400 mb-0.5">Saldo pendiente</p>
                    <p className={`text-sm font-bold ${fullPaid ? 'text-green-700' : saldo > 0 ? 'text-yellow-700' : 'text-gray-400'}`}>{fmt(Math.max(0, saldo))}</p>
                  </div>
                </div>

                {payments.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">Sin pagos registrados.</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {payments.map((p) => {
                      const isVoided = !!p.voided_at;
                      return (
                        <div key={p.id} className={`flex items-center justify-between py-2.5 gap-3 ${isVoided ? 'opacity-60' : ''}`}>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className={`text-sm font-semibold ${isVoided ? 'line-through text-gray-400' : 'text-gray-900'}`}>{fmt(p.amount)}</p>
                              {isVoided && (
                                <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">
                                  <Icon name="Ban" size={10} />
                                  Anulado
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400">
                              {PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method}
                              {p.reference ? ` · Ref: ${p.reference}` : ''}
                              {p.notes ? ` · ${p.notes}` : ''}
                            </p>
                            {isVoided && p.void_reason && (
                              <p className="text-xs text-red-500 mt-0.5">Motivo: {p.void_reason}</p>
                            )}
                          </div>
                          <div className="text-right shrink-0 flex items-center gap-2">
                            <div>
                              <p className="text-xs text-gray-500">
                                {p.payment_date
                                  ? new Date(p.payment_date + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
                                  : '—'}
                              </p>
                              {isVoided && p.voided_at && (
                                <p className="text-xs text-red-400">
                                  Anulado {new Date(p.voided_at).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                </p>
                              )}
                            </div>
                            {!isVoided && (
                              <button
                                type="button"
                                onClick={() => { setVoidingPayment(p); setVoidError(''); }}
                                className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                title="Anular pago"
                              >
                                <Icon name="Ban" size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Historial de cambios administrativos */}
          {ChangeHistorySection}

          {saveError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <Icon name="AlertCircle" size={16} />{saveError}
            </div>
          )}
          <div className="flex flex-col sm:flex-row sm:justify-end gap-3 pb-8">
            <button
              onClick={() => navigate('/crm/facturas')}
              className="w-full sm:w-auto px-5 py-3 sm:py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium text-center transition-colors"
            >
              {isNew ? 'Cancelar' : 'Volver'}
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
            {canEditFinancial && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 sm:py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-60 transition-colors"
              >
                {saving ? <Icon name="Loader2" size={15} className="animate-spin" /> : <Icon name="CheckCircle" size={15} />}
                {isNew ? 'Crear factura' : 'Guardar cambios'}
              </button>
            )}
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

      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Registrar pago</h2>
              <button
                onClick={() => { setShowPaymentModal(false); setPaymentError(''); }}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
              >
                <Icon name="X" size={16} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {paymentError === 'CASH_SESSION_REQUIRED' ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-2">
                  <div className="flex items-start gap-2 text-sm text-amber-800">
                    <Icon name="AlertTriangle" size={15} className="shrink-0 mt-0.5" />
                    <span className="font-semibold">Debes abrir una caja antes de registrar pagos.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setShowPaymentModal(false); setPaymentError(''); navigate('/crm/caja'); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors"
                  >
                    <Icon name="Landmark" size={12} />
                    Abrir caja
                  </button>
                </div>
              ) : paymentError ? (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {paymentError}
                </p>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Monto *</label>
                  <div className="flex items-center border border-gray-300 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500">
                    <span className="text-sm text-gray-400 mr-1">$</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={paymentForm.amount}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                      placeholder="0"
                      className="w-full text-sm text-gray-900 border-0 focus:outline-none bg-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha *</label>
                  <input
                    type="date"
                    value={paymentForm.payment_date}
                    onChange={(e) => setPaymentForm((f) => ({ ...f, payment_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Método</label>
                  <select
                    value={paymentForm.payment_method}
                    onChange={(e) => setPaymentForm((f) => ({ ...f, payment_method: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="cash">Efectivo</option>
                    <option value="bank_transfer">Transferencia</option>
                    <option value="card">Tarjeta</option>
                    <option value="check">Cheque</option>
                    <option value="other">Otro</option>
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Referencia</label>
                  <input
                    type="text"
                    value={paymentForm.reference}
                    onChange={(e) => setPaymentForm((f) => ({ ...f, reference: e.target.value }))}
                    placeholder="Ej: N° comprobante, código transacción…"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                  <input
                    type="text"
                    value={paymentForm.notes}
                    onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Observaciones adicionales…"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 px-5 py-4 border-t border-gray-100">
              <button
                onClick={() => { setShowPaymentModal(false); setPaymentError(''); }}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handlePaymentSave}
                disabled={paymentSaving}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-60 transition-colors"
              >
                {paymentSaving ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="CheckCircle" size={14} />}
                Guardar pago
              </button>
            </div>
          </div>
        </div>
      )}

      {showPdf && (
        <CrmDocumentPdf
          type="invoice"
          document={previewDoc}
          business={business}
          customer={pdfCustomer}
          onClose={() => setShowPdf(false)}
        />
      )}

      {showNewCustomer && (
        <QuickCustomerModal
          onSave={handleCreateCustomer}
          onClose={() => setShowNewCustomer(false)}
        />
      )}

      {voidingPayment && (
        <VoidPaymentModal
          payment={voidingPayment}
          currency={business?.currency}
          busy={voidBusy}
          error={voidError}
          onConfirm={handleVoidPayment}
          onCancel={() => { setVoidingPayment(null); setVoidError(''); }}
        />
      )}
    </DashboardAppShell>
  );
}
