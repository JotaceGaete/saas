import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';
import BusinessSidebar from 'components/ui/BusinessSidebar';
import { useAuth } from '../../contexts/AuthContext';
import { formatMoney } from '../../utils/formatMoney';
import {
  getSupplier,
  getSupplierDebts,
  updateSupplier,
  createSupplierDebt,
  updateSupplierDebt,
  addDebtPayment,
  markDebtAsPaid,
  deleteSupplierDebt,
} from '../../services/waBusinessService';
import SupplierFormModal from '../../components/SupplierFormModal';
import DebtFormModal from '../../components/DebtFormModal';

const TYPE_LABELS = {
  mercaderia: 'Mercadería', insumos: 'Insumos', servicios: 'Servicios',
  transporte: 'Transporte', arriendo: 'Arriendo', marketing: 'Marketing', otros: 'Otros',
};

// fmt se inicializa con la moneda del negocio en el componente raíz

function timeAgo(dateStr) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} día${days !== 1 ? 's' : ''}`;
  const months = Math.floor(days / 30);
  return `hace ${months} mes${months > 1 ? 'es' : ''}`;
}

// ── Abono parcial modal ───────────────────────────────────────────
function PaymentModal({ open, onClose, onSave, debt }) {
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const balance = debt ? (debt.balance ?? debt.amount - (debt.amountPaid ?? 0)) : 0;

  useEffect(() => { if (open) { setAmount(''); setError(''); } }, [open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const n = parseFloat(amount);
    if (isNaN(n) || n <= 0) { setError('Ingresá un monto válido'); return; }
    if (n > balance) { setError(`El monto no puede superar el saldo de $ ${fmt(balance)}`); return; }
    setSaving(true); setError('');
    try { await onSave(n); onClose(); }
    catch (err) { setError(err?.message ?? 'Error'); }
    finally { setSaving(false); }
  };

  if (!open || !debt) return null;
  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(2px)' }} onClick={onClose}>
      <div className="w-full max-w-xs rounded-2xl border shadow-xl overflow-hidden" style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div>
            <h2 className="text-sm font-bold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>Registrar abono</h2>
            <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{debt.description}</p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center" aria-label="Cerrar">
            <Icon name="X" size={15} color="var(--color-muted-foreground)" />
          </button>
        </div>
        <div className="px-5 pt-4 pb-2">
          <div className="flex justify-between text-xs mb-1" style={{ fontFamily: 'var(--font-caption)' }}>
            <span style={{ color: 'var(--color-muted-foreground)' }}>Monto original</span>
            <span style={{ color: 'var(--color-foreground)', fontWeight: 600 }}>$ {fmt(debt.amount)}</span>
          </div>
          {(debt.amountPaid ?? 0) > 0 && (
            <div className="flex justify-between text-xs mb-1" style={{ fontFamily: 'var(--font-caption)' }}>
              <span style={{ color: '#10B981' }}>Abonado</span>
              <span style={{ color: '#10B981', fontWeight: 600 }}>- $ {fmt(debt.amountPaid)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-bold border-t pt-2 mt-1" style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}>
            <span style={{ color: 'var(--color-foreground)' }}>Saldo pendiente</span>
            <span style={{ color: '#EF4444' }}>$ {fmt(balance)}</span>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-3 pt-3">
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2" style={{ fontFamily: 'var(--font-caption)' }}>{error}</p>}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>Monto del abono *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>$</span>
              <input type="number" min="0.01" step="0.01" max={balance} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoFocus
                className="w-full pl-7 pr-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }} />
            </div>
            <button type="button" className="text-xs mt-1 underline" style={{ color: '#6366F1', fontFamily: 'var(--font-caption)' }} onClick={() => setAmount(String(balance))}>
              Usar saldo completo ($ {fmt(balance)})
            </button>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border text-sm font-medium hover:bg-muted" style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60" style={{ backgroundColor: '#10B981', color: '#fff', fontFamily: 'var(--font-caption)' }}>
              {saving ? 'Registrando...' : 'Registrar abono'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Progress bar para abonos ──────────────────────────────────────
function DebtProgress({ amount, amountPaid }) {
  if (!amountPaid || amountPaid <= 0) return null;
  const pct = Math.min((amountPaid / amount) * 100, 100);
  return (
    <div className="mt-2">
      <div className="flex justify-between text-[10px] mb-1" style={{ fontFamily: 'var(--font-caption)' }}>
        <span style={{ color: '#10B981' }}>Abonado $ {fmt(amountPaid)}</span>
        <span style={{ color: 'var(--color-muted-foreground)' }}>Saldo $ {fmt(amount - amountPaid)}</span>
      </div>
      <div className="w-full rounded-full h-1.5 overflow-hidden" style={{ backgroundColor: '#E5E7EB' }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: '#10B981' }} />
      </div>
    </div>
  );
}

// ── Timeline item ─────────────────────────────────────────────────
function DebtTimelineItem({ debt, onMarkPaid, onAbono, onEdit, onDelete, isLast }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isOverdue = debt.status === 'pending' && debt.dueDate && new Date(debt.dueDate) < today;
  const balance = debt.balance ?? (debt.amount - (debt.amountPaid ?? 0));
  const hasPartialPayment = (debt.amountPaid ?? 0) > 0 && debt.status !== 'paid';

  const cfg = debt.status === 'paid'
    ? { color: '#10B981', bg: '#ECFDF5', icon: 'CheckCircle2', label: 'Pagada' }
    : isOverdue
      ? { color: '#EF4444', bg: '#FEF2F2', icon: 'AlertCircle', label: 'Vencida' }
      : hasPartialPayment
        ? { color: '#3B82F6', bg: '#EFF6FF', icon: 'Clock', label: 'Abonada parcialmente' }
        : { color: '#6366F1', bg: '#EEF2FF', icon: 'Clock', label: 'Pendiente' };

  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="relative flex gap-4">
      <div className="flex flex-col items-center flex-shrink-0">
        <div className="w-8 h-8 rounded-full flex items-center justify-center z-10" style={{ backgroundColor: cfg.bg, border: `2px solid ${cfg.color}` }}>
          <Icon name={cfg.icon} size={14} color={cfg.color} />
        </div>
        {!isLast && <div className="w-px flex-1 mt-1" style={{ backgroundColor: 'var(--color-border)', minHeight: '16px' }} />}
      </div>

      <div className="flex-1 rounded-2xl border p-4 mb-3 group" style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)' }}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className="text-sm font-semibold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>{debt.description}</p>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: cfg.bg, color: cfg.color, fontFamily: 'var(--font-caption)' }}>{cfg.label}</span>
            </div>

            {/* Monto */}
            <div className="flex items-baseline gap-2 flex-wrap">
              <p className="text-xl font-black" style={{ color: isOverdue ? '#EF4444' : 'var(--color-foreground)', fontFamily: 'var(--font-stat)' }}>
                $ {fmt(debt.status === 'paid' ? debt.amount : balance)}
              </p>
              {debt.status !== 'paid' && debt.amount !== balance && (
                <p className="text-xs line-through" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>$ {fmt(debt.amount)}</p>
              )}
            </div>

            {/* Progress abonos */}
            <DebtProgress amount={debt.amount} amountPaid={debt.amountPaid} />

            {/* Dates */}
            <div className="flex flex-wrap gap-3 mt-2">
              {debt.dueDate && debt.status !== 'paid' && (
                <span className="text-xs flex items-center gap-1" style={{ color: isOverdue ? '#EF4444' : '#D97706', fontFamily: 'var(--font-caption)' }}>
                  <Icon name="Calendar" size={11} color="currentColor" />
                  {isOverdue ? `Venció ${new Date(debt.dueDate).toLocaleDateString('es', { day: 'numeric', month: 'long' })}` : `Vence ${new Date(debt.dueDate).toLocaleDateString('es', { day: 'numeric', month: 'long' })}`}
                </span>
              )}
              {debt.paidAt && (
                <span className="text-xs flex items-center gap-1" style={{ color: '#10B981', fontFamily: 'var(--font-caption)' }}>
                  <Icon name="CheckCircle" size={11} color="currentColor" />
                  Pagada {timeAgo(debt.paidAt)}
                </span>
              )}
              <span className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                Registrada {new Date(debt.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {debt.status === 'pending' && (
              <>
                <button onClick={() => onAbono(debt)} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105" style={{ backgroundColor: '#EFF6FF', color: '#3B82F6', fontFamily: 'var(--font-caption)' }} title="Registrar abono parcial">
                  <Icon name="Minus" size={11} color="#3B82F6" />
                  Abonar
                </button>
                <button onClick={() => onMarkPaid(debt)} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105" style={{ backgroundColor: '#ECFDF5', color: '#059669', fontFamily: 'var(--font-caption)' }}>
                  <Icon name="Check" size={11} color="#059669" />
                  Pagar
                </button>
              </>
            )}
            <div className="relative">
              <button className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted" onClick={() => setMenuOpen((p) => !p)} aria-label="Opciones">
                <Icon name="MoreVertical" size={13} color="var(--color-muted-foreground)" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-8 z-10 rounded-xl border shadow-lg py-1 min-w-[130px]" style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)' }}>
                  <button className="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-muted text-left" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }} onClick={() => { setMenuOpen(false); onEdit(debt); }}>
                    <Icon name="Edit2" size={12} color="currentColor" /> Editar
                  </button>
                  <button className="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-muted text-left" style={{ color: '#EF4444', fontFamily: 'var(--font-caption)' }} onClick={() => { setMenuOpen(false); onDelete(debt); }}>
                    <Icon name="Trash2" size={12} color="#EF4444" /> Eliminar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────
export default function SupplierDetail() {
  const { supplierId } = useParams();
  const navigate = useNavigate();
  const { business } = useAuth();
  const fmt = (n) => formatMoney(n, business?.currency);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [supplier, setSupplier] = useState(null);
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [debtFormOpen, setDebtFormOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState(null);
  const [abonoDebt, setAbonoDebt] = useState(null);
  const [tab, setTab] = useState('pending');

  const load = useCallback(async () => {
    if (!supplierId) return;
    setLoading(true);
    const [{ data: s }, { data: d }] = await Promise.all([getSupplier(supplierId), getSupplierDebts(supplierId)]);
    setSupplier(s);
    setDebts(d ?? []);
    setLoading(false);
  }, [supplierId]);

  useEffect(() => { load(); }, [load]);

  const handleSaveSupplier = async (form) => {
    const { error } = await updateSupplier(supplierId, form);
    if (error) throw error;
    await load();
  };

  const handleSaveDebt = async (form) => {
    if (editingDebt) {
      const { error } = await updateSupplierDebt(editingDebt.id, form);
      if (error) throw error;
    } else {
      const { error } = await createSupplierDebt(business.id, supplierId, form);
      if (error) throw error;
    }
    await load();
  };

  const handleMarkPaid = async (debt) => {
    await markDebtAsPaid(debt.id, debt.amount);
    await load();
  };

  const handleAbono = async (paymentAmount) => {
    await addDebtPayment(abonoDebt.id, paymentAmount, abonoDebt.amountPaid ?? 0, abonoDebt.amount);
    await load();
  };

  const handleDeleteDebt = async (debt) => {
    if (!window.confirm(`¿Eliminar la deuda "${debt.description}"?`)) return;
    await deleteSupplierDebt(debt.id);
    await load();
  };

  const pendingDebts = debts.filter((d) => d.status !== 'paid');
  const paidDebts = debts.filter((d) => d.status === 'paid');
  const totalPending = pendingDebts.reduce((s, d) => s + (d.balance ?? d.amount), 0);
  const totalPaid = paidDebts.reduce((s, d) => s + d.amount, 0);
  const totalHistorical = debts.reduce((s, d) => s + d.amount, 0);
  const lastPaid = paidDebts.sort((a, b) => new Date(b.paidAt ?? 0) - new Date(a.paidAt ?? 0))[0];

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const hasOverdue = pendingDebts.some((d) => d.dueDate && new Date(d.dueDate) < today);

  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';

  if (loading) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
        <BusinessSidebar isCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
        <main style={{ paddingLeft: sidebarWidth }}>
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--color-primary)' }} />
          </div>
        </main>
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
        <BusinessSidebar isCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
        <main style={{ paddingLeft: sidebarWidth }}>
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <p style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Proveedor no encontrado</p>
            <button onClick={() => navigate('/proveedores')} className="text-sm font-medium underline" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}>Volver</button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <BusinessSidebar isCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <main className="transition-all duration-200" style={{ paddingLeft: sidebarWidth, paddingBottom: '80px' }}>
        <div className="max-w-2xl mx-auto px-4 py-6 lg:px-6">
          {/* Back */}
          <button onClick={() => navigate('/proveedores')} className="flex items-center gap-1.5 text-sm mb-5 transition-colors hover:opacity-80" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            <Icon name="ArrowLeft" size={15} color="currentColor" /> Proveedores y Cuentas por Pagar
          </button>

          {/* Header card */}
          <div className="rounded-2xl border p-5 mb-4 overflow-hidden" style={{
            backgroundColor: '#FFFFFF', borderColor: hasOverdue ? '#FECACA' : 'var(--color-border)',
            background: hasOverdue ? 'linear-gradient(135deg, #FFFFFF 60%, #FFF5F5 100%)' : 'linear-gradient(135deg, #FFFFFF 60%, #F0FDF4 100%)',
          }}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black shadow-md"
                  style={{ background: hasOverdue ? 'linear-gradient(135deg, #FEE2E2, #FECACA)' : 'linear-gradient(135deg, #EEF2FF, #DDD6FE)', color: hasOverdue ? '#EF4444' : '#6366F1' }}>
                  {supplier.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h1 className="text-lg font-bold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>{supplier.name}</h1>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {supplier.contactName && <span className="text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{supplier.contactName}</span>}
                    {supplier.supplierType && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#F3F4F6', color: '#6B7280', fontFamily: 'var(--font-caption)' }}>
                        {TYPE_LABELS[supplier.supplierType] ?? supplier.supplierType}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={() => setEditOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors hover:bg-muted flex-shrink-0"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                <Icon name="Edit2" size={13} color="currentColor" /> Editar
              </button>
            </div>

            {/* Contact */}
            {(supplier.phone || supplier.email || supplier.notes) && (
              <div className="flex flex-wrap gap-3 mb-4 pb-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
                {supplier.phone && <a href={`tel:${supplier.phone}`} className="flex items-center gap-1.5 text-sm hover:opacity-80" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}><Icon name="Phone" size={13} color="var(--color-muted-foreground)" />{supplier.phone}</a>}
                {supplier.email && <a href={`mailto:${supplier.email}`} className="flex items-center gap-1.5 text-sm hover:opacity-80" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}><Icon name="Mail" size={13} color="var(--color-muted-foreground)" />{supplier.email}</a>}
                {supplier.notes && <p className="flex items-start gap-1.5 text-sm w-full" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}><Icon name="FileText" size={13} color="currentColor" className="flex-shrink-0 mt-0.5" />{supplier.notes}</p>}
              </div>
            )}

            {/* Timeline financiero */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                { label: 'Pendiente', value: `$ ${fmt(totalPending)}`, color: hasOverdue ? '#EF4444' : '#6366F1', bg: hasOverdue ? '#FEF2F2' : '#EEF2FF', sub: `${pendingDebts.length} deuda${pendingDebts.length !== 1 ? 's' : ''}` },
                { label: 'Pagado histórico', value: `$ ${fmt(totalPaid)}`, color: '#10B981', bg: '#ECFDF5', sub: `${paidDebts.length} pago${paidDebts.length !== 1 ? 's' : ''}` },
                { label: 'Compras registradas', value: debts.length, color: '#3B82F6', bg: '#EFF6FF', sub: `$ ${fmt(totalHistorical)} total` },
                { label: 'Último pago', value: lastPaid ? timeAgo(lastPaid.paidAt) : '—', color: lastPaid ? '#10B981' : '#9CA3AF', bg: lastPaid ? '#ECFDF5' : '#F9FAFB', sub: lastPaid ? `$ ${fmt(lastPaid.amount)}` : 'Sin pagos' },
              ].map((m) => (
                <div key={m.label} className="rounded-xl p-3" style={{ backgroundColor: m.bg }}>
                  <p className="text-[10px] font-medium mb-1 leading-tight" style={{ color: m.color, fontFamily: 'var(--font-caption)', opacity: 0.8 }}>{m.label}</p>
                  <p className="text-base font-bold leading-tight" style={{ color: m.color, fontFamily: 'var(--font-stat)' }}>{m.value}</p>
                  {m.sub && <p className="text-[10px] mt-0.5" style={{ color: m.color, fontFamily: 'var(--font-caption)', opacity: 0.7 }}>{m.sub}</p>}
                </div>
              ))}
            </div>

            {/* Financial health bar */}
            {totalHistorical > 0 && (
              <div>
                <div className="flex justify-between text-xs mb-1.5" style={{ fontFamily: 'var(--font-caption)' }}>
                  <span style={{ color: '#10B981' }}>Pagado {Math.round((totalPaid / totalHistorical) * 100)}%</span>
                  <span style={{ color: 'var(--color-muted-foreground)' }}>Pendiente {Math.round((totalPending / totalHistorical) * 100)}%</span>
                </div>
                <div className="w-full rounded-full h-2 overflow-hidden" style={{ backgroundColor: hasOverdue ? '#FEE2E2' : '#E5E7EB' }}>
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min((totalPaid / totalHistorical) * 100, 100)}%`, backgroundColor: '#10B981' }} />
                </div>
              </div>
            )}
          </div>

          {/* Debt tabs + add button */}
          <div className="flex items-center justify-between mb-3 gap-2">
            <div className="flex gap-1">
              {[
                { key: 'pending', label: `Pendientes (${pendingDebts.length})` },
                { key: 'paid', label: `Pagadas (${paidDebts.length})` },
              ].map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)} className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                  style={{ fontFamily: 'var(--font-caption)', backgroundColor: tab === t.key ? 'var(--color-primary)' : '#FFFFFF', color: tab === t.key ? '#fff' : 'var(--color-muted-foreground)', border: `1px solid ${tab === t.key ? 'transparent' : 'var(--color-border)'}` }}>
                  {t.label}
                </button>
              ))}
            </div>
            <button onClick={() => { setEditingDebt(null); setDebtFormOpen(true); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:opacity-90 active:scale-95"
              style={{ backgroundColor: 'var(--color-primary)', color: '#fff', fontFamily: 'var(--font-caption)' }}>
              <Icon name="Plus" size={13} color="#fff" /> Registrar deuda
            </button>
          </div>

          {/* Timeline */}
          {(tab === 'pending' ? pendingDebts : paidDebts).length === 0 ? (
            <div className="text-center py-10" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              <Icon name={tab === 'pending' ? 'CheckCircle2' : 'Clock'} size={28} color="currentColor" className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">{tab === 'pending' ? '¡Sin deudas pendientes!' : 'Todavía no hay deudas pagadas'}</p>
            </div>
          ) : (
            <div>
              {(tab === 'pending' ? pendingDebts : paidDebts).map((d, i, arr) => (
                <DebtTimelineItem
                  key={d.id}
                  debt={d}
                  isLast={i === arr.length - 1}
                  onMarkPaid={handleMarkPaid}
                  onAbono={(debt) => setAbonoDebt(debt)}
                  onEdit={(debt) => { setEditingDebt(debt); setDebtFormOpen(true); }}
                  onDelete={handleDeleteDebt}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <SupplierFormModal open={editOpen} onClose={() => setEditOpen(false)} onSave={handleSaveSupplier} supplier={supplier} />
      <DebtFormModal open={debtFormOpen} onClose={() => setDebtFormOpen(false)} onSave={handleSaveDebt} debt={editingDebt} />
      <PaymentModal open={!!abonoDebt} onClose={() => setAbonoDebt(null)} onSave={handleAbono} debt={abonoDebt} />
    </div>
  );
}
