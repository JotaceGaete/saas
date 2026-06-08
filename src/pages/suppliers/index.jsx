import React, { useState, useEffect, useCallback } from 'react';
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
  getSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  getSupplierDebts,
} from 'services/waBusinessService';
import SupplierFormModal from './components/SupplierFormModal';
import UpcomingDueBanner from './components/UpcomingDueBanner';
import SupplierDetail from './SupplierDetail';

export default function SuppliersPage() {
  const { business } = useAuth();
  const toast = useToast();
  const [suppliers, setSuppliers] = useState([]);
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [detailSupplierId, setDetailSupplierId] = useState(null);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const [{ data: sData }, { data: dData }] = await Promise.all([
      getSuppliers(business.id),
      getSupplierDebts(business.id),
    ]);
    setSuppliers(sData || []);
    setDebts(dData || []);
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  const pendingDebtBySupplier = (supplierId) =>
    debts.filter((d) => d.supplier_id === supplierId && d.status !== 'paid')
      .reduce((acc, d) => acc + parseFloat(d.amount || 0), 0);

  const handleOpenCreate = () => { setEditingSupplier(null); setModalOpen(true); };
  const handleOpenEdit = (s) => { setEditingSupplier(s); setModalOpen(true); };

  const handleSave = async (values) => {
    setSaving(true);
    if (editingSupplier) {
      const { error } = await updateSupplier(editingSupplier.id, values);
      if (error) { toast.error('Error al guardar'); setSaving(false); return; }
      toast.success('Proveedor actualizado');
    } else {
      const { error } = await createSupplier(business.id, values);
      if (error) { toast.error('Error al crear proveedor'); setSaving(false); return; }
      toast.success('Proveedor creado');
    }
    setSaving(false);
    setModalOpen(false);
    load();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este proveedor y todas sus deudas?')) return;
    const { error } = await deleteSupplier(id);
    if (error) { toast.error('Error al eliminar'); return; }
    toast.success('Proveedor eliminado');
    load();
  };

  const upcomingWithSupplierName = debts.map((d) => ({
    ...d,
    supplier_name: suppliers.find((s) => s.id === d.supplier_id)?.name,
  }));

  if (detailSupplierId) {
    return (
      <SupplierDetail
        supplierId={detailSupplierId}
        onBack={() => { setDetailSupplierId(null); load(); }}
      />
    );
  }

  return (
    <DashboardAppShell>
      <PanelHeader
        title={<h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>Proveedores</h1>}
      >
        <Button size="sm" iconName="Plus" onClick={handleOpenCreate}>
          Agregar
        </Button>
      </PanelHeader>

      <DashboardLayoutContent>
        {loading ? (
          <PremiumLoader />
        ) : (
          <>
            <UpcomingDueBanner
              debts={upcomingWithSupplierName}
              onSupplierClick={setDetailSupplierId}
            />

            {suppliers.length === 0 ? (
              <EmptyState
                illustration="generic"
                title="Sin proveedores aún"
                description="Agregá tus proveedores para controlar deudas y vencimientos."
                action={handleOpenCreate}
                actionLabel="Agregar proveedor"
                actionIcon="Plus"
              />
            ) : (
              <div className="px-4 md:px-6 py-4 space-y-2">
                {suppliers.map((s) => {
                  const pending = pendingDebtBySupplier(s.id);
                  return (
                    <div
                      key={s.id}
                      className="flex items-center gap-3 rounded-xl p-4 cursor-pointer transition-colors hover:bg-gray-50 active:scale-[0.99]"
                      style={{ backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}
                      onClick={() => setDetailSupplierId(s.id)}
                    >
                      <div
                        className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-base"
                        style={{ backgroundColor: 'rgba(124,58,237,0.1)', color: 'var(--color-primary)' }}
                      >
                        {s.name.charAt(0).toUpperCase()}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-foreground)' }}>{s.name}</p>
                        {s.contact_name && (
                          <p className="text-xs truncate" style={{ color: 'var(--color-muted-foreground)' }}>{s.contact_name}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {pending > 0 && (
                          <span
                            className="text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: 'rgb(185,28,28)' }}
                          >
                            Debe ${pending.toLocaleString('es-AR', { minimumFractionDigits: 0 })}
                          </span>
                        )}
                        {pending === 0 && (
                          <span
                            className="text-xs font-medium px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: 'rgb(5,150,105)' }}
                          >
                            Al día
                          </span>
                        )}
                        <button
                          type="button"
                          className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                          onClick={(e) => { e.stopPropagation(); handleOpenEdit(s); }}
                          aria-label="Editar proveedor"
                        >
                          <Icon name="Pencil" size={14} color="var(--color-muted-foreground)" />
                        </button>
                        <button
                          type="button"
                          className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                          onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                          aria-label="Eliminar proveedor"
                        >
                          <Icon name="Trash2" size={14} color="var(--color-error)" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </DashboardLayoutContent>

      {modalOpen && (
        <SupplierFormModal
          supplier={editingSupplier}
          onSave={handleSave}
          onClose={() => setModalOpen(false)}
          saving={saving}
        />
      )}
    </DashboardAppShell>
  );
}
