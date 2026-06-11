import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';
import BusinessSidebar from 'components/ui/BusinessSidebar';
import { useAuth } from '../../contexts/AuthContext';
import {
  getSuppliers,
  getAllBusinessDebts,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  markDebtAsPaid,
  createSupplierDebt,
} from '../../services/waBusinessService';
import { getEffectivePlanSlug } from '../../services/waBusinessService';
import { getPlanLimits } from '../../constants/plans';
import SupplierFormModal from '../../components/SupplierFormModal';
import UpcomingDueBanner from '../../components/UpcomingDueBanner';

// ── Health score ──────────────────────────────────────────────────
function computeHealth(debts) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const in7 = new Date(today); in7.setDate(in7.getDate() + 7);
  const pending = debts.filter((d) => d.status === 'pending');
  if (pending.length === 0) return 'healthy';
  const hasOverdue = pending.some((d) => d.dueDate && new Date(d.dueDate) < today);
  if (hasOverdue) return 'critical';
  const hasSoon = pending.some((d) => d.dueDate && new Date(d.dueDate) <= in7);
  if (hasSoon) return 'warning';
  return 'pending';
}

const HEALTH = {
  healthy:  { label: 'Al día',      desc: 'Sin deudas pendientes',   color: '#10B981', bg: '#ECFDF5', dot: '#10B981' },
  pending:  { label: 'Con deuda',   desc: 'Tiene deudas sin vencer', color: '#6366F1', bg: '#EEF2FF', dot: '#6366F1' },
  warning:  { label: 'Atención',    desc: 'Vence esta semana',       color: '#F59E0B', bg: '#FFFBEB', dot: '#F59E0B' },
  critical: { label: 'Vencido',     desc: 'Tiene deudas vencidas',   color: '#EF4444', bg: '#FEF2F2', dot: '#EF4444' },
};

const TYPE_LABELS = {
  mercaderia: 'Mercadería', insumos: 'Insumos', servicios: 'Servicios',
  transporte: 'Transporte', arriendo: 'Arriendo', marketing: 'Marketing', otros: 'Otros',
};

const TYPE_ICONS = {
  mercaderia: 'ShoppingBag', insumos: 'Package', servicios: 'Briefcase',
  transporte: 'Truck', arriendo: 'Home', marketing: 'Megaphone', otros: 'MoreHorizontal',
};

function fmt(n) {
  return new Intl.NumberFormat('es', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n ?? 0);
}

function fmtDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

// ── Nueva Compra modal (2 pasos) ─────────────────────────────────
function NewPurchaseModal({ open, onClose, suppliers, onSuccess, businessId }) {
  const [step, setStep] = useState(1);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [form, setForm] = useState({ description: '', amount: '', dueDate: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setStep(1); setSelectedSupplierId(''); setForm({ description: '', amount: '', dueDate: '' }); setError(''); }
  }, [open]);

  const handleNext = () => {
    if (!selectedSupplierId) { setError('Seleccioná un proveedor'); return; }
    setError('');
    setStep(2);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.description.trim()) { setError('La descripción es obligatoria'); return; }
    const amount = parseFloat(form.amount);
    if (!form.amount || isNaN(amount) || amount <= 0) { setError('Ingresá un monto válido'); return; }
    setSaving(true); setError('');
    try {
      const { error: err } = await createSupplierDebt(businessId, selectedSupplierId, {
        description: form.description.trim(),
        amount,
        dueDate: form.dueDate || null,
      });
      if (err) throw err;
      onSuccess();
      onClose();
    } catch (err) {
      setError(err?.message ?? 'Error al registrar la compra');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(3px)' }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border shadow-2xl overflow-hidden" style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--color-border)', background: 'linear-gradient(135deg, #EEF2FF 0%, #F5F3FF 100%)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#6366F1' }}>
              <Icon name="ShoppingCart" size={16} color="#fff" />
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>Nueva compra</h2>
              <p className="text-[11px]" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                {step === 1 ? 'Paso 1: Seleccioná el proveedor' : `Paso 2: Detalle de la compra`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-white/60 flex items-center justify-center transition-colors">
            <Icon name="X" size={15} color="var(--color-muted-foreground)" />
          </button>
        </div>

        {/* Pasos */}
        <div className="flex gap-1 px-5 pt-4">
          {[1, 2].map((s) => (
            <div key={s} className="flex-1 h-1 rounded-full transition-all duration-300" style={{ backgroundColor: s <= step ? '#6366F1' : '#E5E7EB' }} />
          ))}
        </div>

        {error && (
          <div className="mx-5 mt-3 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: '#FEF2F2', color: '#EF4444', fontFamily: 'var(--font-caption)' }}>
            {error}
          </div>
        )}

        {step === 1 ? (
          <div className="px-5 py-4 space-y-3">
            <p className="text-xs font-medium" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>¿A qué proveedor le compraste?</p>
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {suppliers.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSupplierId(s.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all"
                  style={{
                    borderColor: selectedSupplierId === s.id ? '#6366F1' : 'var(--color-border)',
                    backgroundColor: selectedSupplierId === s.id ? '#EEF2FF' : '#FAFAFA',
                    outline: selectedSupplierId === s.id ? '2px solid #C7D2FE' : 'none',
                  }}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: '#6366F122', color: '#6366F1' }}>
                    {s.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>{s.name}</p>
                    {s.supplierType && s.supplierType !== 'otros' && (
                      <p className="text-[11px]" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{TYPE_LABELS[s.supplierType]}</p>
                    )}
                  </div>
                  {selectedSupplierId === s.id && <Icon name="CheckCircle2" size={16} color="#6366F1" />}
                </button>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border text-sm font-medium hover:bg-muted transition-colors"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                Cancelar
              </button>
              <button onClick={handleNext} className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-95"
                style={{ backgroundColor: selectedSupplierId ? '#6366F1' : '#D1D5DB', color: '#fff', fontFamily: 'var(--font-caption)' }}>
                Continuar →
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
            {selectedSupplier && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ backgroundColor: '#EEF2FF' }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ backgroundColor: '#6366F1', color: '#fff' }}>
                  {selectedSupplier.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-semibold" style={{ color: '#6366F1', fontFamily: 'var(--font-caption)' }}>{selectedSupplier.name}</span>
                <button type="button" onClick={() => setStep(1)} className="ml-auto text-[11px] underline" style={{ color: '#6366F1', fontFamily: 'var(--font-caption)' }}>Cambiar</button>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>¿Qué compraste? *</label>
              <input
                type="text" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Ej: Mercadería semana, insumos limpieza..."
                autoFocus
                className="w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>Monto total *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium" style={{ color: 'var(--color-muted-foreground)' }}>$</span>
                <input
                  type="number" min="0.01" step="any" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0"
                  className="w-full pl-7 pr-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                Fecha de vencimiento <span style={{ color: 'var(--color-muted-foreground)', fontWeight: 400 }}>(opcional)</span>
              </label>
              <input
                type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setStep(1)} className="px-4 py-2.5 rounded-xl border text-sm font-medium hover:bg-muted transition-colors"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                ← Atrás
              </button>
              <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60 transition-all hover:opacity-90 active:scale-95"
                style={{ backgroundColor: '#6366F1', color: '#fff', fontFamily: 'var(--font-caption)' }}>
                {saving ? 'Registrando...' : 'Registrar compra'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Financial Band ────────────────────────────────────────────────
function FinancialBand({ totalPending, overdueCount, dueNext7, paidThisMonth, suppliersWithDebt, totalSuppliers }) {
  const hasUrgency = overdueCount > 0;
  const hasDueSoon = dueNext7 > 0;

  return (
    <div className="rounded-2xl border overflow-hidden mb-5" style={{ borderColor: hasUrgency ? '#FECACA' : hasDueSoon ? '#FDE68A' : 'var(--color-border)' }}>
      {/* Hero metric */}
      <div className="px-5 pt-5 pb-4" style={{ background: hasUrgency ? 'linear-gradient(135deg, #FFF5F5 0%, #FEF2F2 100%)' : 'linear-gradient(135deg, #FAFAFA 0%, #F0F9FF 100%)' }}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)', letterSpacing: '0.06em' }}>
          Total pendiente por pagar
        </p>
        <div className="flex items-end gap-3 flex-wrap">
          <p className="text-4xl font-black leading-none" style={{ color: hasUrgency ? '#EF4444' : 'var(--color-foreground)', fontFamily: 'var(--font-stat)' }}>
            $ {fmt(totalPending)}
          </p>
          {suppliersWithDebt > 0 && (
            <p className="text-sm mb-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              {suppliersWithDebt} proveedor{suppliersWithDebt !== 1 ? 'es' : ''} con deuda
            </p>
          )}
        </div>
        {hasUrgency && (
          <div className="flex items-center gap-1.5 mt-2">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#EF4444' }} />
            <span className="text-xs font-semibold" style={{ color: '#EF4444', fontFamily: 'var(--font-caption)' }}>
              {overdueCount} deuda{overdueCount !== 1 ? 's' : ''} vencida{overdueCount !== 1 ? 's' : ''} — requieren atención
            </span>
          </div>
        )}
      </div>

      {/* Secondary metrics */}
      <div className="grid grid-cols-3 border-t" style={{ borderColor: hasUrgency ? '#FECACA' : 'var(--color-border)' }}>
        <div className="px-4 py-3 flex flex-col gap-0.5" style={{ borderRight: '1px solid var(--color-border)' }}>
          <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Vencidas</p>
          <p className="text-lg font-black leading-tight" style={{ color: overdueCount > 0 ? '#EF4444' : '#10B981', fontFamily: 'var(--font-stat)' }}>{overdueCount}</p>
          <p className="text-[10px]" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{overdueCount > 0 ? 'urgente' : 'todo ok'}</p>
        </div>
        <div className="px-4 py-3 flex flex-col gap-0.5" style={{ borderRight: '1px solid var(--color-border)' }}>
          <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Próx. 7 días</p>
          <p className="text-lg font-black leading-tight" style={{ color: dueNext7 > 0 ? '#F59E0B' : '#10B981', fontFamily: 'var(--font-stat)' }}>{dueNext7}</p>
          <p className="text-[10px]" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>vencimientos</p>
        </div>
        <div className="px-4 py-3 flex flex-col gap-0.5">
          <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Pagado este mes</p>
          <p className="text-lg font-black leading-tight" style={{ color: '#10B981', fontFamily: 'var(--font-stat)' }}>$ {fmt(paidThisMonth)}</p>
          <p className="text-[10px]" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>en {new Date().toLocaleString('es', { month: 'long' })}</p>
        </div>
      </div>
    </div>
  );
}

// ── Quick Actions ─────────────────────────────────────────────────
function QuickActions({ onNewPurchase, onNewDebt, onNewSupplier, atLimit }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
      <button
        onClick={onNewPurchase}
        className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90 active:scale-95 shadow-sm"
        style={{ background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)', color: '#fff', fontFamily: 'var(--font-caption)' }}
      >
        <Icon name="ShoppingCart" size={16} color="#fff" />
        Nueva compra
      </button>
      <button
        onClick={onNewDebt}
        className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm font-semibold transition-all hover:bg-indigo-50 active:scale-95"
        style={{ backgroundColor: '#EEF2FF', color: '#6366F1', border: '1.5px solid #C7D2FE', fontFamily: 'var(--font-caption)' }}
      >
        <Icon name="FilePlus" size={15} color="#6366F1" />
        Registrar deuda
      </button>
      <button
        onClick={onNewPurchase}
        className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm font-semibold transition-all hover:bg-green-50 active:scale-95"
        style={{ backgroundColor: '#ECFDF5', color: '#059669', border: '1.5px solid #A7F3D0', fontFamily: 'var(--font-caption)' }}
        title="Registrá un pago entrando a la cuenta del proveedor"
      >
        <Icon name="CheckCircle" size={15} color="#059669" />
        Registrar pago
      </button>
      <button
        onClick={onNewSupplier}
        disabled={atLimit}
        className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm font-semibold transition-all hover:bg-gray-100 active:scale-95 disabled:opacity-50"
        style={{ backgroundColor: '#F9FAFB', color: '#374151', border: '1.5px solid #E5E7EB', fontFamily: 'var(--font-caption)' }}
      >
        <Icon name="UserPlus" size={15} color="#374151" />
        Nuevo proveedor
      </button>
    </div>
  );
}

// ── Supplier Card v2 ──────────────────────────────────────────────
function SupplierCard({ supplier, debts, onEdit, onDelete, onMarkPaid, navigateTo, onNewPurchase }) {
  const health = computeHealth(debts);
  const h = HEALTH[health];
  const pending = debts.filter((d) => d.status === 'pending');
  const paid = debts.filter((d) => d.status === 'paid');
  const totalPending = pending.reduce((s, d) => s + (d.balance ?? d.amount), 0);
  const nextDue = pending.filter((d) => d.dueDate).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];
  const lastActivity = debts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  const [menuOpen, setMenuOpen] = useState(false);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isCritical = health === 'critical';

  const daysInfo = nextDue ? daysUntil(nextDue.dueDate) : null;
  const daysLabel = daysInfo === null ? null
    : daysInfo < 0 ? `Venció hace ${Math.abs(daysInfo)} días`
    : daysInfo === 0 ? 'Vence hoy'
    : daysInfo === 1 ? 'Vence mañana'
    : `Vence en ${daysInfo} días`;

  return (
    <div
      className="group relative rounded-2xl border transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer overflow-hidden"
      style={{
        backgroundColor: '#FFFFFF',
        borderColor: isCritical ? '#FECACA' : health === 'warning' ? '#FDE68A' : 'var(--color-border)',
        borderLeftWidth: '4px',
        borderLeftColor: h.dot,
      }}
      onClick={() => navigateTo(supplier.id)}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-base font-black shadow-sm"
              style={{ background: `linear-gradient(135deg, ${h.bg} 0%, ${h.dot}33 100%)`, color: h.color }}
            >
              {supplier.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm leading-tight truncate" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                {supplier.name}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {supplier.supplierType && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium inline-flex items-center gap-1"
                    style={{ backgroundColor: '#F3F4F6', color: '#6B7280', fontFamily: 'var(--font-caption)' }}>
                    {TYPE_LABELS[supplier.supplierType] ?? supplier.supplierType}
                  </span>
                )}
                <span className="text-[10px]" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                  {debts.length} operacion{debts.length !== 1 ? 'es' : ''}
                </span>
              </div>
            </div>
          </div>

          {/* Health + menu */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
              style={{ backgroundColor: h.bg, color: h.color, fontFamily: 'var(--font-caption)' }}
            >
              {h.label}
            </span>
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
                onClick={() => setMenuOpen((p) => !p)}
                aria-label="Opciones"
              >
                <Icon name="MoreVertical" size={14} color="var(--color-muted-foreground)" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-8 z-10 rounded-xl border shadow-lg py-1 min-w-[140px]"
                  style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)' }}>
                  <MenuItem icon="Edit2" label="Editar proveedor" onClick={() => { setMenuOpen(false); onEdit(supplier); }} />
                  <MenuItem icon="Trash2" label="Eliminar" danger onClick={() => { setMenuOpen(false); onDelete(supplier); }} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Amount hero */}
        <div className="mb-3">
          {totalPending > 0 ? (
            <>
              <p className="text-[10px] uppercase tracking-wide font-semibold mb-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                Saldo pendiente
              </p>
              <p className="text-2xl font-black leading-none" style={{ color: isCritical ? '#EF4444' : 'var(--color-foreground)', fontFamily: 'var(--font-stat)' }}>
                $ {fmt(totalPending)}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                {pending.length} deuda{pending.length > 1 ? 's' : ''} activa{pending.length > 1 ? 's' : ''}
              </p>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#ECFDF5' }}>
                <Icon name="CheckCircle2" size={14} color="#10B981" />
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: '#10B981', fontFamily: 'var(--font-caption)' }}>Sin deudas pendientes</p>
                <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{paid.length} compra{paid.length !== 1 ? 's' : ''} registrada{paid.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
          )}
        </div>

        {/* Meta row */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-t pt-3 mb-3" style={{ borderColor: 'var(--color-border)' }}>
          {lastActivity && (
            <div>
              <p className="text-[9px] uppercase tracking-wide font-semibold" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Última compra</p>
              <p className="text-xs font-medium" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                {fmtDate(lastActivity.createdAt)}
              </p>
            </div>
          )}
          {nextDue && (
            <div>
              <p className="text-[9px] uppercase tracking-wide font-semibold" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Próx. vencimiento</p>
              <p className="text-xs font-semibold" style={{ color: isCritical ? '#EF4444' : health === 'warning' ? '#D97706' : '#6366F1', fontFamily: 'var(--font-caption)' }}>
                {daysLabel}
              </p>
            </div>
          )}
        </div>

        {/* CTAs */}
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={(e) => { e.stopPropagation(); onNewPurchase(supplier); }}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-90 active:scale-95"
            style={{ backgroundColor: '#6366F1', color: '#fff', fontFamily: 'var(--font-caption)' }}
          >
            <Icon name="Plus" size={12} color="#fff" />
            Registrar compra
          </button>
          <button
            onClick={() => navigateTo(supplier.id)}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:bg-gray-100 active:scale-95"
            style={{ backgroundColor: '#F3F4F6', color: '#374151', fontFamily: 'var(--font-caption)' }}
          >
            Ver cuenta
            <Icon name="ArrowRight" size={12} color="currentColor" />
          </button>
        </div>
      </div>
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }) {
  return (
    <button
      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-muted transition-colors text-left"
      style={{ color: danger ? '#EF4444' : 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
      onClick={onClick}
    >
      <Icon name={icon} size={13} color="currentColor" />
      {label}
    </button>
  );
}

// ── Page ─────────────────────────────────────────────────────────
export default function SuppliersPage() {
  const navigate = useNavigate();
  const { business } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [allDebts, setAllDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [newPurchaseOpen, setNewPurchaseOpen] = useState(false);
  const [preSelectedSupplier, setPreSelectedSupplier] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('debt');

  const effectivePlan = getEffectivePlanSlug(business?.planSlug, business?.planExpiresAt, business?.trialExpiresAt);
  const limits = getPlanLimits(effectivePlan);
  const supplierLimit = limits.maxSuppliers;
  const atLimit = supplierLimit !== null && suppliers.length >= supplierLimit;

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const [{ data: sData }, { data: dData }] = await Promise.all([
      getSuppliers(business.id),
      getAllBusinessDebts(business.id),
    ]);
    setSuppliers(sData ?? []);
    setAllDebts(dData ?? []);
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (form) => {
    if (editingSupplier) {
      const { error } = await updateSupplier(editingSupplier.id, form);
      if (error) throw error;
    } else {
      const { error } = await createSupplier(business.id, form);
      if (error) throw error;
    }
    await load();
  };

  const handleDelete = async (supplier) => {
    if (!window.confirm(`¿Eliminar a "${supplier.name}"? Se borrarán todas sus deudas.`)) return;
    await deleteSupplier(supplier.id);
    await load();
  };

  const handleMarkPaid = async (debt) => {
    await markDebtAsPaid(debt.id, debt.amount);
    await load();
  };

  const openNewPurchase = (supplier = null) => {
    setPreSelectedSupplier(supplier);
    setNewPurchaseOpen(true);
  };

  const debtsBySupplierId = allDebts.reduce((acc, d) => {
    if (!acc[d.supplierId]) acc[d.supplierId] = [];
    acc[d.supplierId].push(d);
    return acc;
  }, {});

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const in7 = new Date(today); in7.setDate(in7.getDate() + 7);

  const pendingDebts = allDebts.filter((d) => d.status === 'pending');
  const totalPending = pendingDebts.reduce((s, d) => s + (d.balance ?? d.amount), 0);
  const overdueDebts = pendingDebts.filter((d) => d.dueDate && new Date(d.dueDate) < today);
  const overdueCount = overdueDebts.length;
  const dueNext7 = pendingDebts.filter((d) => d.dueDate && new Date(d.dueDate) >= today && new Date(d.dueDate) <= in7).length;
  const paidThisMonth = allDebts.filter((d) => {
    if (d.status !== 'paid' || !d.paidAt) return false;
    const p = new Date(d.paidAt);
    return p.getFullYear() === today.getFullYear() && p.getMonth() === today.getMonth();
  }).reduce((s, d) => s + d.amount, 0);

  const healthyCount = suppliers.filter((s) => computeHealth(debtsBySupplierId[s.id] ?? []) === 'healthy').length;
  const suppliersWithDebt = suppliers.length - healthyCount;

  const usedTypes = [...new Set(suppliers.map((s) => s.supplierType).filter(Boolean))];

  const filtered = suppliers.filter((s) => {
    const nameMatch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.contactName ?? '').toLowerCase().includes(search.toLowerCase());
    if (!nameMatch) return false;
    const h = computeHealth(debtsBySupplierId[s.id] ?? []);
    if (filter === 'pending') return h !== 'healthy';
    if (filter === 'healthy') return h === 'healthy';
    if (filter === 'critical') return h === 'critical';
    if (typeFilter !== 'all' && s.supplierType !== typeFilter) return false;
    return true;
  }).filter((s) => typeFilter === 'all' || s.supplierType === typeFilter);

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'debt') {
      const dA = (debtsBySupplierId[a.id] ?? []).filter((d) => d.status === 'pending').reduce((s, d) => s + (d.balance ?? d.amount), 0);
      const dB = (debtsBySupplierId[b.id] ?? []).filter((d) => d.status === 'pending').reduce((s, d) => s + (d.balance ?? d.amount), 0);
      return dB - dA;
    }
    if (sortBy === 'health') {
      const order = { critical: 0, warning: 1, pending: 2, healthy: 3 };
      return order[computeHealth(debtsBySupplierId[a.id] ?? [])] - order[computeHealth(debtsBySupplierId[b.id] ?? [])];
    }
    return a.name.localeCompare(b.name);
  });

  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <BusinessSidebar isCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <main className="transition-all duration-200" style={{ paddingLeft: sidebarWidth, paddingBottom: '80px' }}>
        <div className="max-w-4xl mx-auto px-4 py-6 lg:px-6">

          {/* Header */}
          <div className="flex items-start justify-between mb-5 gap-3">
            <div>
              <h1 className="text-xl font-bold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>
                Compras y Proveedores
              </h1>
              <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                Controlá deudas, vencimientos y pagos a proveedores
              </p>
            </div>
            {supplierLimit !== null && (
              <p className="text-[11px] mt-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                {suppliers.length}/{supplierLimit} proveedores · plan Starter
              </p>
            )}
          </div>

          {/* Financial band */}
          {!loading && suppliers.length > 0 && (
            <FinancialBand
              totalPending={totalPending}
              overdueCount={overdueCount}
              dueNext7={dueNext7}
              paidThisMonth={paidThisMonth}
              suppliersWithDebt={suppliersWithDebt}
              totalSuppliers={suppliers.length}
            />
          )}

          {/* Quick actions */}
          {!loading && suppliers.length > 0 && (
            <QuickActions
              onNewPurchase={() => openNewPurchase()}
              onNewDebt={() => openNewPurchase()}
              onNewSupplier={() => {
                if (atLimit) { alert(`Límite de ${supplierLimit} proveedores alcanzado. Actualizá a Pro para agregar más.`); return; }
                setEditingSupplier(null); setFormOpen(true);
              }}
              atLimit={atLimit}
            />
          )}

          {/* Banner contextual */}
          {!loading && <UpcomingDueBanner debts={allDebts} suppliers={suppliers} />}

          {/* Filtros */}
          {!loading && suppliers.length > 0 && (
            <div className="space-y-2 mb-4">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Icon name="Search" size={14} color="var(--color-muted-foreground)" className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar proveedor..."
                    className="w-full pl-8 pr-3 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)', backgroundColor: '#FFFFFF' }}
                  />
                </div>
                <div className="flex gap-1 flex-wrap items-center">
                  {[
                    { key: 'all', label: 'Todos' },
                    { key: 'critical', label: '🔴 Vencidos' },
                    { key: 'pending', label: '🔵 Con deuda' },
                    { key: 'healthy', label: '🟢 Al día' },
                  ].map((f) => (
                    <button key={f.key} onClick={() => setFilter(f.key)}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap"
                      style={{ fontFamily: 'var(--font-caption)', backgroundColor: filter === f.key ? 'var(--color-primary)' : '#FFFFFF', color: filter === f.key ? '#fff' : 'var(--color-muted-foreground)', border: `1px solid ${filter === f.key ? 'transparent' : 'var(--color-border)'}` }}>
                      {f.label}
                    </button>
                  ))}
                  <select
                    value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                    className="px-2.5 py-1.5 rounded-xl text-xs border cursor-pointer focus:outline-none"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)', backgroundColor: '#FFFFFF' }}
                  >
                    <option value="debt">Mayor deuda</option>
                    <option value="health">Estado</option>
                    <option value="name">Nombre</option>
                  </select>
                </div>
              </div>
              {usedTypes.length > 1 && (
                <div className="flex gap-1 flex-wrap">
                  <button onClick={() => setTypeFilter('all')}
                    className="px-2.5 py-1 rounded-lg text-xs transition-colors"
                    style={{ fontFamily: 'var(--font-caption)', backgroundColor: typeFilter === 'all' ? '#F3F4F6' : 'transparent', color: typeFilter === 'all' ? '#374151' : 'var(--color-muted-foreground)', fontWeight: typeFilter === 'all' ? '600' : '400' }}>
                    Todos los tipos
                  </button>
                  {usedTypes.map((t) => (
                    <button key={t} onClick={() => setTypeFilter(t === typeFilter ? 'all' : t)}
                      className="px-2.5 py-1 rounded-lg text-xs transition-colors"
                      style={{ fontFamily: 'var(--font-caption)', backgroundColor: typeFilter === t ? '#6366F1' : '#F3F4F6', color: typeFilter === t ? '#fff' : '#6B7280', fontWeight: '500' }}>
                      {TYPE_LABELS[t] ?? t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Lista */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--color-primary)' }} />
            </div>
          ) : suppliers.length === 0 ? (
            <EmptyState
              onAddSupplier={() => { setEditingSupplier(null); setFormOpen(true); }}
              onAddPurchase={() => { setEditingSupplier(null); setFormOpen(true); }}
            />
          ) : sorted.length === 0 ? (
            <div className="text-center py-10" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              <Icon name="SearchX" size={32} color="currentColor" className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">Sin resultados para "{search}"</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {sorted.map((s) => (
                <SupplierCard
                  key={s.id}
                  supplier={s}
                  debts={debtsBySupplierId[s.id] ?? []}
                  onEdit={(sup) => { setEditingSupplier(sup); setFormOpen(true); }}
                  onDelete={handleDelete}
                  onMarkPaid={handleMarkPaid}
                  onNewPurchase={(sup) => openNewPurchase(sup)}
                  navigateTo={(id) => navigate(`/proveedores/${id}`)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <SupplierFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
        supplier={editingSupplier}
      />

      <NewPurchaseModal
        open={newPurchaseOpen}
        onClose={() => { setNewPurchaseOpen(false); setPreSelectedSupplier(null); }}
        suppliers={suppliers}
        businessId={business?.id}
        onSuccess={load}
      />
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────
function EmptyState({ onAddSupplier }) {
  const [showExample, setShowExample] = useState(false);
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center max-w-sm mx-auto">
      <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5 shadow-lg"
        style={{ background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)' }}>
        <Icon name="ShoppingCart" size={34} color="#fff" />
      </div>
      <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>
        Aún no registras compras
      </h3>
      <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
        Controlá todo lo que le debés a tus proveedores desde un solo lugar. Recibí alertas antes de que una deuda venza.
      </p>

      <div className="w-full text-left mb-6 grid grid-cols-2 gap-2">
        {[
          { icon: 'DollarSign', text: 'Control de deudas',     color: '#6366F1', bg: '#EEF2FF' },
          { icon: 'Bell',       text: 'Alertas de vencimiento', color: '#F59E0B', bg: '#FFFBEB' },
          { icon: 'Clock',      text: 'Historial de pagos',     color: '#10B981', bg: '#ECFDF5' },
          { icon: 'BarChart2',  text: 'Salud financiera',       color: '#3B82F6', bg: '#EFF6FF' },
        ].map((b) => (
          <div key={b.text} className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ backgroundColor: b.bg }}>
            <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: b.color + '22' }}>
              <Icon name={b.icon} size={13} color={b.color} />
            </div>
            <span className="text-xs font-medium leading-tight" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>{b.text}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-2 w-full">
        <button
          onClick={onAddSupplier}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90 active:scale-95 shadow-md"
          style={{ background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)', color: '#fff', fontFamily: 'var(--font-caption)' }}
        >
          <Icon name="Plus" size={16} color="#fff" />
          Agregar primer proveedor
        </button>
        <button
          onClick={() => setShowExample(true)}
          className="px-4 py-3 rounded-xl text-sm font-medium border transition-colors hover:bg-muted"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
        >
          Ver ejemplo
        </button>
      </div>

      {showExample && (
        <div className="mt-4 w-full rounded-2xl border overflow-hidden shadow-sm"
          style={{ borderColor: 'var(--color-border)', borderLeftWidth: '4px', borderLeftColor: '#F59E0B' }}>
          <div className="p-4 bg-white">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm" style={{ background: '#FFFBEB', color: '#F59E0B' }}>D</div>
              <div>
                <p className="font-bold text-sm" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>Distribuidora Norte</p>
                <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Mercadería · 3 operaciones</p>
              </div>
              <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FFFBEB', color: '#F59E0B', fontFamily: 'var(--font-caption)' }}>Atención</span>
            </div>
            <p className="text-[9px] uppercase tracking-wide font-semibold mb-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Saldo pendiente</p>
            <p className="text-2xl font-black" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-stat)' }}>$ 120.000</p>
            <p className="text-xs mb-2" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>3 deudas activas</p>
            <div className="grid grid-cols-2 gap-2 border-t pt-2" style={{ borderColor: 'var(--color-border)' }}>
              <div>
                <p className="text-[9px] uppercase font-semibold" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Última compra</p>
                <p className="text-xs font-medium" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>10 jun 2026</p>
              </div>
              <div>
                <p className="text-[9px] uppercase font-semibold" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Próx. vencimiento</p>
                <p className="text-xs font-semibold" style={{ color: '#F59E0B', fontFamily: 'var(--font-caption)' }}>Vence en 4 días</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
