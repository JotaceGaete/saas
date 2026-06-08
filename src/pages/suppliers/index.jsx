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
import SupplierFormModal from '../../components/SupplierFormModal';
import UpcomingDueBanner from '../../components/UpcomingDueBanner';

// ── Health score ──────────────────────────────────────────────────
function computeHealth(debts) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in7 = new Date(today);
  in7.setDate(in7.getDate() + 7);
  const pending = debts.filter((d) => d.status === 'pending');
  if (pending.length === 0) return 'healthy';
  const hasOverdue = pending.some((d) => d.dueDate && new Date(d.dueDate) < today);
  if (hasOverdue) return 'critical';
  const hasSoon = pending.some((d) => d.dueDate && new Date(d.dueDate) <= in7);
  if (hasSoon) return 'warning';
  return 'pending';
}

const HEALTH = {
  healthy:  { label: 'Al día',    color: '#10B981', bg: '#ECFDF5', dot: '#10B981' },
  pending:  { label: 'Con deuda', color: '#6366F1', bg: '#EEF2FF', dot: '#6366F1' },
  warning:  { label: 'Vence pronto', color: '#F59E0B', bg: '#FFFBEB', dot: '#F59E0B' },
  critical: { label: 'Vencida',   color: '#EF4444', bg: '#FEF2F2', dot: '#EF4444' },
};

function fmt(n) {
  return new Intl.NumberFormat('es', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n ?? 0);
}

// ── Supplier card ─────────────────────────────────────────────────
function SupplierCard({ supplier, debts, onEdit, onDelete, onMarkPaid, navigateTo }) {
  const health = computeHealth(debts);
  const h = HEALTH[health];
  const pending = debts.filter((d) => d.status === 'pending');
  const totalPending = pending.reduce((s, d) => s + d.amount, 0);
  const nextDue = pending
    .filter((d) => d.dueDate)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];
  const [menuOpen, setMenuOpen] = useState(false);

  // Quick pay: first unpaid debt
  const firstDebt = pending[0];

  return (
    <div
      className="group relative rounded-2xl border transition-all duration-200 hover:shadow-md cursor-pointer overflow-hidden"
      style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', borderLeftWidth: '4px', borderLeftColor: h.dot }}
      onClick={() => navigateTo(supplier.id)}
    >
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            {/* Avatar */}
            <div
              className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold"
              style={{ backgroundColor: h.bg, color: h.color }}
            >
              {supplier.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                {supplier.name}
              </p>
              {supplier.contactName && (
                <p className="text-xs truncate" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                  {supplier.contactName}
                </p>
              )}
            </div>
          </div>

          {/* Health badge + menu */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
              style={{ backgroundColor: h.bg, color: h.color, fontFamily: 'var(--font-caption)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: h.dot }} />
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
                <div
                  className="absolute right-0 top-8 z-10 rounded-xl border shadow-lg py-1 min-w-[140px]"
                  style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)' }}
                >
                  <MenuItem icon="Edit2" label="Editar" onClick={() => { setMenuOpen(false); onEdit(supplier); }} />
                  <MenuItem icon="Trash2" label="Eliminar" danger onClick={() => { setMenuOpen(false); onDelete(supplier); }} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-3 flex items-end justify-between gap-2">
          <div>
            {totalPending > 0 ? (
              <>
                <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                  {pending.length} deuda{pending.length > 1 ? 's' : ''} pendiente{pending.length > 1 ? 's' : ''}
                </p>
                <p className="text-lg font-bold" style={{ color: health === 'critical' ? '#EF4444' : 'var(--color-foreground)', fontFamily: 'var(--font-stat)' }}>
                  $ {fmt(totalPending)}
                </p>
              </>
            ) : (
              <p className="text-sm font-medium" style={{ color: '#10B981', fontFamily: 'var(--font-caption)' }}>
                Sin deudas pendientes ✓
              </p>
            )}
            {nextDue && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                Vence {new Date(nextDue.dueDate).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
              </p>
            )}
          </div>

          {/* Quick pay button */}
          {firstDebt && (
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:scale-105 active:scale-95"
              style={{ backgroundColor: '#ECFDF5', color: '#059669', fontFamily: 'var(--font-caption)' }}
              onClick={(e) => { e.stopPropagation(); onMarkPaid(firstDebt); }}
              title={`Marcar "${firstDebt.description}" como pagada`}
            >
              <Icon name="CheckCircle" size={13} color="#059669" />
              Pagar
            </button>
          )}
        </div>

        {/* Contact chips */}
        {(supplier.phone || supplier.email) && (
          <div className="mt-3 flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
            {supplier.phone && (
              <a
                href={`tel:${supplier.phone}`}
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg transition-colors hover:bg-muted"
                style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
              >
                <Icon name="Phone" size={11} color="currentColor" />
                {supplier.phone}
              </a>
            )}
            {supplier.email && (
              <a
                href={`mailto:${supplier.email}`}
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg transition-colors hover:bg-muted"
                style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
              >
                <Icon name="Mail" size={11} color="currentColor" />
                <span className="truncate max-w-[120px]">{supplier.email}</span>
              </a>
            )}
          </div>
        )}
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

// ── Stat card ─────────────────────────────────────────────────────
function StatCard({ icon, label, value, color, bg }) {
  return (
    <div
      className="rounded-2xl border p-4 flex items-center gap-3"
      style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)' }}
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: bg }}>
        <Icon name={icon} size={18} color={color} />
      </div>
      <div className="min-w-0">
        <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{label}</p>
        <p className="text-lg font-bold leading-tight" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-stat)' }}>{value}</p>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────
export default function SuppliersPage() {
  const navigate = useNavigate();
  const { business } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [allDebts, setAllDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | pending | healthy

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
    await markDebtAsPaid(debt.id);
    await load();
  };

  // Derived stats
  const debtsBySupplierId = allDebts.reduce((acc, d) => {
    if (!acc[d.supplierId]) acc[d.supplierId] = [];
    acc[d.supplierId].push(d);
    return acc;
  }, {});

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const totalPending = allDebts.filter((d) => d.status === 'pending').reduce((s, d) => s + d.amount, 0);
  const overdueCount = suppliers.filter((s) => computeHealth(debtsBySupplierId[s.id] ?? []) === 'critical').length;
  const paidThisMonth = allDebts.filter((d) => {
    if (d.status !== 'paid' || !d.paidAt) return false;
    const p = new Date(d.paidAt);
    return p.getFullYear() === today.getFullYear() && p.getMonth() === today.getMonth();
  }).reduce((s, d) => s + d.amount, 0);

  const filtered = suppliers.filter((s) => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !(s.contactName ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'pending') return computeHealth(debtsBySupplierId[s.id] ?? []) !== 'healthy';
    if (filter === 'healthy') return computeHealth(debtsBySupplierId[s.id] ?? []) === 'healthy';
    return true;
  });

  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <BusinessSidebar isCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <main
        className="transition-all duration-200"
        style={{ paddingLeft: sidebarWidth, paddingBottom: '80px' }}
      >
        <div className="max-w-4xl mx-auto px-4 py-6 lg:px-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>
                Proveedores
              </h1>
              <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                Gestioná tus proveedores y deudas
              </p>
            </div>
            <button
              onClick={() => { setEditingSupplier(null); setFormOpen(true); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-95"
              style={{ backgroundColor: 'var(--color-primary)', color: '#fff', fontFamily: 'var(--font-caption)' }}
            >
              <Icon name="Plus" size={16} color="#fff" />
              <span className="hidden sm:inline">Nuevo proveedor</span>
              <span className="sm:hidden">Nuevo</span>
            </button>
          </div>

          {/* Stats */}
          {!loading && suppliers.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
              <StatCard icon="TrendingDown" label="Deuda total pendiente" value={`$ ${fmt(totalPending)}`} color="#6366F1" bg="#EEF2FF" />
              <StatCard icon="AlertCircle" label="Proveedores con deuda vencida" value={overdueCount} color="#EF4444" bg="#FEF2F2" />
              <StatCard icon="CheckCircle2" label="Pagado este mes" value={`$ ${fmt(paidThisMonth)}`} color="#10B981" bg="#ECFDF5" />
            </div>
          )}

          {/* Upcoming due banner */}
          {!loading && <UpcomingDueBanner debts={allDebts} suppliers={suppliers} />}

          {/* Search + filter */}
          {!loading && suppliers.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-2 mb-4">
              <div className="relative flex-1">
                <Icon name="Search" size={14} color="var(--color-muted-foreground)" className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar proveedor..."
                  className="w-full pl-8 pr-3 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)', backgroundColor: '#FFFFFF' }}
                />
              </div>
              <div className="flex gap-1">
                {[
                  { key: 'all', label: 'Todos' },
                  { key: 'pending', label: 'Con deuda' },
                  { key: 'healthy', label: 'Al día' },
                ].map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className="px-3 py-2 rounded-xl text-xs font-semibold transition-colors"
                    style={{
                      fontFamily: 'var(--font-caption)',
                      backgroundColor: filter === f.key ? 'var(--color-primary)' : '#FFFFFF',
                      color: filter === f.key ? '#fff' : 'var(--color-muted-foreground)',
                      border: `1px solid ${filter === f.key ? 'transparent' : 'var(--color-border)'}`,
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Content */}
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
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div
        className="w-20 h-20 rounded-3xl flex items-center justify-center mb-4"
        style={{ background: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)' }}
      >
        <Icon name="Truck" size={36} color="#6366F1" />
      </div>
      <h3 className="text-base font-bold mb-1" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>
        Sin proveedores todavía
      </h3>
      <p className="text-sm max-w-xs mb-5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
        Agregá tus proveedores y empezá a hacer seguimiento de deudas y vencimientos sin perderte nada.
      </p>
      <button
        onClick={onAdd}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-95"
        style={{ backgroundColor: 'var(--color-primary)', color: '#fff', fontFamily: 'var(--font-caption)' }}
      >
        <Icon name="Plus" size={16} color="#fff" />
        Agregar primer proveedor
      </button>
    </div>
  );
}
