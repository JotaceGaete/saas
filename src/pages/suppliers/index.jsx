import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';
import BusinessSidebar from 'components/ui/BusinessSidebar';
import { useAuth } from '../../contexts/AuthContext';
import { formatMoney } from '../../utils/formatMoney';
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

// ── Health score ─────────────────────────────────────────────────
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
  healthy:  { label: 'Excelente',    desc: 'Sin deudas pendientes',   color: '#10B981', bg: '#ECFDF5', dot: '#10B981', emoji: '🟢' },
  pending:  { label: 'Con deuda',    desc: 'Tiene deudas sin vencer', color: '#6366F1', bg: '#EEF2FF', dot: '#6366F1', emoji: '🔵' },
  warning:  { label: 'Atención',     desc: 'Vence esta semana',       color: '#F59E0B', bg: '#FFFBEB', dot: '#F59E0B', emoji: '🟡' },
  critical: { label: 'Vencido',      desc: 'Tiene deudas vencidas',   color: '#EF4444', bg: '#FEF2F2', dot: '#EF4444', emoji: '🔴' },
};

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
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  return `hace ${months} mes${months > 1 ? 'es' : ''}`;
}

// ── Supplier card ────────────────────────────────────────────────
function SupplierCard({ supplier, debts, onEdit, onDelete, onMarkPaid, navigateTo }) {
  const health = computeHealth(debts);
  const h = HEALTH[health];
  const pending = debts.filter((d) => d.status === 'pending');
  const paid = debts.filter((d) => d.status === 'paid');
  const totalPending = pending.reduce((s, d) => s + (d.balance ?? d.amount), 0);
  const lastPaid = paid.sort((a, b) => new Date(b.paidAt ?? 0) - new Date(a.paidAt ?? 0))[0];
  const nextDue = pending
    .filter((d) => d.dueDate)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];
  const [menuOpen, setMenuOpen] = useState(false);
  const firstDebt = pending[0];
  const today = new Date(); today.setHours(0, 0, 0, 0);

  return (
    <div
      className="group relative rounded-2xl border transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer overflow-hidden"
      style={{ backgroundColor: '#FFFFFF', borderColor: health === 'critical' ? '#FECACA' : health === 'warning' ? '#FDE68A' : 'var(--color-border)', borderLeftWidth: '4px', borderLeftColor: h.dot }}
      onClick={() => navigateTo(supplier.id)}
    >
      <div className="p-4">
        {/* Top row */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-base font-bold shadow-sm" style={{ background: `linear-gradient(135deg, ${h.bg} 0%, ${h.dot}22 100%)`, color: h.color }}>
              {supplier.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm leading-tight truncate" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                {supplier.name}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {supplier.contactName && (
                  <span className="text-xs truncate" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{supplier.contactName}</span>
                )}
                {supplier.supplierType && supplier.supplierType !== 'otros' && (
                  <span className="text-[10px] px-1.5 py-0 rounded-full font-medium" style={{ backgroundColor: '#F3F4F6', color: '#6B7280', fontFamily: 'var(--font-caption)' }}>
                    {TYPE_LABELS[supplier.supplierType] ?? supplier.supplierType}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Health badge + menu */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className="text-right">
              <div className="flex items-center gap-1 justify-end">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: h.dot }} />
                <span className="text-xs font-semibold" style={{ color: h.color, fontFamily: 'var(--font-caption)' }}>{h.label}</span>
              </div>
              <p className="text-[10px] leading-tight" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{h.desc}</p>
            </div>
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted" onClick={() => setMenuOpen((p) => !p)} aria-label="Opciones">
                <Icon name="MoreVertical" size={14} color="var(--color-muted-foreground)" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-8 z-10 rounded-xl border shadow-lg py-1 min-w-[140px]" style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)' }}>
                  <MenuItem icon="Edit2" label="Editar" onClick={() => { setMenuOpen(false); onEdit(supplier); }} />
                  <MenuItem icon="Trash2" label="Eliminar" danger onClick={() => { setMenuOpen(false); onDelete(supplier); }} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main amount */}
        <div className="flex items-end justify-between gap-2 mb-3">
          <div>
            {totalPending > 0 ? (
              <>
                <p className="text-2xl font-black leading-none" style={{ color: health === 'critical' ? '#EF4444' : 'var(--color-foreground)', fontFamily: 'var(--font-stat)' }}>
                  $ {fmt(totalPending)}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                  {pending.length} deuda{pending.length > 1 ? 's' : ''} activa{pending.length > 1 ? 's' : ''}
                </p>
              </>
            ) : (
              <div>
                <p className="text-sm font-bold" style={{ color: '#10B981', fontFamily: 'var(--font-caption)' }}>Sin deudas pendientes</p>
                <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{debts.length} operacion{debts.length !== 1 ? 'es' : ''} registrada{debts.length !== 1 ? 's' : ''}</p>
              </div>
            )}
          </div>
          {firstDebt && (
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:scale-105 active:scale-95 shadow-sm"
              style={{ backgroundColor: '#ECFDF5', color: '#059669', fontFamily: 'var(--font-caption)' }}
              onClick={(e) => { e.stopPropagation(); onMarkPaid(firstDebt); }}
              title={`Marcar "${firstDebt.description}" como pagada`}
            >
              <Icon name="CheckCircle" size={13} color="#059669" />
              Pagar
            </button>
          )}
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3 flex-wrap border-t pt-2.5" style={{ borderColor: 'var(--color-border)' }}>
          {nextDue && (
            <div className="flex items-center gap-1" style={{ fontFamily: 'var(--font-caption)' }}>
              <Icon name="Calendar" size={11} color={health === 'critical' ? '#EF4444' : '#F59E0B'} />
              <span className="text-[11px] font-medium" style={{ color: health === 'critical' ? '#EF4444' : '#D97706' }}>
                Vence {new Date(nextDue.dueDate).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
              </span>
            </div>
          )}
          {lastPaid && (
            <div className="flex items-center gap-1" style={{ fontFamily: 'var(--font-caption)' }}>
              <Icon name="CheckCircle2" size={11} color="#10B981" />
              <span className="text-[11px]" style={{ color: '#10B981' }}>
                Último pago {timeAgo(lastPaid.paidAt)}
              </span>
            </div>
          )}
          {supplier.phone && (
            <a href={`tel:${supplier.phone}`} className="flex items-center gap-1 text-[11px] hover:opacity-80 transition-opacity ml-auto" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }} onClick={(e) => e.stopPropagation()}>
              <Icon name="Phone" size={11} color="currentColor" />
              {supplier.phone}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }) {
  return (
    <button className="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-muted transition-colors text-left" style={{ color: danger ? '#EF4444' : 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }} onClick={onClick}>
      <Icon name={icon} size={13} color="currentColor" />
      {label}
    </button>
  );
}

function StatCard({ icon, label, value, color, bg, sub }) {
  return (
    <div className="rounded-2xl border p-4 flex items-center gap-3" style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)' }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: bg }}>
        <Icon name={icon} size={18} color={color} />
      </div>
      <div className="min-w-0">
        <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{label}</p>
        <p className="text-lg font-bold leading-tight" style={{ color, fontFamily: 'var(--font-stat)' }}>{value}</p>
        {sub && <p className="text-[11px] mt-0.5 leading-tight" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{sub}</p>}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────
export default function SuppliersPage() {
  const navigate = useNavigate();
  const { business } = useAuth();
  const fmt = (n) => formatMoney(n, business?.currency);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [allDebts, setAllDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

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

  const usedTypes = [...new Set(suppliers.map((s) => s.supplierType).filter(Boolean))];

  const filtered = suppliers.filter((s) => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !(s.contactName ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'pending') return computeHealth(debtsBySupplierId[s.id] ?? []) !== 'healthy';
    if (filter === 'healthy') return computeHealth(debtsBySupplierId[s.id] ?? []) === 'healthy';
    if (filter === 'critical') return computeHealth(debtsBySupplierId[s.id] ?? []) === 'critical';
    if (typeFilter !== 'all' && s.supplierType !== typeFilter) return false;
    return true;
  }).filter((s) => typeFilter === 'all' || s.supplierType === typeFilter);

  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <BusinessSidebar isCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <main className="transition-all duration-200" style={{ paddingLeft: sidebarWidth, paddingBottom: '80px' }}>
        <div className="max-w-4xl mx-auto px-4 py-6 lg:px-6">

          {/* Header */}
          <div className="flex items-start justify-between mb-6 gap-3">
            <div>
              <h1 className="text-xl font-bold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>
                Proveedores y Cuentas por Pagar
              </h1>
              <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                Controlá deudas, vencimientos y pagos
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={() => {
                  if (atLimit) { alert(`Límite de ${supplierLimit} proveedores alcanzado en el plan Starter. Actualizá a Pro para agregar más.`); return; }
                  setEditingSupplier(null); setFormOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-95"
                style={{ backgroundColor: atLimit ? '#9CA3AF' : 'var(--color-primary)', color: '#fff', fontFamily: 'var(--font-caption)' }}
              >
                <Icon name="Plus" size={16} color="#fff" />
                <span className="hidden sm:inline">Nuevo proveedor</span>
                <span className="sm:hidden">Nuevo</span>
              </button>
              {supplierLimit !== null && (
                <p className="text-[11px]" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                  {suppliers.length}/{supplierLimit} en plan Starter
                </p>
              )}
            </div>
          </div>

          {/* Stats */}
          {!loading && suppliers.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <StatCard icon="TrendingDown" label="Total pendiente" value={`$ ${fmt(totalPending)}`} color="#6366F1" bg="#EEF2FF" sub={`${suppliers.length - healthyCount} proveedor${suppliers.length - healthyCount !== 1 ? 'es' : ''} con deuda`} />
              <StatCard icon="AlertCircle" label="Deudas vencidas" value={overdueCount} color={overdueCount > 0 ? '#EF4444' : '#10B981'} bg={overdueCount > 0 ? '#FEF2F2' : '#ECFDF5'} sub={overdueCount > 0 ? 'Requieren atención' : 'Todo al día ✓'} />
              <StatCard icon="CheckCircle2" label="Pagado este mes" value={`$ ${fmt(paidThisMonth)}`} color="#10B981" bg="#ECFDF5" />
              <StatCard icon="Users" label="Proveedores al día" value={`${healthyCount}/${suppliers.length}`} color="#10B981" bg="#ECFDF5" sub="Sin deudas pendientes" />
            </div>
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
                <div className="flex gap-1 flex-wrap">
                  {[
                    { key: 'all', label: 'Todos' },
                    { key: 'critical', label: '🔴 Vencidos' },
                    { key: 'pending', label: '🔵 Con deuda' },
                    { key: 'healthy', label: '🟢 Al día' },
                  ].map((f) => (
                    <button key={f.key} onClick={() => setFilter(f.key)} className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap"
                      style={{ fontFamily: 'var(--font-caption)', backgroundColor: filter === f.key ? 'var(--color-primary)' : '#FFFFFF', color: filter === f.key ? '#fff' : 'var(--color-muted-foreground)', border: `1px solid ${filter === f.key ? 'transparent' : 'var(--color-border)'}` }}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Filtro por tipo */}
              {usedTypes.length > 1 && (
                <div className="flex gap-1 flex-wrap">
                  <button onClick={() => setTypeFilter('all')} className="px-2.5 py-1 rounded-lg text-xs transition-colors"
                    style={{ fontFamily: 'var(--font-caption)', backgroundColor: typeFilter === 'all' ? '#F3F4F6' : 'transparent', color: typeFilter === 'all' ? '#374151' : 'var(--color-muted-foreground)', fontWeight: typeFilter === 'all' ? '600' : '400' }}>
                    Todos los tipos
                  </button>
                  {usedTypes.map((t) => (
                    <button key={t} onClick={() => setTypeFilter(t === typeFilter ? 'all' : t)} className="px-2.5 py-1 rounded-lg text-xs transition-colors"
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
            <EmptyState onAdd={() => { setEditingSupplier(null); setFormOpen(true); }} />
          ) : filtered.length === 0 ? (
            <div className="text-center py-10" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              <Icon name="SearchX" size={32} color="currentColor" className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">Sin resultados para "{search}"</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

function EmptyState({ onAdd }) {
  const [showExample, setShowExample] = useState(false);
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center max-w-sm mx-auto">
      <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5 shadow-lg" style={{ background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)' }}>
        <Icon name="Truck" size={36} color="#fff" />
      </div>
      <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>
        Controlá tus compras y pagos pendientes
      </h3>
      <p className="text-sm mb-5 leading-relaxed" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
        Registrá proveedores, controlá cuánto debés y recibí alertas antes de que una deuda venza.
      </p>

      {/* Beneficios */}
      <div className="w-full text-left mb-6 space-y-2">
        {[
          { icon: 'DollarSign', text: 'Control de deudas y saldos', color: '#6366F1', bg: '#EEF2FF' },
          { icon: 'Bell',       text: 'Alertas de vencimiento',     color: '#F59E0B', bg: '#FFFBEB' },
          { icon: 'Clock',      text: 'Historial de pagos',         color: '#10B981', bg: '#ECFDF5' },
          { icon: 'BarChart2',  text: 'Salud financiera del negocio', color: '#3B82F6', bg: '#EFF6FF' },
        ].map((b) => (
          <div key={b.text} className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ backgroundColor: b.bg }}>
            <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: b.color + '22' }}>
              <Icon name={b.icon} size={13} color={b.color} />
            </div>
            <span className="text-xs font-medium" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>✓ {b.text}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-2 w-full">
        <button onClick={onAdd} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-95 shadow-md"
          style={{ background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)', color: '#fff', fontFamily: 'var(--font-caption)' }}>
          <Icon name="Plus" size={16} color="#fff" />
          Agregar primer proveedor
        </button>
        <button onClick={() => setShowExample(true)} className="px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors hover:bg-muted"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
          Ver ejemplo
        </button>
      </div>

      {showExample && (
        <div className="mt-4 w-full rounded-2xl border overflow-hidden shadow-sm" style={{ borderColor: 'var(--color-border)', borderLeftWidth: '4px', borderLeftColor: '#F59E0B' }}>
          <div className="p-4 bg-white">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm" style={{ background: '#FFFBEB', color: '#F59E0B' }}>D</div>
              <div>
                <p className="font-bold text-sm" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>Distribuidora Norte</p>
                <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Juan Pérez · Mercadería</p>
              </div>
              <div className="ml-auto flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#F59E0B' }} />
                <span className="text-xs font-semibold" style={{ color: '#F59E0B', fontFamily: 'var(--font-caption)' }}>Atención</span>
              </div>
            </div>
            <p className="text-2xl font-black" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-stat)' }}>$ 120.000</p>
            <p className="text-xs mb-2" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>3 deudas activas</p>
            <div className="flex items-center gap-2 text-[11px] border-t pt-2" style={{ borderColor: 'var(--color-border)' }}>
              <span style={{ color: '#F59E0B', fontFamily: 'var(--font-caption)' }}>📅 Vence 15 jun</span>
              <span style={{ color: '#10B981', fontFamily: 'var(--font-caption)' }}>✓ Último pago hace 5 días</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
