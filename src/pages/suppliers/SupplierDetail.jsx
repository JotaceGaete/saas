import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';
import BusinessSidebar from 'components/ui/BusinessSidebar';
import { useAuth } from '../../contexts/AuthContext';
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

function fmt(n) {
  return new Intl.NumberFormat('es', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n ?? 0);
}

function fmtDate(dateStr, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('es', opts);
}

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

// ── Abono modal ───────────────────────────────────────────────────
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
    if (n > balance) { setError(`El monto no puede superar $ ${fmt(balance)}`); return; }
    setSaving(true); setError('');
    try { await onSave(n); onClose(); }
    catch (err) { setError(err?.message ?? 'Error'); }
    finally { setSaving(false); }
  };

  if (!open || !debt) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(2px)' }} onClick={onClose}>
      <div className="w-full max-w-xs rounded-2xl border shadow-xl overflow-hidden" style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div>
            <h2 className="text-sm font-bold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>Registrar abono</h2>
            <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{debt.description}</p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center">
            <Icon name="X" size={15} color="var(--color-muted-foreground)" />
          </button>
        </div>
        <div className="px-5 pt-4 pb-2 space-y-1">
          <div className="flex justify-between text-xs" style={{ fontFamily: 'var(--font-caption)' }}>
            <span style={{ color: 'var(--color-muted-foreground)' }}>Monto original</span>
            <span style={{ color: 'var(--color-foreground)', fontWeight: 600 }}>$ {fmt(debt.amount)}</span>
          </div>
          {(debt.amountPaid ?? 0) > 0 && (
            <div className="flex justify-between text-xs" style={{ fontFamily: 'var(--font-caption)' }}>
              <span style={{ color: '#10B981' }}>Abonado</span>
              <span style={{ color: '#10B981', fontWeight: 600 }}>- $ {fmt(debt.amountPaid)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-bold border-t pt-2" style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}>
            <span>Saldo pendiente</span>
            <span style={{ color: '#EF4444' }}>$ {fmt(balance)}</span>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-3 pt-3">
          {error && <p className="text-xs bg-red-50 text-red-600 rounded-lg px-3 py-2" style={{ fontFamily: 'var(--font-caption)' }}>{error}</p>}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>Monto del abono *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>$</span>
              <input type="number" min="0.01" step="0.01" max={balance} value={amount} onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00" autoFocus
                className="w-full pl-7 pr-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }} />
            </div>
            <button type="button" className="text-xs mt-1 underline" style={{ color: '#6366F1', fontFamily: 'var(--font-caption)' }} onClick={() => setAmount(String(balance))}>
              Usar saldo completo ($ {fmt(balance)})
            </button>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border text-sm font-medium hover:bg-muted"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60"
              style={{ backgroundColor: '#10B981', color: '#fff', fontFamily: 'var(--font-caption)' }}>
              {saving ? 'Registrando...' : 'Registrar abono'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Timeline entry ────────────────────────────────────────────────
function TimelineEntry({ debt, onMarkPaid, onAbono, onEdit, onDelete, isLast, runningBalance }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isOverdue = debt.status === 'pending' && debt.dueDate && new Date(debt.dueDate) < today;
  const balance = debt.balance ?? (debt.amount - (debt.amountPaid ?? 0));
  const hasPartial = (debt.amountPaid ?? 0) > 0 && debt.status !== 'paid';
  const isPaid = debt.status === 'paid';
  const [menuOpen, setMenuOpen] = useState(false);

  const cfg = isPaid
    ? { color: '#10B981', bg: '#ECFDF5', icon: 'CheckCircle2', label: 'Pagado', lineColor: '#10B981' }
    : isOverdue
      ? { color: '#EF4444', bg: '#FEF2F2', icon: 'AlertCircle', label: 'Vencido', lineColor: '#EF4444' }
      : hasPartial
        ? { color: '#3B82F6', bg: '#EFF6FF', icon: 'Clock', label: 'Abonado parcialmente', lineColor: '#3B82F6' }
        : { color: '#6366F1', bg: '#EEF2FF', icon: 'Clock', label: 'Pendiente', lineColor: '#6366F1' };

  const eventDate = debt.paidAt || debt.createdAt;

  return (
    <div className="relative flex gap-4">
      {/* Timeline spine */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div className="w-9 h-9 rounded-full flex items-center justify-center z-10 shadow-sm"
          style={{ backgroundColor: cfg.bg, border: `2px solid ${cfg.color}` }}>
          <Icon name={cfg.icon} size={15} color={cfg.color} />
        </div>
        {!isLast && <div className="w-px flex-1 mt-1" style={{ backgroundColor: 'var(--color-border)', minHeight: '20px' }} />}
      </div>

      {/* Card */}
      <div className="flex-1 rounded-2xl border group mb-4 overflow-hidden"
        style={{
          backgroundColor: '#FFFFFF',
          borderColor: isOverdue ? '#FECACA' : 'var(--color-border)',
          borderLeftWidth: '3px',
          borderLeftColor: cfg.lineColor,
        }}>
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              {/* Date + badge */}
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                  {fmtDate(eventDate, { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: cfg.bg, color: cfg.color, fontFamily: 'var(--font-caption)' }}>
                  {cfg.label}
                </span>
              </div>

              {/* Description */}
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                {debt.description}
              </p>

              {/* Amount */}
              <div className="flex items-baseline gap-2">
                <p className="text-xl font-black"
                  style={{ color: isOverdue ? '#EF4444' : isPaid ? '#10B981' : 'var(--color-foreground)', fontFamily: 'var(--font-stat)' }}>
                  {isPaid ? '' : ''}$ {fmt(isPaid ? debt.amount : balance)}
                </p>
                {!isPaid && balance !== debt.amount && (
                  <p className="text-xs line-through" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>$ {fmt(debt.amount)}</p>
                )}
              </div>

              {/* Partial payment bar */}
              {hasPartial && (
                <div className="mt-2">
                  <div className="flex justify-between text-[10px] mb-1" style={{ fontFamily: 'var(--font-caption)' }}>
                    <span style={{ color: '#10B981' }}>Abonado $ {fmt(debt.amountPaid)}</span>
                    <span style={{ color: 'var(--color-muted-foreground)' }}>Saldo $ {fmt(balance)}</span>
                  </div>
                  <div className="w-full rounded-full h-1.5 overflow-hidden" style={{ backgroundColor: '#E5E7EB' }}>
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(((debt.amountPaid ?? 0) / debt.amount) * 100, 100)}%`, backgroundColor: '#10B981' }} />
                  </div>
                </div>
              )}

              {/* Dates */}
              <div className="flex flex-wrap gap-3 mt-2">
                {debt.dueDate && !isPaid && (
                  <span className="text-xs flex items-center gap-1"
                    style={{ color: isOverdue ? '#EF4444' : '#D97706', fontFamily: 'var(--font-caption)' }}>
                    <Icon name="Calendar" size={11} color="currentColor" />
                    {isOverdue
                      ? `Venció ${fmtDate(debt.dueDate, { day: 'numeric', month: 'long' })}`
                      : `Vence ${fmtDate(debt.dueDate, { day: 'numeric', month: 'long' })}`}
                  </span>
                )}
                {debt.paidAt && (
                  <span className="text-xs flex items-center gap-1" style={{ color: '#10B981', fontFamily: 'var(--font-caption)' }}>
                    <Icon name="CheckCircle" size={11} color="currentColor" />
                    Pagado {timeAgo(debt.paidAt)}
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {!isPaid && (
                <>
                  <button onClick={() => onAbono(debt)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105 active:scale-95"
                    style={{ backgroundColor: '#EFF6FF', color: '#3B82F6', fontFamily: 'var(--font-caption)' }}
                    title="Abonar parcialmente">
                    <Icon name="Minus" size={11} color="#3B82F6" />
                    Abonar
                  </button>
                  <button onClick={() => onMarkPaid(debt)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105 active:scale-95"
                    style={{ backgroundColor: '#ECFDF5', color: '#059669', fontFamily: 'var(--font-caption)' }}>
                    <Icon name="Check" size={11} color="#059669" />
                    Pagar
                  </button>
                </>
              )}
              <div className="relative">
                <button className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
                  onClick={() => setMenuOpen((p) => !p)} aria-label="Opciones">
                  <Icon name="MoreVertical" size={13} color="var(--color-muted-foreground)" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-8 z-10 rounded-xl border shadow-lg py-1 min-w-[130px]"
                    style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)' }}>
                    <button className="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-muted text-left"
                      style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
                      onClick={() => { setMenuOpen(false); onEdit(debt); }}>
                      <Icon name="Edit2" size={12} color="currentColor" /> Editar
                    </button>
                    <button className="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-muted text-left"
                      style={{ color: '#EF4444', fontFamily: 'var(--font-caption)' }}
                      onClick={() => { setMenuOpen(false); onDelete(debt); }}>
                      <Icon name="Trash2" size={12} color="#EF4444" /> Eliminar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Running balance */}
          {runningBalance !== undefined && !isPaid && (
            <div className="mt-3 pt-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
              <span className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                Saldo acumulado en este punto
              </span>
              <span className="text-sm font-bold" style={{ color: isOverdue ? '#EF4444' : '#6366F1', fontFamily: 'var(--font-stat)' }}>
                $ {fmt(runningBalance)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Month Divider ─────────────────────────────────────────────────
function MonthDivider({ label }) {
  return (
    <div className="flex items-center gap-3 my-4 ml-12">
      <div className="h-px flex-1" style={{ backgroundColor: 'var(--color-border)' }} />
      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
        style={{ color: 'var(--color-muted-foreground)', backgroundColor: '#F3F4F6', fontFamily: 'var(--font-caption)' }}>
        {label}
      </span>
      <div className="h-px flex-1" style={{ backgroundColor: 'var(--color-border)' }} />
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────
export default function SupplierDetail() {
  const { supplierId } = useParams();
  const navigate = useNavigate();
  const { business } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [supplier, setSupplier] = useState(null);
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [debtFormOpen, setDebtFormOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState(null);
  const [abonoDebt, setAbonoDebt] = useState(null);
  const [timelineFilter, setTimelineFilter] = useState('all');

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
  const lastPaid = [...paidDebts].sort((a, b) => new Date(b.paidAt ?? 0) - new Date(a.paidAt ?? 0))[0];

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const hasOverdue = pendingDebts.some((d) => d.dueDate && new Date(d.dueDate) < today);

  // Cronological timeline (all debts sorted newest first)
  const timelineDebts = [...debts]
    .filter((d) => {
      if (timelineFilter === 'pending') return d.status === 'pending';
      if (timelineFilter === 'paid') return d.status === 'paid';
      return true;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Compute running balance (from newest to oldest, balance increases going back in time)
  // We show balance at each "pending" entry
  let runningBal = totalPending;
  const runningBalances = {};
  for (const d of timelineDebts) {
    if (d.status !== 'paid') {
      runningBalances[d.id] = runningBal;
      runningBal -= (d.balance ?? (d.amount - (d.amountPaid ?? 0)));
    }
  }

  // Group by month
  const monthGroups = [];
  let currentMonth = null;
  for (const debt of timelineDebts) {
    const eventDate = new Date(debt.paidAt || debt.createdAt);
    const monthKey = `${eventDate.getFullYear()}-${eventDate.getMonth()}`;
    const monthLabel = eventDate.toLocaleDateString('es', { month: 'long', year: 'numeric' });
    if (monthKey !== currentMonth) {
      currentMonth = monthKey;
      monthGroups.push({ monthKey, monthLabel, items: [] });
    }
    monthGroups[monthGroups.length - 1].items.push(debt);
  }

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
          <button onClick={() => navigate('/proveedores')} className="flex items-center gap-1.5 text-sm mb-5 transition-colors hover:opacity-80"
            style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            <Icon name="ArrowLeft" size={15} color="currentColor" /> Compras y Proveedores
          </button>

          {/* Header card */}
          <div className="rounded-2xl border p-5 mb-4 overflow-hidden"
            style={{
              backgroundColor: '#FFFFFF',
              borderColor: hasOverdue ? '#FECACA' : 'var(--color-border)',
              background: hasOverdue
                ? 'linear-gradient(135deg, #FFFFFF 60%, #FFF5F5 100%)'
                : 'linear-gradient(135deg, #FFFFFF 60%, #F5F3FF 100%)',
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
                    {supplier.contactName && (
                      <span className="text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{supplier.contactName}</span>
                    )}
                    {supplier.supplierType && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: '#F3F4F6', color: '#6B7280', fontFamily: 'var(--font-caption)' }}>
                        {TYPE_LABELS[supplier.supplierType] ?? supplier.supplierType}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={() => setEditOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors hover:bg-muted flex-shrink-0"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                <Icon name="Edit2" size={13} color="currentColor" /> Editar
              </button>
            </div>

            {/* Contact info */}
            {(supplier.phone || supplier.email || supplier.notes) && (
              <div className="flex flex-wrap gap-3 mb-4 pb-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
                {supplier.phone && (
                  <a href={`tel:${supplier.phone}`} className="flex items-center gap-1.5 text-sm hover:opacity-80"
                    style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                    <Icon name="Phone" size={13} color="var(--color-muted-foreground)" />{supplier.phone}
                  </a>
                )}
                {supplier.email && (
                  <a href={`mailto:${supplier.email}`} className="flex items-center gap-1.5 text-sm hover:opacity-80"
                    style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                    <Icon name="Mail" size={13} color="var(--color-muted-foreground)" />{supplier.email}
                  </a>
                )}
                {supplier.notes && (
                  <p className="flex items-start gap-1.5 text-sm w-full"
                    style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                    <Icon name="FileText" size={13} color="currentColor" className="flex-shrink-0 mt-0.5" />{supplier.notes}
                  </p>
                )}
              </div>
            )}

            {/* Financial metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                {
                  label: 'Pendiente',
                  value: `$ ${fmt(totalPending)}`,
                  color: hasOverdue ? '#EF4444' : totalPending > 0 ? '#6366F1' : '#10B981',
                  bg: hasOverdue ? '#FEF2F2' : totalPending > 0 ? '#EEF2FF' : '#ECFDF5',
                  sub: pendingDebts.length > 0 ? `${pendingDebts.length} deuda${pendingDebts.length !== 1 ? 's' : ''}` : 'Al día',
                },
                {
                  label: 'Pagado histórico',
                  value: `$ ${fmt(totalPaid)}`,
                  color: '#10B981', bg: '#ECFDF5',
                  sub: `${paidDebts.length} pago${paidDebts.length !== 1 ? 's' : ''}`,
                },
                {
                  label: 'Operaciones',
                  value: debts.length,
                  color: '#3B82F6', bg: '#EFF6FF',
                  sub: `$ ${fmt(totalHistorical)} total`,
                },
                {
                  label: 'Último pago',
                  value: lastPaid ? timeAgo(lastPaid.paidAt) : '—',
                  color: lastPaid ? '#10B981' : '#9CA3AF',
                  bg: lastPaid ? '#ECFDF5' : '#F9FAFB',
                  sub: lastPaid ? `$ ${fmt(lastPaid.amount)}` : 'Sin pagos',
                },
              ].map((m) => (
                <div key={m.label} className="rounded-xl p-3" style={{ backgroundColor: m.bg }}>
                  <p className="text-[10px] font-semibold mb-1 leading-tight uppercase tracking-wide"
                    style={{ color: m.color, fontFamily: 'var(--font-caption)', opacity: 0.8 }}>{m.label}</p>
                  <p className="text-base font-bold leading-tight" style={{ color: m.color, fontFamily: 'var(--font-stat)' }}>{m.value}</p>
                  {m.sub && <p className="text-[10px] mt-0.5" style={{ color: m.color, fontFamily: 'var(--font-caption)', opacity: 0.7 }}>{m.sub}</p>}
                </div>
              ))}
            </div>

            {/* Progress bar */}
            {totalHistorical > 0 && (
              <div>
                <div className="flex justify-between text-xs mb-1.5" style={{ fontFamily: 'var(--font-caption)' }}>
                  <span style={{ color: '#10B981' }}>Pagado {Math.round((totalPaid / totalHistorical) * 100)}%</span>
                  <span style={{ color: 'var(--color-muted-foreground)' }}>Pendiente {Math.round((totalPending / totalHistorical) * 100)}%</span>
                </div>
                <div className="w-full rounded-full h-2 overflow-hidden" style={{ backgroundColor: hasOverdue ? '#FEE2E2' : '#E5E7EB' }}>
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${Math.min((totalPaid / totalHistorical) * 100, 100)}%`, backgroundColor: '#10B981' }} />
                </div>
              </div>
            )}
          </div>

          {/* Actions band */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
            <button
              onClick={() => { setEditingDebt(null); setDebtFormOpen(true); }}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all hover:opacity-90 active:scale-95 shadow-sm"
              style={{ background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)', color: '#fff', fontFamily: 'var(--font-caption)' }}
            >
              <Icon name="ShoppingCart" size={14} color="#fff" />
              Nueva compra
            </button>
            <button
              onClick={() => { setEditingDebt(null); setDebtFormOpen(true); }}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all hover:bg-indigo-50 active:scale-95"
              style={{ backgroundColor: '#EEF2FF', color: '#6366F1', border: '1.5px solid #C7D2FE', fontFamily: 'var(--font-caption)' }}
            >
              <Icon name="FilePlus" size={14} color="#6366F1" />
              Registrar deuda
            </button>
            {pendingDebts.length > 0 && (
              <button
                onClick={() => { if (pendingDebts[0]) handleMarkPaid(pendingDebts[0]); }}
                className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all hover:bg-green-50 active:scale-95 col-span-2 sm:col-span-1"
                style={{ backgroundColor: '#ECFDF5', color: '#059669', border: '1.5px solid #A7F3D0', fontFamily: 'var(--font-caption)' }}
                title={`Pagar "${pendingDebts[0]?.description}"`}
              >
                <Icon name="CheckCircle" size={14} color="#059669" />
                Pagar primera deuda
              </button>
            )}
          </div>

          {/* Timeline header */}
          <div className="flex items-center justify-between mb-4 gap-2">
            <div>
              <h2 className="text-sm font-bold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>
                Cuenta corriente
              </h2>
              <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                {debts.length} operacion{debts.length !== 1 ? 'es' : ''} registrada{debts.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex gap-1">
              {[
                { key: 'all', label: 'Todas' },
                { key: 'pending', label: `Pendientes (${pendingDebts.length})` },
                { key: 'paid', label: `Pagadas (${paidDebts.length})` },
              ].map((t) => (
                <button key={t.key} onClick={() => setTimelineFilter(t.key)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
                  style={{ fontFamily: 'var(--font-caption)', backgroundColor: timelineFilter === t.key ? 'var(--color-primary)' : '#FFFFFF', color: timelineFilter === t.key ? '#fff' : 'var(--color-muted-foreground)', border: `1px solid ${timelineFilter === t.key ? 'transparent' : 'var(--color-border)'}` }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Saldo actual banner */}
          {totalPending > 0 && (
            <div className="flex items-center justify-between px-4 py-3 rounded-xl mb-4"
              style={{ backgroundColor: hasOverdue ? '#FEF2F2' : '#EEF2FF', border: `1px solid ${hasOverdue ? '#FECACA' : '#C7D2FE'}` }}>
              <span className="text-xs font-semibold" style={{ color: hasOverdue ? '#EF4444' : '#6366F1', fontFamily: 'var(--font-caption)' }}>
                Saldo actual pendiente
              </span>
              <span className="text-lg font-black" style={{ color: hasOverdue ? '#EF4444' : '#6366F1', fontFamily: 'var(--font-stat)' }}>
                $ {fmt(totalPending)}
              </span>
            </div>
          )}

          {/* Timeline */}
          {timelineDebts.length === 0 ? (
            <div className="text-center py-10" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              <Icon name="FileText" size={28} color="currentColor" className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">
                {timelineFilter === 'pending' ? '¡Sin deudas pendientes!' : timelineFilter === 'paid' ? 'Todavía no hay operaciones pagadas' : 'Sin operaciones registradas'}
              </p>
              <button onClick={() => { setEditingDebt(null); setDebtFormOpen(true); }}
                className="mt-3 text-xs underline" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}>
                Registrar primera compra
              </button>
            </div>
          ) : (
            <div>
              {monthGroups.map((group) => (
                <div key={group.monthKey}>
                  <MonthDivider label={group.monthLabel} />
                  {group.items.map((d, i, arr) => (
                    <TimelineEntry
                      key={d.id}
                      debt={d}
                      isLast={i === arr.length - 1 && group === monthGroups[monthGroups.length - 1]}
                      runningBalance={d.status === 'pending' ? runningBalances[d.id] : undefined}
                      onMarkPaid={handleMarkPaid}
                      onAbono={(debt) => setAbonoDebt(debt)}
                      onEdit={(debt) => { setEditingDebt(debt); setDebtFormOpen(true); }}
                      onDelete={handleDeleteDebt}
                    />
                  ))}
                </div>
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
