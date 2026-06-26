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
} from '../../services/waBusinessService';
import { getEffectivePlanSlug } from '../../services/waBusinessService';
import { getPlanLimits } from '../../constants/plans';
import SupplierFormModal from '../../components/SupplierFormModal';
import UpcomingDueBanner from '../../components/UpcomingDueBanner';

// ── Health score ──────────────────────────────────────────────────────────────
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
  healthy:  { label: 'Al día',       desc: 'Sin deudas pendientes',   color: '#059669', bg: '#ECFDF5', dot: '#10B981', ring: '#A7F3D0' },
  pending:  { label: 'Con deuda',    desc: 'Tiene deudas sin vencer', color: '#4F46E5', bg: '#EEF2FF', dot: '#6366F1', ring: '#C7D2FE' },
  warning:  { label: 'Atención',     desc: 'Vence esta semana',       color: '#D97706', bg: '#FFFBEB', dot: '#F59E0B', ring: '#FDE68A' },
  critical: { label: 'Vencido',      desc: 'Tiene deudas vencidas',   color: '#DC2626', bg: '#FEF2F2', dot: '#EF4444', ring: '#FECACA' },
};

const TYPE_LABELS = {
  mercaderia: 'Mercadería', insumos: 'Insumos', servicios: 'Servicios',
  transporte: 'Transporte', arriendo: 'Arriendo', marketing: 'Marketing', otros: 'Otros',
};

function fmt(n) {
  return new Intl.NumberFormat('es', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n ?? 0);
}

function timeAgo(dateStr) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  return `hace ${months} mes${months > 1 ? 'es' : ''}`;
}

// ── KPI Card premium ──────────────────────────────────────────────────────────
const KPI_PALETTES = {
  indigo:  { bg: '#EEF2FF',  iconBg: '#C7D2FE', iconColor: '#4F46E5', val: '#1E1B4B', sub: '#6366F1' },
  red:     { bg: '#FEF2F2',  iconBg: '#FECACA', iconColor: '#DC2626', val: '#7F1D1D', sub: '#EF4444' },
  green:   { bg: '#ECFDF5',  iconBg: '#A7F3D0', iconColor: '#059669', val: '#064E3B', sub: '#10B981' },
  emerald: { bg: '#ECFDF5',  iconBg: '#A7F3D0', iconColor: '#059669', val: '#064E3B', sub: '#10B981' },
};

function KpiCard({ icon, label, value, sub, palette = 'indigo' }) {
  const p = KPI_PALETTES[palette] || KPI_PALETTES.indigo;
  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-default"
      style={{ backgroundColor: p.bg, border: `1px solid ${p.iconBg}` }}
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: p.iconBg }}>
        <Icon name={icon} size={19} color={p.iconColor} />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: p.sub, fontFamily: 'var(--font-caption)' }}>{label}</p>
        <p className="text-2xl font-black leading-none tabular-nums" style={{ color: p.val, fontFamily: 'var(--font-stat)' }}>{value}</p>
        {sub && <p className="text-xs mt-1.5 leading-tight" style={{ color: p.sub, fontFamily: 'var(--font-caption)', opacity: 0.8 }}>{sub}</p>}
      </div>
    </div>
  );
}

// ── Filter chip ───────────────────────────────────────────────────────────────
function FilterChip({ label, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 px-4 h-11 rounded-xl text-sm font-semibold border transition-all duration-150 whitespace-nowrap hover:shadow-sm"
      style={{
        backgroundColor: active ? '#4F46E5' : '#FFFFFF',
        color: active ? '#FFFFFF' : '#374151',
        borderColor: active ? '#4F46E5' : '#E5E7EB',
        fontFamily: 'var(--font-caption)',
      }}
    >
      {label}
      {count != null && (
        <span
          className="min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center tabular-nums"
          style={{ backgroundColor: active ? 'rgba(255,255,255,0.25)' : '#F3F4F6', color: active ? '#FFFFFF' : '#6B7280' }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ── Supplier card premium ─────────────────────────────────────────────────────
function SupplierCard({ supplier, debts, onEdit, onDelete, onMarkPaid, navigateTo }) {
  const health = computeHealth(debts);
  const h = HEALTH[health];
  const pending = debts.filter((d) => d.status === 'pending');
  const paid    = debts.filter((d) => d.status === 'paid');
  const totalPending = pending.reduce((s, d) => s + (d.balance ?? d.amount), 0);
  const lastPaid = paid.sort((a, b) => new Date(b.paidAt ?? 0) - new Date(a.paidAt ?? 0))[0];
  const nextDue  = pending.filter((d) => d.dueDate).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];
  const firstDebt = pending[0];
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className="group relative bg-white rounded-2xl border border-gray-100 overflow-hidden cursor-pointer transition-all duration-150 hover:shadow-xl hover:-translate-y-1 hover:border-gray-200"
      onClick={() => navigateTo(supplier.id)}
    >
      {/* Top accent bar */}
      <div className="h-[3px] w-full" style={{ backgroundColor: h.dot }} />

      <div className="p-5">
        {/* Header: avatar + name + health badge + menu */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            {/* Avatar */}
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-black flex-shrink-0 select-none"
              style={{ background: `linear-gradient(135deg, ${h.bg} 0%, ${h.dot}40 100%)`, color: h.color }}
            >
              {supplier.name.charAt(0).toUpperCase()}
            </div>
            {/* Name + contact */}
            <div className="min-w-0">
              <p className="font-bold text-sm text-gray-900 leading-tight truncate" style={{ fontFamily: 'var(--font-caption)' }}>
                {supplier.name}
              </p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {supplier.contactName && (
                  <span className="text-xs text-gray-500 truncate" style={{ fontFamily: 'var(--font-caption)' }}>
                    {supplier.contactName}
                  </span>
                )}
                {supplier.supplierType && supplier.supplierType !== 'otros' && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-gray-100 text-gray-500" style={{ fontFamily: 'var(--font-caption)' }}>
                    {TYPE_LABELS[supplier.supplierType] ?? supplier.supplierType}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Health badge + context menu */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ring-1"
              style={{ backgroundColor: h.bg, color: h.color, '--tw-ring-color': h.ring, ringColor: h.ring }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: h.dot }} />
              {h.label}
            </span>
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                className="w-8 h-8 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-gray-100"
                onClick={() => setMenuOpen((p) => !p)}
                aria-label="Opciones"
              >
                <Icon name="MoreVertical" size={14} color="#9CA3AF" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-9 z-20 rounded-2xl border border-gray-100 shadow-2xl py-1.5 min-w-[150px] bg-white">
                  <MenuItemRow icon="Edit2" label="Editar" onClick={() => { setMenuOpen(false); onEdit(supplier); }} />
                  <div className="my-1 h-px bg-gray-100" />
                  <MenuItemRow icon="Trash2" label="Eliminar" danger onClick={() => { setMenuOpen(false); onDelete(supplier); }} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Amount block */}
        <div className="mb-4">
          {totalPending > 0 ? (
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5" style={{ fontFamily: 'var(--font-caption)' }}>
                  Total pendiente
                </p>
                <p className="text-3xl font-black leading-none tabular-nums" style={{ color: health === 'critical' ? '#DC2626' : '#111827', fontFamily: 'var(--font-stat)' }}>
                  ${fmt(totalPending)}
                </p>
                <p className="text-xs text-gray-400 mt-1" style={{ fontFamily: 'var(--font-caption)' }}>
                  {pending.length} deuda{pending.length > 1 ? 's' : ''} activa{pending.length > 1 ? 's' : ''}
                </p>
              </div>
              {firstDebt && (
                <button
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all hover:scale-105 active:scale-95 flex-shrink-0"
                  onClick={(e) => { e.stopPropagation(); onMarkPaid(firstDebt); }}
                  title={`Marcar "${firstDebt.description}" como pagada`}
                  style={{ fontFamily: 'var(--font-caption)' }}
                >
                  <Icon name="CheckCircle" size={13} color="#059669" />
                  Pagar
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                <Icon name="CheckCircle2" size={18} color="#059669" />
              </div>
              <div>
                <p className="text-sm font-bold text-emerald-700" style={{ fontFamily: 'var(--font-caption)' }}>Sin deudas pendientes</p>
                <p className="text-xs text-gray-400" style={{ fontFamily: 'var(--font-caption)' }}>
                  {debts.length} operacion{debts.length !== 1 ? 'es' : ''} registrada{debts.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-4 flex-wrap border-t border-gray-50 pt-3 pb-1">
          {nextDue && (
            <span className="flex items-center gap-1 text-xs font-medium" style={{ color: health === 'critical' ? '#DC2626' : '#D97706', fontFamily: 'var(--font-caption)' }}>
              <Icon name="Calendar" size={11} color="currentColor" />
              Vence {new Date(nextDue.dueDate).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
            </span>
          )}
          {lastPaid && (
            <span className="flex items-center gap-1 text-xs text-emerald-600" style={{ fontFamily: 'var(--font-caption)' }}>
              <Icon name="CheckCircle2" size={11} color="#059669" />
              Pago {timeAgo(lastPaid.paidAt)}
            </span>
          )}
          {supplier.phone && (
            <a
              href={`tel:${supplier.phone}`}
              className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              style={{ fontFamily: 'var(--font-caption)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <Icon name="Phone" size={11} color="currentColor" />
              {supplier.phone}
            </a>
          )}
        </div>

        {/* Action buttons row — visible on group hover */}
        <div className="mt-3 pt-3 border-t border-gray-50 flex gap-2 opacity-0 group-hover:opacity-100 transition-all duration-150 translate-y-1 group-hover:translate-y-0">
          {supplier.phone && (
            <a
              href={`https://wa.me/${supplier.phone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
              style={{ fontFamily: 'var(--font-caption)' }}
            >
              <Icon name="MessageCircle" size={12} color="#16A34A" />
              WhatsApp
            </a>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(supplier); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            style={{ fontFamily: 'var(--font-caption)' }}
          >
            <Icon name="Edit2" size={12} color="currentColor" />
            Editar
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); navigateTo(supplier.id); }}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
            style={{ fontFamily: 'var(--font-caption)' }}
          >
            <Icon name="ExternalLink" size={12} color="currentColor" />
            Ver ficha
          </button>
        </div>
      </div>
    </div>
  );
}

function MenuItemRow({ icon, label, onClick, danger }) {
  return (
    <button
      className="w-full flex items-center gap-2.5 px-4 py-2 text-xs hover:bg-gray-50 transition-colors text-left"
      style={{ color: danger ? '#EF4444' : '#374151', fontFamily: 'var(--font-caption)' }}
      onClick={onClick}
    >
      <Icon name={icon} size={13} color="currentColor" />
      {label}
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SuppliersPage() {
  const navigate = useNavigate();
  const { business } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [suppliers, setSuppliers]   = useState([]);
  const [allDebts, setAllDebts]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [formOpen, setFormOpen]     = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [search, setSearch]         = useState('');
  const [filter, setFilter]         = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const effectivePlan  = getEffectivePlanSlug(business?.planSlug, business?.planExpiresAt, business?.trialExpiresAt);
  const limits         = getPlanLimits(effectivePlan);
  const supplierLimit  = limits.maxSuppliers;
  const atLimit        = supplierLimit !== null && suppliers.length >= supplierLimit;

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

  // ── Computed metrics ───────────────────────────────────────────────────────
  const debtsBySupplierId = allDebts.reduce((acc, d) => {
    if (!acc[d.supplierId]) acc[d.supplierId] = [];
    acc[d.supplierId].push(d);
    return acc;
  }, {});

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const totalPending = allDebts.filter((d) => d.status === 'pending').reduce((s, d) => s + (d.balance ?? d.amount), 0);
  const overdueCount = suppliers.filter((s) => computeHealth(debtsBySupplierId[s.id] ?? []) === 'critical').length;
  const paidThisMonth = allDebts.filter((d) => {
    if (d.status !== 'paid' || !d.paidAt) return false;
    const p = new Date(d.paidAt);
    return p.getFullYear() === today.getFullYear() && p.getMonth() === today.getMonth();
  }).reduce((s, d) => s + d.amount, 0);
  const healthyCount = suppliers.filter((s) => computeHealth(debtsBySupplierId[s.id] ?? []) === 'healthy').length;

  // Filter chip counts
  const countAll      = suppliers.length;
  const countCritical = overdueCount;
  const countPending  = suppliers.filter((s) => computeHealth(debtsBySupplierId[s.id] ?? []) !== 'healthy').length;
  const countHealthy  = healthyCount;

  const usedTypes = [...new Set(suppliers.map((s) => s.supplierType).filter(Boolean))];

  const filtered = suppliers.filter((s) => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !(s.contactName ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'pending')  return computeHealth(debtsBySupplierId[s.id] ?? []) !== 'healthy';
    if (filter === 'healthy')  return computeHealth(debtsBySupplierId[s.id] ?? []) === 'healthy';
    if (filter === 'critical') return computeHealth(debtsBySupplierId[s.id] ?? []) === 'critical';
    if (typeFilter !== 'all' && s.supplierType !== typeFilter) return false;
    return true;
  }).filter((s) => typeFilter === 'all' || s.supplierType === typeFilter);

  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';

  const openNewSupplier = () => {
    if (atLimit) {
      alert(`Límite de ${supplierLimit} proveedores alcanzado en el plan Starter. Actualizá a Pro para agregar más.`);
      return;
    }
    setEditingSupplier(null);
    setFormOpen(true);
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <BusinessSidebar isCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />

      <main className="transition-all duration-200" style={{ paddingLeft: sidebarWidth, paddingBottom: '80px' }}>
        <div className="max-w-[1700px] px-4 py-7 lg:px-8">

          {/* ── Header ────────────────────────────────────────────────────── */}
          <div className="flex items-start justify-between gap-4 mb-8">
            <div>
              <h1
                className="text-3xl font-black tracking-tight leading-none"
                style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)', letterSpacing: '-0.03em' }}
              >
                Proveedores
              </h1>
              <p
                className="text-sm mt-2"
                style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
              >
                Controlá pagos, vencimientos y cuentas por pagar.
              </p>
            </div>

            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              <button
                onClick={openNewSupplier}
                className="flex items-center gap-2 px-5 h-12 rounded-2xl text-sm font-bold text-white transition-all duration-150 hover:shadow-xl hover:-translate-y-0.5 active:scale-95"
                style={{
                  background: atLimit ? '#9CA3AF' : 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
                  fontFamily: 'var(--font-caption)',
                  boxShadow: atLimit ? 'none' : '0 4px 20px rgba(79,70,229,0.35)',
                }}
              >
                <Icon name="Plus" size={17} color="#fff" />
                <span className="hidden sm:inline">Nuevo proveedor</span>
                <span className="sm:hidden">Nuevo</span>
              </button>
              {supplierLimit !== null && (
                <p className="text-[11px] text-right" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                  {suppliers.length}/{supplierLimit} en plan Starter
                </p>
              )}
            </div>
          </div>

          {/* ── KPI cards ─────────────────────────────────────────────────── */}
          {!loading && suppliers.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
              <KpiCard
                icon="TrendingDown"
                label="Total pendiente"
                value={`$${fmt(totalPending)}`}
                sub={`${suppliers.length - healthyCount} proveedor${suppliers.length - healthyCount !== 1 ? 'es' : ''} con deuda`}
                palette="indigo"
              />
              <KpiCard
                icon="AlertOctagon"
                label="Deudas vencidas"
                value={overdueCount}
                sub={overdueCount > 0 ? 'Requieren atención' : 'Todo al día ✓'}
                palette={overdueCount > 0 ? 'red' : 'green'}
              />
              <KpiCard
                icon="CircleDollarSign"
                label="Pagado este mes"
                value={`$${fmt(paidThisMonth)}`}
                palette="green"
              />
              <KpiCard
                icon="Users"
                label="Al día"
                value={`${healthyCount}/${suppliers.length}`}
                sub="Sin deudas pendientes"
                palette="emerald"
              />
            </div>
          )}

          {/* ── Banner contextual ──────────────────────────────────────────── */}
          {!loading && <UpcomingDueBanner debts={allDebts} suppliers={suppliers} />}

          {/* ── Search + Filter chips ──────────────────────────────────────── */}
          {!loading && suppliers.length > 0 && (
            <div className="space-y-3 mb-6">
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Premium search bar */}
                <div className="relative flex-1 max-w-lg">
                  <Icon name="Search" size={18} color="#9CA3AF" className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar proveedor…"
                    className="w-full h-11 pl-11 pr-4 rounded-2xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all"
                    style={{
                      borderColor: '#E5E7EB',
                      color: 'var(--color-foreground)',
                      fontFamily: 'var(--font-caption)',
                      backgroundColor: '#FFFFFF',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                    }}
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded-lg transition-colors"
                    >
                      <Icon name="X" size={14} color="currentColor" />
                    </button>
                  )}
                </div>

                {/* Filter chips */}
                <div className="flex gap-2 flex-wrap">
                  <FilterChip label="Todos"     count={countAll}      active={filter === 'all'}      onClick={() => setFilter('all')} />
                  <FilterChip label="Con deuda" count={countPending}  active={filter === 'pending'}  onClick={() => setFilter('pending')} />
                  <FilterChip label="Vencidos"  count={countCritical} active={filter === 'critical'} onClick={() => setFilter('critical')} />
                  <FilterChip label="Al día"    count={countHealthy}  active={filter === 'healthy'}  onClick={() => setFilter('healthy')} />
                </div>
              </div>

              {/* Tipo chips */}
              {usedTypes.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setTypeFilter('all')}
                    className="px-3 h-8 rounded-lg text-xs font-semibold border transition-colors"
                    style={{
                      fontFamily: 'var(--font-caption)',
                      backgroundColor: typeFilter === 'all' ? '#F3F4F6' : 'transparent',
                      color: typeFilter === 'all' ? '#374151' : '#9CA3AF',
                      borderColor: typeFilter === 'all' ? '#E5E7EB' : 'transparent',
                    }}
                  >
                    Todos los tipos
                  </button>
                  {usedTypes.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTypeFilter(t === typeFilter ? 'all' : t)}
                      className="px-3 h-8 rounded-lg text-xs font-semibold border transition-all"
                      style={{
                        fontFamily: 'var(--font-caption)',
                        backgroundColor: typeFilter === t ? '#4F46E5' : '#F3F4F6',
                        color: typeFilter === t ? '#fff' : '#6B7280',
                        borderColor: typeFilter === t ? '#4F46E5' : 'transparent',
                      }}
                    >
                      {TYPE_LABELS[t] ?? t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── List ──────────────────────────────────────────────────────── */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <div
                className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: '#6366F1', borderTopColor: 'transparent' }}
              />
              <p className="text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                Cargando proveedores…
              </p>
            </div>
          ) : suppliers.length === 0 ? (
            <EmptyState onAdd={openNewSupplier} />
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                <Icon name="SearchX" size={24} color="#9CA3AF" />
              </div>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                Sin resultados{search ? ` para "${search}"` : ''}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                Probá con otro filtro o término de búsqueda
              </p>
              <button
                onClick={() => { setSearch(''); setFilter('all'); setTypeFilter('all'); }}
                className="mt-4 px-4 py-2 rounded-xl text-xs font-semibold border transition-colors hover:bg-gray-50"
                style={{ borderColor: '#E5E7EB', color: '#374151', fontFamily: 'var(--font-caption)' }}
              >
                Limpiar filtros
              </button>
            </div>
          ) : (
            <>
              {/* Count + sort info */}
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                  {filtered.length} proveedor{filtered.length !== 1 ? 'es' : ''}
                  {filter !== 'all' && ` · filtrado por ${filter === 'critical' ? 'vencidos' : filter === 'pending' ? 'con deuda' : 'al día'}`}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filtered.map((s) => (
                  <SupplierCard
                    key={s.id}
                    supplier={s}
                    debts={debtsBySupplierId[s.id] ?? []}
                    onEdit={(sup) => { setEditingSupplier(sup); setFormOpen(true); }}
                    onDelete={handleDelete}
                    onMarkPaid={handleMarkPaid}
                    navigateTo={(id) => navigate(`/proveedores/${id}`)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </main>

      <SupplierFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
        supplier={editingSupplier}
      />
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ onAdd }) {
  const [showExample, setShowExample] = useState(false);
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center max-w-sm mx-auto">
      <div
        className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-lg"
        style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)' }}
      >
        <Icon name="Truck" size={36} color="#fff" />
      </div>
      <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>
        Controlá tus compras y pagos pendientes
      </h3>
      <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
        Registrá proveedores, controlá cuánto debés y recibí alertas antes de que una deuda venza.
      </p>

      <div className="w-full text-left mb-6 space-y-2">
        {[
          { icon: 'DollarSign', text: 'Control de deudas y saldos',      color: '#4F46E5', bg: '#EEF2FF' },
          { icon: 'Bell',       text: 'Alertas de vencimiento',           color: '#D97706', bg: '#FFFBEB' },
          { icon: 'Clock',      text: 'Historial de pagos',               color: '#059669', bg: '#ECFDF5' },
          { icon: 'BarChart2',  text: 'Salud financiera del negocio',     color: '#3B82F6', bg: '#EFF6FF' },
        ].map((b) => (
          <div key={b.text} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ backgroundColor: b.bg }}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: b.color + '22' }}>
              <Icon name={b.icon} size={13} color={b.color} />
            </div>
            <span className="text-xs font-medium" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
              ✓ {b.text}
            </span>
          </div>
        ))}
      </div>

      <div className="flex gap-2 w-full">
        <button
          onClick={onAdd}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all hover:shadow-xl hover:-translate-y-0.5 active:scale-95"
          style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)', color: '#fff', fontFamily: 'var(--font-caption)', boxShadow: '0 4px 20px rgba(79,70,229,0.3)' }}
        >
          <Icon name="Plus" size={16} color="#fff" />
          Agregar primer proveedor
        </button>
        <button
          onClick={() => setShowExample((p) => !p)}
          className="px-4 py-2.5 rounded-2xl text-sm font-medium border transition-colors hover:bg-gray-50"
          style={{ borderColor: '#E5E7EB', color: '#374151', fontFamily: 'var(--font-caption)' }}
        >
          Ver ejemplo
        </button>
      </div>

      {showExample && (
        <div className="mt-5 w-full rounded-2xl border border-gray-100 overflow-hidden shadow-sm bg-white">
          <div className="h-[3px] w-full" style={{ backgroundColor: '#F59E0B' }} />
          <div className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm" style={{ background: '#FFFBEB', color: '#D97706' }}>D</div>
              <div>
                <p className="font-bold text-sm" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>Distribuidora Norte</p>
                <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Juan Pérez · Mercadería</p>
              </div>
              <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 ring-1 ring-amber-200">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span className="text-xs font-semibold text-amber-700" style={{ fontFamily: 'var(--font-caption)' }}>Atención</span>
              </div>
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5" style={{ fontFamily: 'var(--font-caption)' }}>Total pendiente</p>
            <p className="text-2xl font-black text-gray-900" style={{ fontFamily: 'var(--font-stat)' }}>$120.000</p>
            <p className="text-xs text-gray-400 mb-3" style={{ fontFamily: 'var(--font-caption)' }}>3 deudas activas</p>
            <div className="flex items-center gap-4 text-[11px] border-t border-gray-50 pt-3" style={{ fontFamily: 'var(--font-caption)' }}>
              <span className="flex items-center gap-1 text-amber-600"><Icon name="Calendar" size={11} color="currentColor" />Vence 15 jun</span>
              <span className="flex items-center gap-1 text-emerald-600"><Icon name="CheckCircle2" size={11} color="currentColor" />Pago hace 5 días</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
