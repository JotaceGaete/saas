import React, { useEffect, useMemo, useState } from 'react';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import CrmBreadcrumb from 'components/ui/CrmBreadcrumb';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import {
  getCrmCustomers, createCrmCustomer, updateCrmCustomer, deleteCrmCustomer,
  getBusinessCreditSummary, getCustomerPendingInvoices, registerCustomerAbono,
  formatInvoiceNumber,
} from '../../services/crmService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : name[0].toUpperCase();
}

function cleanPhone(raw) {
  return (raw || '').replace(/[^\d+]/g, '');
}

function hasCompany(c) {
  const v = (c.company || '').trim().toLowerCase();
  return v && v !== 'sin empresa';
}

// Avatar color based on name character
const AVATAR_COLORS = [
  'bg-blue-600', 'bg-violet-600', 'bg-emerald-600',
  'bg-rose-600',  'bg-amber-600',  'bg-sky-600',
  'bg-indigo-600','bg-teal-600',   'bg-pink-600',
];
function avatarColor(name) {
  const code = (name || '').charCodeAt(0) || 0;
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

// ─── Formulario ───────────────────────────────────────────────────────────────

const EMPTY_FORM = { name: '', company: '', rut: '', phone: '', whatsapp: '', email: '', address: '', notes: '' };

const FIELDS = [
  { key: 'name',     label: 'Nombre *',        required: true, type: 'text' },
  { key: 'company',  label: 'Empresa',                         type: 'text' },
  { key: 'rut',      label: 'RUT / CUIT / DNI',                type: 'text' },
  { key: 'phone',    label: 'Teléfono',                        type: 'text' },
  { key: 'whatsapp', label: 'WhatsApp',                        type: 'text' },
  { key: 'email',    label: 'Email',                           type: 'email' },
  { key: 'address',  label: 'Dirección',                       type: 'text' },
];

function CustomerModal({ initial, onSave, onClose }) {
  const [form, setForm]   = useState(initial ? { ...EMPTY_FORM, ...initial } : { ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError]  = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('El nombre es obligatorio.'); return; }
    setSaving(true);
    setError('');
    const { error: err } = await onSave(form);
    if (err) { setError(err.message || 'Error al guardar.'); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900 text-base">
            {initial?.id ? 'Editar cliente' : 'Nuevo cliente'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100">
            <Icon name="X" size={18} />
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
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notas internas</label>
              <textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</p>}
          </div>
          <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2 transition-colors">
              {saving && <Icon name="Loader2" size={14} className="animate-spin" />}
              {saving ? 'Guardando…' : initial?.id ? 'Guardar cambios' : 'Crear cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Card de cliente ──────────────────────────────────────────────────────────

function CustomerCard({ c, balance, onView, onEdit, onDelete, deleting }) {
  const waNumber = cleanPhone(c.whatsapp || c.phone);
  const hasWa    = waNumber.length >= 7;
  const hasEmail = !!c.email;
  const debt     = balance ?? 0;
  const alDia    = debt === 0;

  return (
    <div className="group bg-white border border-gray-100 rounded-2xl overflow-hidden hover:shadow-lg hover:border-gray-200 transition-all duration-200 flex flex-col">
      {/* Franja de estado en la parte superior */}
      <div className={`h-1 shrink-0 ${alDia ? 'bg-emerald-400' : 'bg-red-500'}`} />

      {/* Header: avatar + nombre + acciones discretas */}
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className={`w-12 h-12 rounded-xl ${avatarColor(c.name)} flex items-center justify-center text-base font-bold text-white shrink-0 shadow-sm`}>
            {initials(c.name)}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-gray-900 text-[15px] leading-tight truncate">{c.name || 'Sin nombre'}</p>
            <p className="text-xs text-gray-400 mt-0.5 truncate">
              {hasCompany(c) ? c.company : 'Persona natural'}
            </p>
          </div>
        </div>
        <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onView}   className="p-1.5 text-gray-300 hover:text-blue-500 rounded-lg hover:bg-blue-50 transition-colors"  title="Ver ficha">
            <Icon name="Eye"    size={13} />
          </button>
          <button onClick={onEdit}   className="p-1.5 text-gray-300 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"  title="Editar">
            <Icon name="Pencil" size={13} />
          </button>
          <button onClick={onDelete} disabled={deleting} className="p-1.5 text-gray-300 hover:text-red-400 rounded-lg hover:bg-red-50 transition-colors" title="Eliminar">
            {deleting ? <Icon name="Loader2" size={13} className="animate-spin" /> : <Icon name="Trash2" size={13} />}
          </button>
        </div>
      </div>

      {/* Deuda — elemento visual dominante */}
      <div
        className={`mx-4 mb-3 rounded-xl px-4 py-3 flex items-center justify-between ${
          alDia
            ? 'bg-emerald-50 border border-emerald-100'
            : 'bg-red-50 border border-red-100 cursor-pointer hover:bg-red-100 transition-colors'
        }`}
        onClick={!alDia ? onView : undefined}
        role={!alDia ? 'button' : undefined}
      >
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${alDia ? 'text-emerald-600' : 'text-red-500'}`}>
            {alDia ? 'Sin deuda' : 'Saldo pendiente'}
          </p>
          <p className={`text-xl font-black leading-none ${alDia ? 'text-emerald-700' : 'text-red-600'}`}>
            {alDia ? 'Al día ✓' : `$${debt.toLocaleString('es-CL')}`}
          </p>
        </div>
        {alDia
          ? <Icon name="CheckCircle2" size={20} className="text-emerald-400 shrink-0" />
          : <Icon name="ChevronRight" size={16} className="text-red-400 shrink-0" />
        }
      </div>

      {/* Datos de contacto */}
      <div className="px-5 pb-3 space-y-1.5">
        {(c.phone || c.whatsapp) && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Icon name="Phone" size={12} className="shrink-0 text-gray-300" />
            <span className="truncate">{c.whatsapp || c.phone}</span>
          </div>
        )}
        {c.email && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Icon name="Mail" size={12} className="shrink-0 text-gray-300" />
            <span className="truncate">{c.email}</span>
          </div>
        )}
        {c.rut && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Icon name="Hash" size={12} className="shrink-0 text-gray-300" />
            <span>{c.rut}</span>
          </div>
        )}
      </div>

      {/* CTAs — WhatsApp prominente, email secundario */}
      <div className="mt-auto px-4 pb-4 pt-2 flex gap-2 border-t border-gray-50">
        {hasWa ? (
          <a
            href={`https://wa.me/${waNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-white text-xs font-bold transition-colors shadow-sm"
          >
            <Icon name="MessageCircle" size={14} />
            WhatsApp
          </a>
        ) : null}
        {hasEmail ? (
          <a
            href={`mailto:${c.email}`}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs font-bold transition-colors"
          >
            <Icon name="Mail" size={14} />
            Email
          </a>
        ) : null}
        {!hasWa && !hasEmail ? (
          <button
            onClick={onView}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-500 text-xs font-bold transition-colors"
          >
            <Icon name="Eye" size={14} />
            Ver ficha
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ─── Drawer "Ver cliente" — ficha completa + cuenta corriente ─────────────────

const FIELD_ROWS = [
  { key: 'phone',    label: 'Teléfono',    icon: 'Phone' },
  { key: 'whatsapp', label: 'WhatsApp',    icon: 'MessageCircle' },
  { key: 'email',    label: 'Email',       icon: 'Mail' },
  { key: 'rut',      label: 'RUT / DNI',   icon: 'Hash' },
  { key: 'address',  label: 'Dirección',   icon: 'MapPin' },
  { key: 'notes',    label: 'Notas',       icon: 'FileText' },
];

function CustomerDetailDrawer({ customer, business, balance, fmt, onClose, onEdit }) {
  const [invoices,    setInvoices]    = useState([]);
  const [loadingInv,  setLoadingInv]  = useState(true);
  const [selectedInv, setSelectedInv] = useState(null);
  const [abonoAmount, setAbonoAmount] = useState('');
  const [abonoMethod, setAbonoMethod] = useState('cash');
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState(null);
  const [success,     setSuccess]     = useState(null);
  const [tab,         setTab]         = useState('perfil'); // 'perfil' | 'cuenta'

  const waNumber = cleanPhone(customer.whatsapp || customer.phone);
  const hasWa    = waNumber.length >= 7;

  const loadInv = async () => {
    setLoadingInv(true);
    const { data } = await getCustomerPendingInvoices(business.id, customer.id);
    setInvoices(data || []);
    setLoadingInv(false);
  };

  useEffect(() => { loadInv(); }, [customer.id]);

  const totalPendiente = invoices.reduce((s, inv) => {
    const pagado = (inv.crm_payments || []).reduce((p, r) => p + (r.amount || 0), 0);
    return s + Math.max(0, inv.total - pagado);
  }, 0);

  const handleAbono = async () => {
    if (!selectedInv) return;
    const amount = parseFloat(abonoAmount.replace(/\./g, '').replace(',', '.'));
    if (!amount || amount <= 0) { setError('Ingresa un monto válido.'); return; }
    setSaving(true);
    setError(null);
    const { error: err } = await registerCustomerAbono(business.id, {
      customerId: customer.id,
      invoiceId: selectedInv.id,
      amount,
      paymentMethod: abonoMethod,
      invoiceTotal: selectedInv.total,
    });
    setSaving(false);
    if (err) { setError(err.message || 'Error al registrar.'); return; }
    setSuccess('Abono registrado.');
    setSelectedInv(null);
    setAbonoAmount('');
    loadInv();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ backgroundColor: 'rgba(15,23,42,0.45)' }}
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-full ${avatarColor(customer.name)} flex items-center justify-center text-sm font-bold text-white shrink-0`}>
              {initials(customer.name)}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-gray-900 truncate">{customer.name}</h2>
              {hasCompany(customer)
                ? <p className="text-xs text-gray-400 truncate">{customer.company}</p>
                : <p className="text-xs text-gray-400">Persona natural</p>
              }
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onEdit} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="Editar">
              <Icon name="Pencil" size={15} />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100">
              <Icon name="X" size={18} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="shrink-0 flex border-b border-gray-100">
          {[
            { id: 'perfil', label: 'Datos del cliente', icon: 'User' },
            { id: 'cuenta', label: 'Cuenta corriente',  icon: 'BookUser' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              <Icon name={t.icon} size={13} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── TAB PERFIL ── */}
          {tab === 'perfil' && (
            <div className="p-5 space-y-5">
              {/* Acciones de contacto rápido */}
              {hasWa && (
                <a
                  href={`https://wa.me/${waNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-green-50 hover:bg-green-100 text-green-700 text-sm font-semibold border border-green-200 transition-colors"
                >
                  <Icon name="MessageCircle" size={15} />
                  Enviar WhatsApp
                </a>
              )}

              {/* Campos del cliente */}
              <div className="bg-gray-50 rounded-2xl overflow-hidden">
                {FIELD_ROWS.map(({ key, label, icon }, idx) => {
                  const val = customer[key];
                  if (!val) return null;
                  return (
                    <div key={key} className={`flex items-start gap-3 px-4 py-3 ${idx > 0 ? 'border-t border-gray-100' : ''}`}>
                      <Icon name={icon} size={14} className="text-gray-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{label}</p>
                        <p className="text-sm text-gray-800 break-words">{val}</p>
                      </div>
                    </div>
                  );
                })}
                {FIELD_ROWS.every(({ key }) => !customer[key]) && (
                  <p className="text-sm text-gray-400 text-center py-6">Sin datos de contacto registrados</p>
                )}
              </div>

              {/* Balance rápido — usa totalPendiente (dato fresco, misma fórmula que tab cuenta) */}
              <div className={`rounded-xl p-4 flex items-center justify-between ${
                totalPendiente > 0 ? 'bg-red-50 border border-red-100' : 'bg-green-50 border border-green-100'
              }`}>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Deuda pendiente</p>
                  <p className={`text-xl font-bold ${totalPendiente > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {loadingInv ? '…' : fmt(totalPendiente)}
                  </p>
                </div>
                {totalPendiente === 0
                  ? <Icon name="CheckCircle2" size={24} color="#059669" />
                  : <button onClick={() => setTab('cuenta')} className="text-xs font-semibold text-red-600 hover:underline">
                      Ver cuenta →
                    </button>
                }
              </div>
            </div>
          )}

          {/* ── TAB CUENTA CORRIENTE ── */}
          {tab === 'cuenta' && (
            <div className="p-4 space-y-4">
              {/* Saldo total */}
              <div className={`rounded-xl p-4 flex items-center justify-between ${totalPendiente > 0 ? 'bg-red-50 border border-red-100' : 'bg-green-50 border border-green-100'}`}>
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-0.5">Saldo pendiente</p>
                  <p className={`text-2xl font-bold ${totalPendiente > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(totalPendiente)}</p>
                </div>
                {totalPendiente === 0
                  ? <Icon name="CheckCircle2" size={28} color="#059669" />
                  : <Icon name="AlertCircle" size={28} color="#dc2626" />
                }
              </div>

              {success && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-700">
                  <Icon name="CheckCircle2" size={14} />
                  <span>{success}</span>
                  <button onClick={() => setSuccess(null)} className="ml-auto text-green-400"><Icon name="X" size={12} /></button>
                </div>
              )}
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                  <Icon name="AlertCircle" size={14} />
                  <span>{error}</span>
                  <button onClick={() => setError(null)} className="ml-auto text-red-400"><Icon name="X" size={12} /></button>
                </div>
              )}

              {/* Facturas pendientes */}
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">Facturas pendientes</p>
                {loadingInv ? (
                  <p className="text-xs text-gray-400 text-center py-6">Cargando…</p>
                ) : invoices.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">Sin facturas pendientes</p>
                ) : (
                  <div className="space-y-2">
                    {invoices.map(inv => {
                      const pagado = (inv.crm_payments || []).reduce((p, r) => p + (r.amount || 0), 0);
                      const saldo  = Math.max(0, inv.total - pagado);
                      const sel    = selectedInv?.id === inv.id;
                      return (
                        <div key={inv.id} className={`rounded-xl border p-3 transition-colors ${sel ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-gray-50'}`}>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-semibold text-gray-800">{formatInvoiceNumber(inv.invoice_number)}</p>
                              <p className="text-xs text-gray-400">{inv.issue_date}</p>
                              {pagado > 0 && (
                                <p className="text-[11px] text-emerald-600 mt-0.5">Abonado: {fmt(pagado)}</p>
                              )}
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-red-600">{fmt(saldo)}</p>
                              <p className="text-[10px] text-gray-400">de {fmt(inv.total)}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => { setSelectedInv(sel ? null : inv); setError(null); setAbonoAmount(''); }}
                            className={`mt-2 w-full text-xs font-semibold py-1.5 rounded-lg transition-colors ${sel ? 'bg-indigo-600 text-white' : 'bg-white border border-indigo-300 text-indigo-700 hover:bg-indigo-50'}`}
                          >
                            {sel ? 'Cancelar' : 'Registrar abono'}
                          </button>
                          {sel && (
                            <div className="mt-3 space-y-2 border-t border-indigo-200 pt-3">
                              <select
                                value={abonoMethod}
                                onChange={e => setAbonoMethod(e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                              >
                                {ABONO_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                              </select>
                              <div className="relative">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={abonoAmount}
                                  onChange={e => setAbonoAmount(e.target.value.replace(/[^\d]/g, ''))}
                                  placeholder={`máx. ${fmt(saldo)}`}
                                  className="w-full pl-6 pr-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                />
                              </div>
                              <button
                                disabled={saving}
                                onClick={handleAbono}
                                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
                              >
                                {saving && <Icon name="Loader2" size={14} className="animate-spin" />}
                                {saving ? 'Registrando…' : 'Confirmar abono'}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Drawer cuenta corriente ──────────────────────────────────────────────────

const ABONO_METHODS = [
  { value: 'cash',          label: 'Efectivo' },
  { value: 'bank_transfer', label: 'Transferencia' },
  { value: 'card',          label: 'Tarjeta' },
  { value: 'check',         label: 'Cheque' },
  { value: 'other',         label: 'Otro' },
];

function CustomerAccountDrawer({ customer, business, onClose, fmt }) {
  const [invoices, setInvoices]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [selectedInv, setSelectedInv] = useState(null);
  const [abonoAmount, setAbonoAmount] = useState('');
  const [abonoMethod, setAbonoMethod] = useState('cash');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState(null);
  const [success, setSuccess]       = useState(null);

  const load = async () => {
    setLoading(true);
    const { data } = await getCustomerPendingInvoices(business.id, customer.id);
    setInvoices(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [customer.id]);

  const totalPendiente = invoices.reduce((s, inv) => {
    const pagado = (inv.crm_payments || []).reduce((p, r) => p + (r.amount || 0), 0);
    return s + Math.max(0, inv.total - pagado);
  }, 0);

  const handleAbono = async () => {
    if (!selectedInv) return;
    const amount = parseFloat(abonoAmount.replace(/\./g, '').replace(',', '.'));
    if (!amount || amount <= 0) { setError('Ingresa un monto válido.'); return; }
    setSaving(true);
    setError(null);
    const { error: err } = await registerCustomerAbono(business.id, {
      customerId: customer.id,
      invoiceId: selectedInv.id,
      amount,
      paymentMethod: abonoMethod,
      invoiceTotal: selectedInv.total,
    });
    setSaving(false);
    if (err) { setError(err.message || 'No se pudo registrar el abono.'); return; }
    setSuccess('Abono registrado correctamente.');
    setSelectedInv(null);
    setAbonoAmount('');
    load();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ backgroundColor: 'rgba(15,23,42,0.42)' }} onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-3">
          <div>
            <h2 className="text-base font-bold text-gray-900">{customer.name}</h2>
            <p className="text-xs text-gray-400">Cuenta corriente</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <Icon name="X" size={18} color="var(--color-muted-foreground)" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Resumen saldo */}
          <div className={`rounded-xl p-4 flex items-center justify-between ${totalPendiente > 0 ? 'bg-red-50 border border-red-100' : 'bg-green-50 border border-green-100'}`}>
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-0.5">Saldo pendiente</p>
              <p className={`text-2xl font-bold ${totalPendiente > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(totalPendiente)}</p>
            </div>
            {totalPendiente === 0 && <Icon name="CheckCircle2" size={28} color="#059669" />}
            {totalPendiente > 0 && <Icon name="AlertCircle" size={28} color="#dc2626" />}
          </div>

          {success && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-700">
              <Icon name="CheckCircle2" size={14} color="currentColor" />
              <span>{success}</span>
              <button onClick={() => setSuccess(null)} className="ml-auto text-green-400 hover:text-green-600"><Icon name="X" size={12} /></button>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
              <Icon name="AlertCircle" size={14} color="currentColor" />
              <span>{error}</span>
              <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600"><Icon name="X" size={12} /></button>
            </div>
          )}

          {/* Listado de facturas pendientes */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">Facturas pendientes</p>
            {loading ? (
              <p className="text-xs text-gray-400">Cargando…</p>
            ) : invoices.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Sin facturas pendientes</p>
            ) : (
              <div className="space-y-2">
                {invoices.map(inv => {
                  const pagado = (inv.crm_payments || []).reduce((p, r) => p + (r.amount || 0), 0);
                  const saldo  = Math.max(0, inv.total - pagado);
                  const sel    = selectedInv?.id === inv.id;
                  return (
                    <div key={inv.id} className={`rounded-xl border p-3 transition-colors ${sel ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-gray-50'}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-gray-800">NV-{String(inv.invoice_number).padStart(4, '0')}</p>
                          <p className="text-xs text-gray-400">{inv.issue_date}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-red-600">{fmt(saldo)}</p>
                          {pagado > 0 && <p className="text-[10px] text-gray-400">Total: {fmt(inv.total)}</p>}
                        </div>
                      </div>
                      <button
                        onClick={() => { setSelectedInv(sel ? null : inv); setError(null); setAbonoAmount(''); }}
                        className={`mt-2 w-full text-xs font-semibold py-1.5 rounded-lg transition-colors ${sel ? 'bg-indigo-600 text-white' : 'bg-white border border-indigo-300 text-indigo-700 hover:bg-indigo-50'}`}
                      >
                        {sel ? 'Cancelar' : 'Abonar a esta factura'}
                      </button>

                      {sel && (
                        <div className="mt-3 space-y-2 border-t border-indigo-200 pt-3">
                          <select
                            value={abonoMethod}
                            onChange={e => setAbonoMethod(e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                          >
                            {ABONO_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                          </select>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">$</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={abonoAmount}
                              onChange={e => setAbonoAmount(e.target.value.replace(/[^\d]/g, ''))}
                              placeholder={`Monto abono (máx. ${fmt(saldo)})`}
                              className="w-full pl-6 pr-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            />
                          </div>
                          <button
                            disabled={saving}
                            onClick={handleAbono}
                            className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
                          >
                            {saving && <Icon name="Loader2" size={14} className="animate-spin" />}
                            {saving ? 'Registrando…' : 'Confirmar abono'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function CrmCustomers() {
  const { business }  = useAuth();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(null);
  const [search, setSearch]       = useState('');
  const [deleting, setDeleting]   = useState(null);
  const [balanceMap, setBalanceMap] = useState({});
  const [creditSummary, setCreditSummary] = useState({ clientesConDeuda: 0, totalPorCobrar: 0 });
  const [viewDrawer, setViewDrawer] = useState(null); // customer object para ver ficha

  const load = async () => {
    if (!business?.id) return;
    setLoading(true);
    const [{ data }, summary] = await Promise.all([
      getCrmCustomers(business.id),
      getBusinessCreditSummary(business.id),
    ]);
    setCustomers(data || []);
    setBalanceMap(summary.balanceByCustomer || {});
    setCreditSummary({ clientesConDeuda: summary.clientesConDeuda, totalPorCobrar: summary.totalPorCobrar });
    setLoading(false);
  };

  useEffect(() => { load(); }, [business?.id]);

  const handleSave = async (form) => {
    const result = modal?.id
      ? await updateCrmCustomer(modal.id, form)
      : await createCrmCustomer(business.id, form);
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

  const filtered = useMemo(() => customers.filter(c =>
    !search ||
    (c.name    || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.company || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.email   || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.phone   || '').includes(search)
  ), [customers, search]);

  const totalClientes    = customers.length;
  const { clientesConDeuda, totalPorCobrar } = creditSummary;

  const fmt = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: business?.currency || 'CLP', maximumFractionDigits: 0 }).format(n);

  return (
    <DashboardAppShell>
      <PanelHeader
        title={<><CrmBreadcrumb section="Clientes" /><h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>Clientes</h1></>}
        subtitle={<p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>{loading ? 'Cargando…' : `${customers.length} cliente${customers.length !== 1 ? 's' : ''}`}</p>}
        mobileActions={
          <button
            onClick={() => setModal('new')}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
          >
            <Icon name="UserPlus" size={15} />
            Nuevo cliente
          </button>
        }
      >
        <button
          onClick={() => setModal('new')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
        >
          <Icon name="UserPlus" size={15} />
          Nuevo cliente
        </button>
      </PanelHeader>

      <DashboardLayoutContent>
        {/* ── Métricas ── */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-col gap-1 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <Icon name="Users" size={14} className="text-blue-500" />
              </span>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide leading-none">Clientes</p>
            </div>
            <p className="text-3xl font-black text-gray-900 leading-none">{loading ? '—' : totalClientes}</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-col gap-1 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                <Icon name="AlertCircle" size={14} className="text-red-400" />
              </span>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide leading-none">Con deuda</p>
            </div>
            <p className="text-3xl font-black text-red-500 leading-none">{loading ? '—' : clientesConDeuda}</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-col gap-1 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                <Icon name="DollarSign" size={14} className="text-amber-500" />
              </span>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide leading-none">Por cobrar</p>
            </div>
            <p className="text-xl font-black text-gray-900 leading-none">{loading ? '—' : fmt(totalPorCobrar)}</p>
          </div>
        </div>

        {/* ── Buscador ── */}
        <div className="relative">
          <Icon name="Search" size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por nombre, empresa, email o teléfono…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-xl pl-10 pr-10 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded"
            >
              <Icon name="X" size={14} />
            </button>
          )}
        </div>

        {/* ── Lista ── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Icon name="Loader2" size={28} className="animate-spin text-blue-400" />
            <p className="text-sm text-gray-400">Cargando clientes…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
            <span className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-1">
              {search
                ? <Icon name="SearchX" size={28} className="text-gray-400" />
                : <Icon name="Users" size={28} className="text-gray-400" />
              }
            </span>
            <p className="text-base font-bold text-gray-700">
              {search ? 'Sin resultados' : 'Aún no hay clientes'}
            </p>
            <p className="text-sm text-gray-400 max-w-xs">
              {search
                ? `No se encontraron clientes para "${search}".`
                : 'Agrega tu primer cliente para empezar a gestionar tu cartera.'}
            </p>
            {!search && (
              <button
                onClick={() => setModal('new')}
                className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm"
              >
                <Icon name="UserPlus" size={15} />
                Crear primer cliente
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(c => (
              <CustomerCard
                key={c.id}
                c={c}
                balance={balanceMap[c.id] ?? 0}
                onView={() => setViewDrawer(c)}
                onEdit={() => setModal(c)}
                onDelete={() => handleDelete(c.id)}
                deleting={deleting === c.id}
              />
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
      {viewDrawer && (
        <CustomerDetailDrawer
          customer={viewDrawer}
          business={business}
          balance={balanceMap[viewDrawer.id] ?? 0}
          fmt={fmt}
          onClose={() => { setViewDrawer(null); load(); }}
          onEdit={() => { setViewDrawer(null); setModal(viewDrawer); }}
        />
      )}
    </DashboardAppShell>
  );
}
