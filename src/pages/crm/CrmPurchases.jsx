import React, { useEffect, useState, useCallback } from 'react';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import CrmBreadcrumb from 'components/ui/CrmBreadcrumb';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { formatMoney, fmtMoneyInput, parseMoneyInput } from '../../utils/formatMoney';
import { getPurchaseInvoices, createPurchaseInvoice, deletePurchaseInvoice } from '../../services/crmService';

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

const PURCHASE_TYPES = [
  {
    value: 'mercaderia',
    label: 'Mercadería',
    desc: 'Stock para vender (ropa, alimentos, repuestos…)',
    icon: 'ShoppingBag',
    color: 'text-blue-600',
    bg: 'bg-blue-50 border-blue-300',
    badge: 'bg-blue-100 text-blue-700',
  },
  {
    value: 'gasto_con_iva',
    label: 'Gasto con IVA',
    desc: 'Bolsas, insumos, publicidad, herramientas…',
    icon: 'Receipt',
    color: 'text-amber-600',
    bg: 'bg-amber-50 border-amber-300',
    badge: 'bg-amber-100 text-amber-700',
  },
  {
    value: 'gasto_sin_iva',
    label: 'Gasto sin IVA',
    desc: 'Sueldos, arriendos exentos, gastos informales…',
    icon: 'FileX',
    color: 'text-gray-600',
    bg: 'bg-gray-50 border-gray-300',
    badge: 'bg-gray-100 text-gray-600',
  },
];

function typeConfig(value) {
  return PURCHASE_TYPES.find(t => t.value === value) || PURCHASE_TYPES[2];
}

function getDefaultTaxRate(country) {
  if (!country) return 19;
  const c = country.toLowerCase();
  if (c === 'cl' || c === 'chile') return 19;
  if (c === 'ar' || c === 'argentina') return 21;
  return 19;
}

function calcAmounts(total, taxRate, taxIncluded) {
  const t = +total || 0;
  const r = +taxRate || 0;
  if (!taxIncluded) {
    const tax = +(t * r / 100).toFixed(2);
    return { net_amount: t, tax_amount: tax, total_amount: +(t + tax).toFixed(2) };
  }
  const net = +(t / (1 + r / 100)).toFixed(2);
  const tax = +(t - net).toFixed(2);
  return { net_amount: net, tax_amount: tax, total_amount: t };
}

// ─── Modal de registro ────────────────────────────────────────────────────────

function PurchaseModal({ defaultTaxRate, onSave, onClose }) {
  const today = new Date().toISOString().slice(0, 10);
  const [supplier, setSupplier] = useState('');
  const [date, setDate]         = useState(today);
  const [type, setType]         = useState('mercaderia');
  const [taxRate, setTaxRate]   = useState(String(defaultTaxRate));
  const [taxIncluded, setTaxIncluded] = useState(true);
  const [total, setTotal]       = useState('');
  const [notes, setNotes]       = useState('');
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState('');

  const parsedTotal = parseMoneyInput(total);
  const hasIva = type !== 'gasto_sin_iva';
  const calc = hasIva ? calcAmounts(parsedTotal, taxRate, taxIncluded) : {
    net_amount: parsedTotal,
    tax_amount: 0,
    total_amount: parsedTotal,
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!date) { setErr('Ingresa una fecha.'); return; }
    if (!parsedTotal || parsedTotal <= 0) { setErr('Ingresa un monto válido.'); return; }
    setSaving(true);
    const { error } = await onSave({
      supplier_name: supplier.trim() || null,
      invoice_date:  date,
      purchase_type: type,
      tax_rate:      hasIva ? +taxRate : 0,
      tax_included:  hasIva ? taxIncluded : false,
      net_amount:    calc.net_amount,
      tax_amount:    calc.tax_amount,
      total_amount:  calc.total_amount,
      notes:         notes.trim() || null,
    });
    setSaving(false);
    if (error) { setErr(error.message || 'Error al guardar.'); return; }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center px-6 py-4 border-b sticky top-0 bg-white">
          <h2 className="font-bold text-gray-900 text-base">Registrar factura de compra</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <Icon name="X" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* Tipo */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Tipo de compra *</label>
            <div className="space-y-2">
              {PURCHASE_TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={`w-full flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-colors ${
                    type === t.value ? `${t.bg} ${t.color}` : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <Icon name={t.icon} size={16} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold leading-none mb-0.5">{t.label}</p>
                    <p className="text-[10px] opacity-70 leading-snug">{t.desc}</p>
                  </div>
                  {type === t.value && <Icon name="CheckCircle2" size={15} className="ml-auto shrink-0 mt-0.5" />}
                </button>
              ))}
            </div>
          </div>

          {/* Proveedor + Fecha */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Proveedor</label>
              <input
                type="text"
                value={supplier}
                onChange={e => setSupplier(e.target.value)}
                placeholder="Nombre del proveedor"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="w-36">
              <label className="block text-xs font-medium text-gray-700 mb-1">Fecha *</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Monto total */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Total factura *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">$</span>
              <input
                type="text"
                inputMode="numeric"
                value={fmtMoneyInput(total)}
                onChange={e => setTotal(e.target.value.replace(/\D/g, ''))}
                placeholder="0"
                className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* IVA — solo si el tipo lo permite */}
          {type !== 'gasto_sin_iva' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-gray-700">IVA</label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={taxIncluded}
                      onChange={e => setTaxIncluded(e.target.checked)}
                      className="rounded"
                    />
                    Incluido en el total
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={taxRate}
                      onChange={e => setTaxRate(e.target.value)}
                      className="w-14 border border-gray-300 rounded-lg px-2 py-1 text-xs text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-xs text-gray-400">%</span>
                  </div>
                </div>
              </div>
              {parsedTotal > 0 && (
                <div className="bg-blue-50 rounded-lg px-3 py-2 text-xs space-y-1">
                  <div className="flex justify-between text-gray-600">
                    <span>Neto</span>
                    <span className="font-semibold">{formatMoney(calc.net_amount)}</span>
                  </div>
                  <div className="flex justify-between text-blue-700">
                    <span>IVA ({taxRate}%)</span>
                    <span className="font-semibold">{formatMoney(calc.tax_amount)}</span>
                  </div>
                  <div className="flex justify-between text-gray-800 font-bold border-t border-blue-200 pt-1">
                    <span>Total</span>
                    <span>{formatMoney(calc.total_amount)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Notas */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Observaciones (opcional)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ej: Factura N° 1234, proveedor habitual…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {err && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{err}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
              {saving && <Icon name="Loader2" size={14} className="animate-spin" />}
              {saving ? 'Guardando…' : 'Registrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Resumen del período ───────────────────────────────────────────────────────

function PeriodSummary({ purchases, taxRate }) {
  const mercaderia    = purchases.filter(p => p.purchase_type === 'mercaderia');
  const gastoConIva   = purchases.filter(p => p.purchase_type === 'gasto_con_iva');
  const gastoSinIva   = purchases.filter(p => p.purchase_type === 'gasto_sin_iva');

  const sum = (arr, field) => arr.reduce((s, r) => s + (r[field] || 0), 0);

  const totalMercaderia  = sum(mercaderia,  'total_amount');
  const ivaCompMerc      = sum(mercaderia,  'tax_amount');
  const totalGastoConIva = sum(gastoConIva, 'total_amount');
  const ivaCompGasto     = sum(gastoConIva, 'tax_amount');
  const totalGastoSinIva = sum(gastoSinIva, 'total_amount');
  const totalIvaCompras  = ivaCompMerc + ivaCompGasto;
  const totalOperacional = totalGastoConIva + totalGastoSinIva;

  if (!purchases.length) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
      {/* Mercadería */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon name="ShoppingBag" size={14} className="text-blue-600" />
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Mercadería</p>
        </div>
        <p className="text-xl font-bold text-blue-800">{formatMoney(totalMercaderia)}</p>
        {ivaCompMerc > 0 && (
          <p className="text-[11px] text-blue-600 mt-1">IVA compra: {formatMoney(ivaCompMerc)}</p>
        )}
        <p className="text-[10px] text-blue-500 mt-1 italic">Inventario — no es pérdida directa</p>
      </div>

      {/* Gastos operativos */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon name="TrendingDown" size={14} className="text-amber-600" />
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Gastos operativos</p>
        </div>
        <p className="text-xl font-bold text-amber-800">{formatMoney(totalOperacional)}</p>
        {ivaCompGasto > 0 && (
          <p className="text-[11px] text-amber-600 mt-1">IVA compra: {formatMoney(ivaCompGasto)}</p>
        )}
        <p className="text-[10px] text-amber-500 mt-1 italic">Afecta directamente la rentabilidad</p>
      </div>

      {/* IVA compras */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon name="Percent" size={14} className="text-indigo-600" />
          <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">IVA compras total</p>
        </div>
        <p className="text-xl font-bold text-indigo-800">{formatMoney(totalIvaCompras)}</p>
        <p className="text-[10px] text-indigo-500 mt-1 italic">Crédito fiscal estimado referencial</p>
      </div>
    </div>
  );
}

// ─── Fila de compra ───────────────────────────────────────────────────────────

function PurchaseRow({ purchase, onDelete }) {
  const cfg = typeConfig(purchase.purchase_type);
  const [confirming, setConfirming] = useState(false);

  const fmtDate = (d) => {
    if (!d) return '';
    const dt = new Date(d + 'T12:00:00');
    return dt.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.badge}`}>
          <Icon name={cfg.icon} size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {purchase.supplier_name || <span className="text-gray-400 font-normal">Sin proveedor</span>}
          </p>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
            <span className="text-[11px] text-gray-400">{fmtDate(purchase.invoice_date)}</span>
            {purchase.notes && <span className="text-[11px] text-gray-400 truncate max-w-[140px]">{purchase.notes}</span>}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <div className="text-right">
          <p className="text-sm font-bold text-gray-900">{formatMoney(purchase.total_amount)}</p>
          {purchase.tax_amount > 0 && (
            <p className="text-[11px] text-indigo-600">IVA: {formatMoney(purchase.tax_amount)}</p>
          )}
        </div>
        {confirming ? (
          <div className="flex items-center gap-1">
            <button onClick={() => onDelete(purchase.id)} className="text-xs bg-red-600 text-white px-2 py-1 rounded-lg hover:bg-red-700 font-medium">Eliminar</button>
            <button onClick={() => setConfirming(false)} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">Cancelar</button>
          </div>
        ) : (
          <button onClick={() => setConfirming(true)} className="text-gray-300 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-50 transition-colors">
            <Icon name="Trash2" size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function CrmPurchases() {
  const { business } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());
  const [typeFilter, setTypeFilter] = useState('');
  const [purchases, setPurchases]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);

  const defaultTaxRate = getDefaultTaxRate(business?.country);

  const navigateMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m > 12) { m = 1;  y += 1; }
    if (m < 1)  { m = 12; y -= 1; }
    setMonth(m);
    setYear(y);
  };

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const { data } = await getPurchaseInvoices(business.id, { month, year });
    setPurchases(data || []);
    setLoading(false);
  }, [business?.id, month, year]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (fields) => {
    const { error } = await createPurchaseInvoice(business.id, fields);
    if (!error) { setShowModal(false); load(); }
    return { error };
  };

  const handleDelete = async (id) => {
    await deletePurchaseInvoice(id);
    setPurchases(prev => prev.filter(p => p.id !== id));
  };

  const filtered = typeFilter ? purchases.filter(p => p.purchase_type === typeFilter) : purchases;

  return (
    <DashboardAppShell>
      <PanelHeader
        title={
          <>
            <CrmBreadcrumb section="Compras" />
            <h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>
              Compras y facturas recibidas
            </h1>
          </>
        }
        subtitle={
          <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
            {loading ? 'Cargando…' : `${purchases.length} registro${purchases.length !== 1 ? 's' : ''} este período`}
          </p>
        }
        mobileActions={
          <button
            onClick={() => setShowModal(true)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            <Icon name="Plus" size={16} />
            Registrar factura
          </button>
        }
      >
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          <Icon name="Plus" size={16} />
          Registrar factura recibida
        </button>
      </PanelHeader>

      <DashboardLayoutContent>

        {/* Navegador de mes + filtro tipo — una sola línea compacta */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5 items-start sm:items-center">
          {/* ← Mes Año → */}
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl px-2 py-1.5">
            <button
              onClick={() => navigateMonth(-1)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
              aria-label="Mes anterior"
            >
              <Icon name="ChevronLeft" size={15} />
            </button>
            <span className="text-sm font-semibold text-gray-800 min-w-[120px] text-center select-none">
              {MONTHS[month - 1]} {year}
            </span>
            <button
              onClick={() => navigateMonth(1)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
              aria-label="Mes siguiente"
            >
              <Icon name="ChevronRight" size={15} />
            </button>
          </div>

          {/* Filtro por tipo */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setTypeFilter('')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                typeFilter === '' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              }`}
            >
              Todos
            </button>
            {PURCHASE_TYPES.map(t => (
              <button
                key={t.value}
                onClick={() => setTypeFilter(typeFilter === t.value ? '' : t.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  typeFilter === t.value ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Resumen — siempre visible arriba */}
        <PeriodSummary purchases={purchases} taxRate={defaultTaxRate} />

        {/* Lista */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Icon name="Loader2" size={32} className="animate-spin text-blue-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Icon name="FileInput" size={44} className="mx-auto mb-3" />
            <p className="font-medium text-gray-500">
              {purchases.length === 0 ? 'No hay compras registradas este período.' : `Sin registros para el filtro seleccionado.`}
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-4 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
            >
              Registrar primera factura
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(p => (
              <PurchaseRow key={p.id} purchase={p} onDelete={handleDelete} />
            ))}
          </div>
        )}

        {/* Aviso informativo */}
        {purchases.length > 0 && (
          <div className="mt-6 flex items-start gap-2 p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-500">
            <Icon name="Info" size={14} className="shrink-0 mt-0.5 text-gray-400" />
            <span>
              <strong>Estimación referencial.</strong> Este registro es informativo y orientativo.
              No reemplaza la declaración tributaria oficial ni el asesoramiento de un contador.
            </span>
          </div>
        )}

      </DashboardLayoutContent>

      {showModal && (
        <PurchaseModal
          defaultTaxRate={defaultTaxRate}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}
    </DashboardAppShell>
  );
}
