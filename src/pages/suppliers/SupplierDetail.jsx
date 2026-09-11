import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';
import BusinessSidebar from 'components/ui/BusinessSidebar';
import { useAuth } from '../../contexts/AuthContext';
import { formatMoney } from '../../utils/formatMoney';
import { getSupplier, updateSupplier } from '../../services/waBusinessService';
import {
  getSupplierInvoicesBySupplier,
  getSupplierPayments,
  createSupplierInvoice,
  updateSupplierInvoice,
  deleteSupplierInvoice,
  registerSupplierPayment,
} from '../../services/supplierInvoiceService';
import SupplierFormModal from '../../components/SupplierFormModal';
import SupplierInvoiceFormModal from '../../components/SupplierInvoiceFormModal';
import SupplierPaymentModal from '../../components/SupplierPaymentModal';

const TYPE_LABELS = {
  mercaderia: 'Mercadería', insumos: 'Insumos', servicios: 'Servicios',
  transporte: 'Transporte', arriendo: 'Arriendo', marketing: 'Marketing', otros: 'Otros',
};

const PURCHASE_TYPE_LABELS = {
  mercaderia: 'Mercadería', gasto_con_iva: 'Gasto con IVA', gasto_sin_iva: 'Gasto sin IVA',
  servicio: 'Servicio', otros: 'Otros',
};

const PAYMENT_METHOD_LABELS = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', check: 'Cheque', other: 'Otro' };

const PAYMENT_STATUS_CFG = {
  paid:    { color: '#10B981', bg: '#ECFDF5', icon: 'CheckCircle2', label: 'Pagada' },
  partial: { color: '#3B82F6', bg: '#EFF6FF', icon: 'Clock', label: 'Parcial' },
  pending: { color: '#6366F1', bg: '#EEF2FF', icon: 'Clock', label: 'Pendiente' },
};

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

function docLabel(invoice) {
  const type = invoice.documentType === 'boleta' ? 'Boleta' : invoice.documentType === 'other' ? 'Documento' : 'Factura';
  return invoice.documentNumber ? `${type} ${invoice.documentNumber}` : type;
}

// ── Fila de factura ───────────────────────────────────────────────
function InvoiceRow({ invoice, onPay, onEdit, onDelete, isLast }) {
  const cfg = PAYMENT_STATUS_CFG[invoice.paymentStatus] ?? PAYMENT_STATUS_CFG.pending;
  const [menuOpen, setMenuOpen] = useState(false);
  const canDelete = Number(invoice.paidAmount ?? 0) === 0; // §9: nunca ofrecer eliminar si tiene pagos

  return (
    <div className="relative flex gap-4">
      <div className="flex flex-col items-center flex-shrink-0">
        <div className="w-8 h-8 rounded-full flex items-center justify-center z-10" style={{ backgroundColor: invoice.isOverdue ? '#FEF2F2' : cfg.bg, border: `2px solid ${invoice.isOverdue ? '#EF4444' : cfg.color}` }}>
          <Icon name={invoice.isOverdue ? 'AlertCircle' : cfg.icon} size={14} color={invoice.isOverdue ? '#EF4444' : cfg.color} />
        </div>
        {!isLast && <div className="w-px flex-1 mt-1" style={{ backgroundColor: 'var(--color-border)', minHeight: '16px' }} />}
      </div>

      <div className="flex-1 rounded-2xl border p-4 mb-3 group" style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)' }}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className="text-sm font-semibold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>{docLabel(invoice)}</p>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: cfg.bg, color: cfg.color, fontFamily: 'var(--font-caption)' }}>{cfg.label}</span>
              {invoice.isOverdue && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#FEF2F2', color: '#EF4444', fontFamily: 'var(--font-caption)' }}>Vencida</span>
              )}
              {invoice.purchaseType && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#F3F4F6', color: '#6B7280', fontFamily: 'var(--font-caption)' }}>{PURCHASE_TYPE_LABELS[invoice.purchaseType] ?? invoice.purchaseType}</span>
              )}
            </div>

            <div className="flex items-baseline gap-2 flex-wrap">
              <p className="text-xl font-black" style={{ color: invoice.isOverdue ? '#EF4444' : 'var(--color-foreground)', fontFamily: 'var(--font-stat)' }}>
                $ {formatMoney(invoice.paymentStatus === 'paid' ? invoice.totalAmount : invoice.balance)}
              </p>
              {invoice.paymentStatus !== 'paid' && invoice.paidAmount > 0 && (
                <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>de $ {formatMoney(invoice.totalAmount)}</p>
              )}
            </div>

            {invoice.paidAmount > 0 && invoice.paymentStatus !== 'paid' && (
              <div className="mt-2">
                <div className="flex justify-between text-[10px] mb-1" style={{ fontFamily: 'var(--font-caption)' }}>
                  <span style={{ color: '#10B981' }}>Pagado $ {formatMoney(invoice.paidAmount)}</span>
                  <span style={{ color: 'var(--color-muted-foreground)' }}>Saldo $ {formatMoney(invoice.balance)}</span>
                </div>
                <div className="w-full rounded-full h-1.5 overflow-hidden" style={{ backgroundColor: '#E5E7EB' }}>
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min((invoice.paidAmount / invoice.totalAmount) * 100, 100)}%`, backgroundColor: '#10B981' }} />
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-3 mt-2">
              {invoice.dueDate && invoice.paymentStatus !== 'paid' && (
                <span className="text-xs flex items-center gap-1" style={{ color: invoice.isOverdue ? '#EF4444' : '#D97706', fontFamily: 'var(--font-caption)' }}>
                  <Icon name="Calendar" size={11} color="currentColor" />
                  Vence {new Date(invoice.dueDate).toLocaleDateString('es', { day: 'numeric', month: 'long' })}
                </span>
              )}
              <span className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                Emitida {new Date(invoice.issueDate).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
            {invoice.notes && (
              <p className="text-xs mt-1.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{invoice.notes}</p>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {invoice.balance > 0 && (
              <button onClick={() => onPay(invoice)} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105" style={{ backgroundColor: '#ECFDF5', color: '#059669', fontFamily: 'var(--font-caption)' }}>
                <Icon name="Check" size={11} color="#059669" />
                Pagar
              </button>
            )}
            <div className="relative">
              <button className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted" onClick={() => setMenuOpen((p) => !p)} aria-label="Opciones">
                <Icon name="MoreVertical" size={13} color="var(--color-muted-foreground)" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-8 z-10 rounded-xl border shadow-lg py-1 min-w-[130px]" style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)' }}>
                  <button className="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-muted text-left" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }} onClick={() => { setMenuOpen(false); onEdit(invoice); }}>
                    <Icon name="Edit2" size={12} color="currentColor" /> Editar
                  </button>
                  {/* §9: nunca se ofrece eliminar una factura con pagos -- ni siquiera para que el usuario tope con el error de FK */}
                  {canDelete && (
                    <button className="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-muted text-left" style={{ color: '#EF4444', fontFamily: 'var(--font-caption)' }} onClick={() => { setMenuOpen(false); onDelete(invoice); }}>
                      <Icon name="Trash2" size={12} color="#EF4444" /> Eliminar
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Fila de pago ───────────────────────────────────────────────────
function PaymentRow({ payment }) {
  return (
    <div className="rounded-2xl border p-4 mb-3" style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>$ {formatMoney(payment.amount)}</p>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <span className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{PAYMENT_METHOD_LABELS[payment.paymentMethod] ?? payment.paymentMethod}</span>
            <span className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>· {new Date(payment.paymentDate).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            {payment.reference && <span className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>· {payment.reference}</span>}
          </div>
          {payment.notes && <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{payment.notes}</p>}
        </div>
        {/* §9: nunca se ofrece revertir/eliminar un pago -- el backend no lo soporta */}
      </div>
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
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [invoiceFormOpen, setInvoiceFormOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [paymentTarget, setPaymentTarget] = useState(null); // invoice[] a prellenar, o null = todas
  const [tab, setTab] = useState('invoices');

  const load = useCallback(async () => {
    if (!supplierId) return;
    setLoading(true);
    const [{ data: s }, { data: inv }, { data: pay }] = await Promise.all([
      getSupplier(supplierId),
      getSupplierInvoicesBySupplier(supplierId),
      getSupplierPayments(supplierId),
    ]);
    setSupplier(s);
    setInvoices(inv ?? []);
    setPayments(pay ?? []);
    setLoading(false);
  }, [supplierId]);

  useEffect(() => { load(); }, [load]);

  const handleSaveSupplier = async (form) => {
    const { error } = await updateSupplier(supplierId, form);
    if (error) throw error;
    await load();
  };

  const handleSaveInvoice = async (payload) => {
    if (editingInvoice) {
      const { error } = await updateSupplierInvoice(editingInvoice.id, payload);
      if (error) throw error;
    } else {
      const { error } = await createSupplierInvoice(business.id, supplierId, payload);
      if (error) throw error;
    }
    await load();
  };

  const handleDeleteInvoice = async (invoice) => {
    if (!window.confirm(`¿Eliminar ${docLabel(invoice)}?`)) return;
    const { error } = await deleteSupplierInvoice(invoice.id);
    if (error) { window.alert(error.message); return; }
    await load();
  };

  const handleRegisterPayment = async (payload) => {
    const { error } = await registerSupplierPayment(business.id, supplierId, payload);
    if (error) throw error;
    await load();
  };

  const pendingInvoices = invoices.filter((inv) => inv.balance > 0);
  const paidInvoices = invoices.filter((inv) => inv.balance <= 0);
  const totalPending = pendingInvoices.reduce((s, inv) => s + inv.balance, 0);
  const totalPaidHistoric = payments.reduce((s, p) => s + p.amount, 0);
  const lastPayment = payments[0]; // ya viene ordenado por payment_date desc

  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';
  const hasOverdue = invoices.some((inv) => inv.isOverdue);

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
          <button onClick={() => navigate('/proveedores')} className="flex items-center gap-1.5 text-sm mb-5 transition-colors hover:opacity-80" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            <Icon name="ArrowLeft" size={15} color="currentColor" /> Proveedores y Cuentas por Pagar
          </button>

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
                    {supplier.legalName && <span className="text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{supplier.legalName}</span>}
                    {supplier.rut && <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#F3F4F6', color: '#6B7280', fontFamily: 'var(--font-caption)' }}>{supplier.rut}</span>}
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

            {(supplier.phone || supplier.email || supplier.address || supplier.notes) && (
              <div className="flex flex-wrap gap-3 mb-4 pb-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
                {supplier.phone && <a href={`tel:${supplier.phone}`} className="flex items-center gap-1.5 text-sm hover:opacity-80" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}><Icon name="Phone" size={13} color="var(--color-muted-foreground)" />{supplier.phone}</a>}
                {supplier.email && <a href={`mailto:${supplier.email}`} className="flex items-center gap-1.5 text-sm hover:opacity-80" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}><Icon name="Mail" size={13} color="var(--color-muted-foreground)" />{supplier.email}</a>}
                {supplier.address && <p className="flex items-start gap-1.5 text-sm w-full" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}><Icon name="MapPin" size={13} color="currentColor" className="flex-shrink-0 mt-0.5" />{supplier.address}</p>}
                {supplier.notes && <p className="flex items-start gap-1.5 text-sm w-full" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}><Icon name="FileText" size={13} color="currentColor" className="flex-shrink-0 mt-0.5" />{supplier.notes}</p>}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                { label: 'Pendiente', value: `$ ${formatMoney(totalPending)}`, color: hasOverdue ? '#EF4444' : '#6366F1', bg: hasOverdue ? '#FEF2F2' : '#EEF2FF', sub: `${pendingInvoices.length} factura${pendingInvoices.length !== 1 ? 's' : ''}` },
                { label: 'Pagado histórico', value: `$ ${formatMoney(totalPaidHistoric)}`, color: '#10B981', bg: '#ECFDF5', sub: `${payments.length} pago${payments.length !== 1 ? 's' : ''}` },
                { label: 'Facturas registradas', value: invoices.length, color: '#3B82F6', bg: '#EFF6FF', sub: `$ ${formatMoney(invoices.reduce((s, i) => s + i.totalAmount, 0))} total` },
                { label: 'Último pago', value: lastPayment ? timeAgo(lastPayment.paymentDate) : '—', color: lastPayment ? '#10B981' : '#9CA3AF', bg: lastPayment ? '#ECFDF5' : '#F9FAFB', sub: lastPayment ? `$ ${formatMoney(lastPayment.amount)}` : 'Sin pagos' },
              ].map((m) => (
                <div key={m.label} className="rounded-xl p-3" style={{ backgroundColor: m.bg }}>
                  <p className="text-[10px] font-medium mb-1 leading-tight" style={{ color: m.color, fontFamily: 'var(--font-caption)', opacity: 0.8 }}>{m.label}</p>
                  <p className="text-base font-bold leading-tight" style={{ color: m.color, fontFamily: 'var(--font-stat)' }}>{m.value}</p>
                  {m.sub && <p className="text-[10px] mt-0.5" style={{ color: m.color, fontFamily: 'var(--font-caption)', opacity: 0.7 }}>{m.sub}</p>}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <div className="flex gap-1">
              {[
                { key: 'invoices', label: `Facturas (${invoices.length})` },
                { key: 'payments', label: `Pagos (${payments.length})` },
              ].map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)} className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                  style={{ fontFamily: 'var(--font-caption)', backgroundColor: tab === t.key ? 'var(--color-primary)' : '#FFFFFF', color: tab === t.key ? '#fff' : 'var(--color-muted-foreground)', border: `1px solid ${tab === t.key ? 'transparent' : 'var(--color-border)'}` }}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              {pendingInvoices.length > 0 && (
                <button onClick={() => setPaymentTarget(pendingInvoices)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:opacity-90 active:scale-95"
                  style={{ backgroundColor: '#10B981', color: '#fff', fontFamily: 'var(--font-caption)' }}>
                  <Icon name="DollarSign" size={13} color="#fff" /> Registrar pago
                </button>
              )}
              <button onClick={() => { setEditingInvoice(null); setInvoiceFormOpen(true); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:opacity-90 active:scale-95"
                style={{ backgroundColor: 'var(--color-primary)', color: '#fff', fontFamily: 'var(--font-caption)' }}>
                <Icon name="Plus" size={13} color="#fff" /> Registrar factura
              </button>
            </div>
          </div>

          {tab === 'invoices' ? (
            invoices.length === 0 ? (
              <div className="text-center py-10" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                <Icon name="FileText" size={28} color="currentColor" className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Todavía no hay facturas registradas</p>
              </div>
            ) : (
              <div>
                {[...pendingInvoices.sort((a, b) => new Date(a.dueDate ?? a.issueDate) - new Date(b.dueDate ?? b.issueDate)), ...paidInvoices].map((inv, i, arr) => (
                  <InvoiceRow
                    key={inv.id}
                    invoice={inv}
                    isLast={i === arr.length - 1}
                    onPay={(invoice) => setPaymentTarget([invoice])}
                    onEdit={(invoice) => { setEditingInvoice(invoice); setInvoiceFormOpen(true); }}
                    onDelete={handleDeleteInvoice}
                  />
                ))}
              </div>
            )
          ) : (
            payments.length === 0 ? (
              <div className="text-center py-10" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                <Icon name="Clock" size={28} color="currentColor" className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Todavía no hay pagos registrados</p>
              </div>
            ) : (
              <div>
                {payments.map((p) => <PaymentRow key={p.id} payment={p} />)}
              </div>
            )
          )}
        </div>
      </main>

      <SupplierFormModal open={editOpen} onClose={() => setEditOpen(false)} onSave={handleSaveSupplier} supplier={supplier} />
      <SupplierInvoiceFormModal
        open={invoiceFormOpen}
        onClose={() => setInvoiceFormOpen(false)}
        onSave={handleSaveInvoice}
        invoice={editingInvoice}
        supplier={supplier}
        country={business?.country}
      />
      <SupplierPaymentModal
        open={!!paymentTarget}
        onClose={() => setPaymentTarget(null)}
        onSave={handleRegisterPayment}
        supplier={supplier}
        invoices={paymentTarget ?? []}
      />
    </div>
  );
}
