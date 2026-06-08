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
  markDebtAsPaid,
  deleteSupplierDebt,
} from '../../services/waBusinessService';
import SupplierFormModal from '../../components/SupplierFormModal';
import DebtFormModal from '../../components/DebtFormModal';

function fmt(n) {
  return new Intl.NumberFormat('es', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n ?? 0);
}

const STATUS_CONFIG = {
  pending:  { label: 'Pendiente', color: '#6366F1', bg: '#EEF2FF', icon: 'Clock' },
  overdue:  { label: 'Vencida',   color: '#EF4444', bg: '#FEF2F2', icon: 'AlertCircle' },
  paid:     { label: 'Pagada',    color: '#10B981', bg: '#ECFDF5', icon: 'CheckCircle2' },
};

function DebtTimelineItem({ debt, onMarkPaid, onEdit, onDelete }) {
  const cfg = STATUS_CONFIG[debt.status] ?? STATUS_CONFIG.pending;
  const [menuOpen, setMenuOpen] = useState(false);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isOverdue = debt.status === 'pending' && debt.dueDate && new Date(debt.dueDate) < today;
  const effectiveCfg = isOverdue ? STATUS_CONFIG.overdue : cfg;

  return (
    <div className="relative flex gap-4">
      {/* Timeline dot + line */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center z-10 flex-shrink-0"
          style={{ backgroundColor: effectiveCfg.bg, border: `2px solid ${effectiveCfg.color}` }}
        >
          <Icon name={effectiveCfg.icon} size={14} color={effectiveCfg.color} />
        </div>
        <div className="w-px flex-1 mt-1" style={{ backgroundColor: 'var(--color-border)', minHeight: '12px' }} />
      </div>

      {/* Content */}
      <div
        className="flex-1 rounded-2xl border p-3.5 mb-3 group"
        style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                {debt.description}
              </p>
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                style={{ backgroundColor: effectiveCfg.bg, color: effectiveCfg.color, fontFamily: 'var(--font-caption)' }}
              >
                {isOverdue ? 'Vencida' : effectiveCfg.label}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <p className="text-base font-bold" style={{ color: isOverdue ? '#EF4444' : 'var(--color-foreground)', fontFamily: 'var(--font-stat)' }}>
                $ {fmt(debt.amount)}
              </p>
              {debt.dueDate && debt.status !== 'paid' && (
                <p className="text-xs" style={{ color: isOverdue ? '#EF4444' : 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                  Vence {new Date(debt.dueDate).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              )}
              {debt.paidAt && (
                <p className="text-xs" style={{ color: '#10B981', fontFamily: 'var(--font-caption)' }}>
                  Pagada {new Date(debt.paidAt).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {debt.status === 'pending' && (
              <button
                onClick={() => onMarkPaid(debt)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105"
                style={{ backgroundColor: '#ECFDF5', color: '#059669', fontFamily: 'var(--font-caption)' }}
              >
                <Icon name="Check" size={12} color="#059669" />
                Pagar
              </button>
            )}
            <div className="relative">
              <button
                className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
                onClick={() => setMenuOpen((p) => !p)}
                aria-label="Opciones"
              >
                <Icon name="MoreVertical" size={13} color="var(--color-muted-foreground)" />
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 top-8 z-10 rounded-xl border shadow-lg py-1 min-w-[130px]"
                  style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)' }}
                >
                  <button
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-muted transition-colors text-left"
                    style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
                    onClick={() => { setMenuOpen(false); onEdit(debt); }}
                  >
                    <Icon name="Edit2" size={12} color="currentColor" />
                    Editar
                  </button>
                  <button
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-muted transition-colors text-left"
                    style={{ color: '#EF4444', fontFamily: 'var(--font-caption)' }}
                    onClick={() => { setMenuOpen(false); onDelete(debt); }}
                  >
                    <Icon name="Trash2" size={12} color="#EF4444" />
                    Eliminar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <p className="text-xs mt-1.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          Registrada {new Date(debt.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      </div>
    </div>
  );
}

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
  const [tab, setTab] = useState('pending'); // pending | paid

  const load = useCallback(async () => {
    if (!supplierId) return;
    setLoading(true);
    const [{ data: s }, { data: d }] = await Promise.all([
      getSupplier(supplierId),
      getSupplierDebts(supplierId),
    ]);
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
    await markDebtAsPaid(debt.id);
    await load();
  };

  const handleDeleteDebt = async (debt) => {
    if (!window.confirm(`¿Eliminar la deuda "${debt.description}"?`)) return;
    await deleteSupplierDebt(debt.id);
    await load();
  };

  const pendingDebts = debts.filter((d) => d.status !== 'paid');
  const paidDebts = debts.filter((d) => d.status === 'paid');
  const totalPending = pendingDebts.reduce((s, d) => s + d.amount, 0);
  const totalPaid = paidDebts.reduce((s, d) => s + d.amount, 0);

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
            <Icon name="AlertCircle" size={32} color="var(--color-muted-foreground)" />
            <p style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Proveedor no encontrado</p>
            <button
              onClick={() => navigate('/proveedores')}
              className="text-sm font-medium underline"
              style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
            >
              Volver a proveedores
            </button>
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
          <button
            onClick={() => navigate('/proveedores')}
            className="flex items-center gap-1.5 text-sm mb-5 transition-colors hover:opacity-80"
            style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
          >
            <Icon name="ArrowLeft" size={15} color="currentColor" />
            Proveedores
          </button>

          {/* Supplier header card */}
          <div
            className="rounded-2xl border p-5 mb-4"
            style={{
              backgroundColor: '#FFFFFF',
              borderColor: 'var(--color-border)',
              background: hasOverdue
                ? 'linear-gradient(135deg, #FFFFFF 70%, #FFF5F5 100%)'
                : 'linear-gradient(135deg, #FFFFFF 70%, #F0FDF4 100%)',
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-4">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold"
                  style={{
                    background: hasOverdue
                      ? 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)'
                      : 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)',
                    color: hasOverdue ? '#EF4444' : '#6366F1',
                  }}
                >
                  {supplier.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h1 className="text-lg font-bold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>
                    {supplier.name}
                  </h1>
                  {supplier.contactName && (
                    <p className="text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                      {supplier.contactName}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setEditOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors hover:bg-muted"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
              >
                <Icon name="Edit2" size={13} color="currentColor" />
                Editar
              </button>
            </div>

            {/* Contact info */}
            {(supplier.phone || supplier.email || supplier.notes) && (
              <div className="mt-4 pt-4 border-t space-y-2" style={{ borderColor: 'var(--color-border)' }}>
                {supplier.phone && (
                  <a
                    href={`tel:${supplier.phone}`}
                    className="flex items-center gap-2 text-sm transition-colors hover:opacity-80"
                    style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
                  >
                    <Icon name="Phone" size={14} color="var(--color-muted-foreground)" />
                    {supplier.phone}
                  </a>
                )}
                {supplier.email && (
                  <a
                    href={`mailto:${supplier.email}`}
                    className="flex items-center gap-2 text-sm transition-colors hover:opacity-80"
                    style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
                  >
                    <Icon name="Mail" size={14} color="var(--color-muted-foreground)" />
                    {supplier.email}
                  </a>
                )}
                {supplier.notes && (
                  <p className="flex items-start gap-2 text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                    <Icon name="FileText" size={14} color="currentColor" className="flex-shrink-0 mt-0.5" />
                    {supplier.notes}
                  </p>
                )}
              </div>
            )}

            {/* Financial summary */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div
                className="rounded-xl p-3"
                style={{ backgroundColor: hasOverdue ? '#FEF2F2' : '#EEF2FF' }}
              >
                <p className="text-xs mb-1" style={{ color: hasOverdue ? '#B91C1C' : '#4338CA', fontFamily: 'var(--font-caption)' }}>
                  Pendiente
                </p>
                <p className="text-xl font-bold" style={{ color: hasOverdue ? '#EF4444' : '#6366F1', fontFamily: 'var(--font-stat)' }}>
                  $ {fmt(totalPending)}
                </p>
                <p className="text-xs mt-0.5" style={{ color: hasOverdue ? '#EF4444' : '#6366F1', fontFamily: 'var(--font-caption)', opacity: 0.8 }}>
                  {pendingDebts.length} deuda{pendingDebts.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="rounded-xl p-3" style={{ backgroundColor: '#ECFDF5' }}>
                <p className="text-xs mb-1" style={{ color: '#065F46', fontFamily: 'var(--font-caption)' }}>
                  Total pagado
                </p>
                <p className="text-xl font-bold" style={{ color: '#10B981', fontFamily: 'var(--font-stat)' }}>
                  $ {fmt(totalPaid)}
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#10B981', fontFamily: 'var(--font-caption)', opacity: 0.8 }}>
                  {paidDebts.length} pago{paidDebts.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          </div>

          {/* Debts section */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex gap-1">
              {[
                { key: 'pending', label: `Pendientes (${pendingDebts.length})` },
                { key: 'paid', label: `Pagadas (${paidDebts.length})` },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                  style={{
                    fontFamily: 'var(--font-caption)',
                    backgroundColor: tab === t.key ? 'var(--color-primary)' : '#FFFFFF',
                    color: tab === t.key ? '#fff' : 'var(--color-muted-foreground)',
                    border: `1px solid ${tab === t.key ? 'transparent' : 'var(--color-border)'}`,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => { setEditingDebt(null); setDebtFormOpen(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:opacity-90 active:scale-95"
              style={{ backgroundColor: 'var(--color-primary)', color: '#fff', fontFamily: 'var(--font-caption)' }}
            >
              <Icon name="Plus" size={13} color="#fff" />
              Registrar deuda
            </button>
          </div>

          {/* Timeline */}
          {(tab === 'pending' ? pendingDebts : paidDebts).length === 0 ? (
            <div className="text-center py-10" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              <Icon name={tab === 'pending' ? 'CheckCircle2' : 'Clock'} size={28} color="currentColor" className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">
                {tab === 'pending' ? '¡Sin deudas pendientes!' : 'Todavía no hay deudas pagadas'}
              </p>
            </div>
          ) : (
            <div>
              {(tab === 'pending' ? pendingDebts : paidDebts).map((d) => (
                <DebtTimelineItem
                  key={d.id}
                  debt={d}
                  onMarkPaid={handleMarkPaid}
                  onEdit={(debt) => { setEditingDebt(debt); setDebtFormOpen(true); }}
                  onDelete={handleDeleteDebt}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <SupplierFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSave={handleSaveSupplier}
        supplier={supplier}
      />
      <DebtFormModal
        open={debtFormOpen}
        onClose={() => setDebtFormOpen(false)}
        onSave={handleSaveDebt}
        debt={editingDebt}
      />
    </div>
  );
}
