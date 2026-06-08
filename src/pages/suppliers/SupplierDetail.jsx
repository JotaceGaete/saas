import React, { useState, useEffect, useCallback } from 'react';
import { differenceInCalendarDays, parseISO, format } from 'date-fns';
import { es } from 'date-fns/locale';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import PremiumLoader from 'components/ui/PremiumLoader';
import EmptyState from 'components/ui/EmptyState';
import Button from 'components/ui/Button';
import Icon from 'components/AppIcon';
import { useAuth } from 'contexts/AuthContext';
import { useToast } from 'components/ui/Toast';
import {
  getSupplier,
  getSupplierDebts,
  createSupplierDebt,
  updateSupplierDebt,
  deleteSupplierDebt,
  markDebtAsPaid,
} from 'services/waBusinessService';
import DebtFormModal from './components/DebtFormModal';

const STATUS_LABELS = { pending: 'Pendiente', paid: 'Pagado', overdue: 'Vencido' };
const STATUS_STYLES = {
  pending: { bg: 'rgba(251,146,60,0.1)', color: 'rgb(154,52,18)' },
  paid:    { bg: 'rgba(16,185,129,0.1)', color: 'rgb(5,150,105)' },
  overdue: { bg: 'rgba(239,68,68,0.1)',  color: 'rgb(185,28,28)' },
};

export default function SupplierDetail({ supplierId, onBack }) {
  const { business } = useAuth();
  const toast = useToast();
  const [supplier, setSupplier] = useState(null);
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [debtModal, setDebtModal] = useState({ open: false, debt: null });

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: s }, { data: d }] = await Promise.all([
      getSupplier(supplierId),
      getSupplierDebts(business?.id, supplierId),
    ]);
    setSupplier(s);
    setDebts(d || []);
    setLoading(false);
  }, [supplierId, business?.id]);

  useEffect(() => { load(); }, [load]);

  const totalPending = debts.filter((d) => d.status !== 'paid').reduce((a, d) => a + parseFloat(d.amount || 0), 0);
  const totalPaid = debts.filter((d) => d.status === 'paid').reduce((a, d) => a + parseFloat(d.amount || 0), 0);

  const handleSaveDebt = async (values) => {
    setSaving(true);
    if (debtModal.debt) {
      const { error } = await updateSupplierDebt(debtModal.debt.id, values);
      if (error) { toast.error('Error al guardar'); setSaving(false); return; }
      toast.success('Deuda actualizada');
    } else {
      const { error } = await createSupplierDebt(business.id, values);
      if (error) { toast.error('Error al registrar'); setSaving(false); return; }
      toast.success('Deuda registrada');
    }
    setSaving(false);
    setDebtModal({ open: false, debt: null });
    load();
  };

  const handleMarkPaid = async (id) => {
    const { error } = await markDebtAsPaid(id);
    if (error) { toast.error('Error al marcar como pagado'); return; }
    toast.success('Marcado como pagado');
    load();
  };

  const handleDeleteDebt = async (id) => {
    if (!window.confirm('¿Eliminar esta deuda?')) return;
    const { error } = await deleteSupplierDebt(id);
    if (error) { toast.error('Error al eliminar'); return; }
    toast.success('Deuda eliminada');
    load();
  };

  const getAutoStatus = (debt) => {
    if (debt.status === 'paid') return 'paid';
    if (debt.due_date) {
      const days = differenceInCalendarDays(parseISO(debt.due_date), new Date());
      if (days < 0) return 'overdue';
    }
    return debt.status;
  };

  return (
    <DashboardAppShell>
      <PanelHeader
        leftAction={
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 transition-colors -ml-1" type="button">
            <Icon name="ArrowLeft" size={18} color="var(--color-foreground)" />
          </button>
        }
        leftSpacer={false}
        title={
          loading ? null : (
            <div>
              <h1 className="text-base font-bold truncate" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
                {supplier?.name}
              </h1>
              {supplier?.contact_name && (
                <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>{supplier.contact_name}</p>
              )}
            </div>
          )
        }
      >
        <Button size="sm" iconName="Plus" onClick={() => setDebtModal({ open: true, debt: null })}>
          Deuda
        </Button>
      </PanelHeader>

      <DashboardLayoutContent>
        {loading ? (
          <PremiumLoader />
        ) : (
          <>
            {/* Resumen */}
            <div className="px-4 md:px-6 pt-4 grid grid-cols-2 gap-3">
              <div
                className="rounded-xl p-4"
                style={{ backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}
              >
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-muted-foreground)' }}>Deuda pendiente</p>
                <p className="text-xl font-bold" style={{ color: 'rgb(185,28,28)', fontFamily: 'var(--font-heading)' }}>
                  ${totalPending.toLocaleString('es-AR', { minimumFractionDigits: 0 })}
                </p>
              </div>
              <div
                className="rounded-xl p-4"
                style={{ backgroundColor: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}
              >
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-muted-foreground)' }}>Total pagado</p>
                <p className="text-xl font-bold" style={{ color: 'rgb(5,150,105)', fontFamily: 'var(--font-heading)' }}>
                  ${totalPaid.toLocaleString('es-AR', { minimumFractionDigits: 0 })}
                </p>
              </div>
            </div>

            {/* Info de contacto */}
            {(supplier?.phone || supplier?.email) && (
              <div className="px-4 md:px-6 pt-3 flex gap-3">
                {supplier.phone && (
                  <a
                    href={`tel:${supplier.phone}`}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)' }}
                  >
                    <Icon name="Phone" size={13} /> {supplier.phone}
                  </a>
                )}
                {supplier.email && (
                  <a
                    href={`mailto:${supplier.email}`}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)' }}
                  >
                    <Icon name="Mail" size={13} /> {supplier.email}
                  </a>
                )}
              </div>
            )}

            {/* Notas */}
            {supplier?.notes && (
              <div className="px-4 md:px-6 pt-3">
                <p className="text-xs rounded-xl p-3" style={{ color: 'var(--color-muted-foreground)', backgroundColor: 'var(--color-muted)', borderRadius: '10px' }}>
                  {supplier.notes}
                </p>
              </div>
            )}

            {/* Historial de deudas */}
            <div className="px-4 md:px-6 pt-4 pb-2">
              <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>
                Historial de deudas
              </h2>

              {debts.length === 0 ? (
                <EmptyState
                  compact
                  illustration="generic"
                  title="Sin deudas registradas"
                  description="Registrá las deudas con este proveedor para llevar el control."
                  action={() => setDebtModal({ open: true, debt: null })}
                  actionLabel="Registrar deuda"
                  actionIcon="Plus"
                />
              ) : (
                <div className="space-y-2">
                  {debts.map((d) => {
                    const status = getAutoStatus(d);
                    const style = STATUS_STYLES[status];
                    const daysUntilDue = d.due_date ? differenceInCalendarDays(parseISO(d.due_date), new Date()) : null;
                    return (
                      <div
                        key={d.id}
                        className="rounded-xl p-4"
                        style={{ backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-foreground)' }}>{d.description}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span
                                className="text-xs font-medium px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: style.bg, color: style.color }}
                              >
                                {STATUS_LABELS[status]}
                              </span>
                              {d.due_date && status !== 'paid' && (
                                <span className="text-xs" style={{ color: daysUntilDue < 0 ? 'rgb(185,28,28)' : daysUntilDue <= 7 ? 'rgb(154,52,18)' : 'var(--color-muted-foreground)' }}>
                                  {daysUntilDue < 0
                                    ? `Vencido hace ${Math.abs(daysUntilDue)} día${Math.abs(daysUntilDue) > 1 ? 's' : ''}`
                                    : daysUntilDue === 0
                                      ? 'Vence hoy'
                                      : `Vence en ${daysUntilDue} día${daysUntilDue > 1 ? 's' : ''}`}
                                </span>
                              )}
                              {d.paid_at && (
                                <span className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                                  Pagado {format(new Date(d.paid_at), "d MMM yyyy", { locale: es })}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <p className="text-base font-bold" style={{ color: status === 'paid' ? 'rgb(5,150,105)' : 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>
                              ${parseFloat(d.amount).toLocaleString('es-AR', { minimumFractionDigits: 0 })}
                            </p>
                            <div className="flex items-center gap-1">
                              {status !== 'paid' && (
                                <button
                                  type="button"
                                  onClick={() => handleMarkPaid(d.id)}
                                  className="p-1.5 rounded-lg hover:bg-green-50 transition-colors"
                                  title="Marcar como pagado"
                                >
                                  <Icon name="CheckCircle" size={14} color="rgb(5,150,105)" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setDebtModal({ open: true, debt: d })}
                                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                                title="Editar"
                              >
                                <Icon name="Pencil" size={14} color="var(--color-muted-foreground)" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteDebt(d.id)}
                                className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                                title="Eliminar"
                              >
                                <Icon name="Trash2" size={14} color="var(--color-error)" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </DashboardLayoutContent>

      {debtModal.open && (
        <DebtFormModal
          debt={debtModal.debt}
          supplierId={supplierId}
          onSave={handleSaveDebt}
          onClose={() => setDebtModal({ open: false, debt: null })}
          saving={saving}
        />
      )}
    </DashboardAppShell>
  );
}
