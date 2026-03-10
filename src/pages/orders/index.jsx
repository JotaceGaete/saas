import React, { useState, useEffect, useCallback } from 'react';
import BusinessSidebar from 'components/ui/BusinessSidebar';
import { useIsDesktop } from 'hooks/useMediaQuery';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { getOrders, updateOrder } from '../../services/waBusinessService';
import { useToast } from '../../components/ui/Toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import PrintOrderModal from './components/PrintOrderModal';
import { formatCLP } from '../../utils/formatCLP';

const ORDER_STATUSES = [
  { key: 'new',       label: 'Nuevo',       color: '#6366F1', bg: '#EEF2FF', icon: 'Sparkles' },
  { key: 'confirmed', label: 'Confirmado',  color: '#0EA5E9', bg: '#E0F2FE', icon: 'CheckCircle' },
  { key: 'preparing', label: 'Preparando',  color: '#F59E0B', bg: '#FEF3C7', icon: 'ChefHat' },
  { key: 'completed', label: 'Completado',  color: '#10B981', bg: '#D1FAE5', icon: 'PackageCheck' },
];

const STATUS_MAP = Object.fromEntries(ORDER_STATUSES?.map(s => [s?.key, s]));

function StatusBadge({ status }) {
  const s = STATUS_MAP?.[status] || STATUS_MAP?.new;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ color: s?.color, backgroundColor: s?.bg }}
    >
      <Icon name={s?.icon} size={11} />
      {s?.label}
    </span>
  );
}

function StatusDropdown({ currentStatus, orderId, onUpdate }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSelect = async (key) => {
    if (key === currentStatus) { setOpen(false); return; }
    setSaving(true);
    setOpen(false);
    await onUpdate(orderId, { status: key });
    setSaving(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={saving}
        className="flex items-center gap-1.5 transition-all duration-150 hover:opacity-80 active:scale-95 disabled:opacity-50"
      >
        <StatusBadge status={currentStatus} />
        {saving
          ? <div className="w-3 h-3 border border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-primary)' }} />
          : <Icon name="ChevronDown" size={12} color="var(--color-muted-foreground)" />
        }
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 top-full mt-1.5 z-20 rounded-xl border overflow-hidden"
            style={{
              backgroundColor: '#fff',
              borderColor: 'var(--color-border)',
              boxShadow: 'var(--shadow-lg)',
              minWidth: '160px',
            }}
          >
            {ORDER_STATUSES?.map(s => (
              <button
                key={s?.key}
                onClick={() => handleSelect(s?.key)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-muted transition-colors"
                style={{ fontFamily: 'var(--font-caption)' }}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: s?.color }}
                />
                <span className={currentStatus === s?.key ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
                  {s?.label}
                </span>
                {currentStatus === s?.key && <Icon name="Check" size={12} color={s?.color} className="ml-auto" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function OrderCard({ order, onUpdate, businessName }) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteText, setNoteText] = useState(order?.internalNotes || '');
  const [savingNote, setSavingNote] = useState(false);
  const [showPrint, setShowPrint] = useState(false);

  const handleSaveNote = async () => {
    setSavingNote(true);
    await onUpdate(order?.id, { internalNotes: noteText });
    setSavingNote(false);
    setNotesOpen(false);
  };

  const formattedDate = order?.createdAt
    ? format(new Date(order.createdAt), "d MMM yyyy, HH:mm", { locale: es })
    : '—';

  const whatsappHref = order?.customerPhone
    ? `https://wa.me/${order?.customerPhone?.replace(/\D/g, '')}`
    : null;

  return (
    <div
      className="rounded-2xl border bg-white transition-all duration-150 hover:shadow-md"
      style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-xs)' }}
    >
      {/* Card header */}
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)' }}
          >
            {order?.customerName?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-foreground truncate" style={{ fontFamily: 'var(--font-heading)' }}>
              {order?.customerName || 'Sin nombre'}
            </p>
            {order?.customerPhone ? (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs mt-0.5 hover:underline"
                style={{ color: '#25D366', fontFamily: 'var(--font-caption)' }}
              >
                <Icon name="MessageCircle" size={11} />
                {order?.customerPhone}
              </a>
            ) : (
              <span className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Sin teléfono</span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <StatusDropdown currentStatus={order?.status || 'new'} orderId={order?.id} onUpdate={onUpdate} />
          <span className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            {formattedDate}
          </span>
        </div>
      </div>
      {/* Divider */}
      <div className="mx-5 border-t" style={{ borderColor: 'var(--color-border)' }} />
      {/* Products */}
      <div className="px-5 py-3">
        <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Productos</p>
        <div className="space-y-1.5">
          {order?.items?.length > 0 ? order?.items?.map(item => (
            <div key={item?.id} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-foreground)' }}
                >
                  {item?.quantity}
                </span>
                <span className="text-sm truncate" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                  {item?.productName}
                </span>
              </div>
              <span className="text-sm font-semibold flex-shrink-0" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                {formatCLP(item?.subtotal)}
              </span>
            </div>
          )) : (
            <p className="text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Sin productos registrados</p>
          )}
        </div>
      </div>
      {/* Footer */}
      <div
        className="flex items-center justify-between px-5 py-3 rounded-b-2xl"
        style={{ backgroundColor: 'var(--color-muted)' }}
      >
        <button
          onClick={() => setNotesOpen(o => !o)}
          className="flex items-center gap-1.5 text-xs transition-colors hover:text-foreground"
          style={{ color: order?.internalNotes ? 'var(--color-primary)' : 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
        >
          <Icon name="StickyNote" size={13} />
          {order?.internalNotes ? 'Ver nota interna' : 'Agregar nota interna'}
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPrint(true)}
            className="flex items-center gap-1.5 text-xs font-medium transition-all hover:opacity-80 active:scale-95 px-2.5 py-1.5 rounded-lg"
            style={{ color: 'var(--color-primary)', backgroundColor: 'rgba(124,58,237,0.08)', fontFamily: 'var(--font-caption)' }}
          >
            <Icon name="Printer" size={12} color="var(--color-primary)" />
            Imprimir pedido
          </button>
          <span className="text-sm font-bold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>
            Total: {formatCLP(order?.totalAmount)}
          </span>
        </div>
      </div>
      {/* Internal notes panel */}
      {notesOpen && (
        <div className="px-5 pb-5 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nota interna</p>
          <textarea
            value={noteText}
            onChange={e => setNoteText(e?.target?.value)}
            placeholder="Escribe una nota privada sobre este pedido..."
            rows={3}
            className="w-full rounded-xl border px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 transition-all"
            style={{
              borderColor: 'var(--color-border)',
              fontFamily: 'var(--font-caption)',
              color: 'var(--color-foreground)',
              backgroundColor: '#FAFAFA',
              '--tw-ring-color': 'var(--color-primary)',
            }}
          />
          <div className="flex items-center justify-end gap-2 mt-2">
            <button
              onClick={() => { setNotesOpen(false); setNoteText(order?.internalNotes || ''); }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-muted"
              style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveNote}
              disabled={savingNote}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
            >
              {savingNote ? 'Guardando...' : 'Guardar nota'}
            </button>
          </div>
        </div>
      )}
      {showPrint && (
        <PrintOrderModal
          order={order}
          businessName={businessName}
          onClose={() => setShowPrint(false)}
        />
      )}
    </div>
  );
}

export default function OrdersPage() {
  const { business, businessLoading } = useAuth();
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const isDesktop = useIsDesktop();
  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';

  const loadOrders = useCallback(async () => {
    if (!business?.id) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await getOrders(business?.id);
    if (error) {
      toast?.error('Error al cargar los pedidos');
    } else {
      setOrders(data || []);
    }
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const handleUpdate = useCallback(async (orderId, updates) => {
    const { error } = await updateOrder(orderId, updates);
    if (error) {
      toast?.error('No se pudo actualizar el pedido');
    } else {
      toast?.success('Pedido actualizado');
      setOrders(prev => prev?.map(o =>
        o?.id === orderId ? { ...o, ...updates } : o
      ));
    }
  }, [toast]);

  const filteredOrders = orders?.filter(o => {
    const matchStatus = filterStatus === 'all' || (o?.status || 'new') === filterStatus;
    const q = searchQuery?.toLowerCase();
    const matchSearch = !q ||
      o?.customerName?.toLowerCase()?.includes(q) ||
      o?.customerPhone?.toLowerCase()?.includes(q) ||
      o?.items?.some(i => i?.productName?.toLowerCase()?.includes(q));
    return matchStatus && matchSearch;
  });

  const countByStatus = (key) => orders?.filter(o => (o?.status || 'new') === key)?.length;

  if (businessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-background)' }}>
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  return (
    <div className="panel-root min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <BusinessSidebar isCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <main
        className="panel-main min-h-screen w-full max-w-full min-w-0 overflow-x-hidden transition-all duration-200"
        style={{ marginLeft: isDesktop ? sidebarWidth : 0, minHeight: '100vh', transition: 'margin-left var(--transition-base)' }}
      >
        <div className="w-full max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8 pb-20 lg:pb-8">
          {/* Page header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-1">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)' }}
              >
                <Icon name="ShoppingBag" size={17} color="#fff" />
              </div>
              <div>
                <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>Pedidos</h1>
                <p className="text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                  {orders?.length} pedido{orders?.length !== 1 ? 's' : ''} en total
                </p>
              </div>
            </div>
          </div>

          {/* Status summary strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {ORDER_STATUSES?.map(s => (
              <button
                key={s?.key}
                onClick={() => setFilterStatus(prev => prev === s?.key ? 'all' : s?.key)}
                className="rounded-xl border p-3.5 text-left transition-all duration-150 hover:shadow-sm active:scale-[0.98]"
                style={{
                  borderColor: filterStatus === s?.key ? s?.color : 'var(--color-border)',
                  backgroundColor: filterStatus === s?.key ? s?.bg : '#fff',
                  boxShadow: filterStatus === s?.key ? `0 0 0 1px ${s?.color}` : 'var(--shadow-xs)',
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: s?.bg }}>
                    <Icon name={s?.icon} size={14} color={s?.color} />
                  </div>
                  <span className="text-xl font-bold" style={{ color: s?.color, fontFamily: 'var(--font-heading)' }}>
                    {countByStatus(s?.key)}
                  </span>
                </div>
                <p className="text-xs font-semibold" style={{ color: filterStatus === s?.key ? s?.color : 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                  {s?.label}
                </p>
              </button>
            ))}
          </div>

          {/* Search + filter bar */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Icon
                name="Search"
                size={15}
                color="var(--color-muted-foreground)"
                className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e?.target?.value)}
                placeholder="Buscar por cliente, teléfono o producto..."
                className="w-full h-10 pl-9 pr-4 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all"
                style={{
                  borderColor: 'var(--color-border)',
                  fontFamily: 'var(--font-caption)',
                  color: 'var(--color-foreground)',
                  backgroundColor: '#fff',
                  '--tw-ring-color': 'var(--color-primary)',
                }}
              />
            </div>
            {filterStatus !== 'all' && (
              <button
                onClick={() => setFilterStatus('all')}
                className="flex items-center gap-1.5 h-10 px-4 rounded-xl border text-sm font-medium transition-colors hover:bg-muted"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)', backgroundColor: '#fff' }}
              >
                <Icon name="X" size={13} />
                Limpiar filtro
              </button>
            )}
          </div>

          {/* Orders grid */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6]?.map(i => (
                <div key={i} className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="p-5 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-muted animate-pulse" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3.5 bg-muted rounded-full w-2/3 animate-pulse" />
                        <div className="h-3 bg-muted rounded-full w-1/2 animate-pulse" />
                      </div>
                    </div>
                    <div className="h-px bg-muted" />
                    <div className="space-y-2">
                      <div className="h-3 bg-muted rounded-full w-full animate-pulse" />
                      <div className="h-3 bg-muted rounded-full w-4/5 animate-pulse" />
                    </div>
                  </div>
                  <div className="h-10 bg-muted animate-pulse" />
                </div>
              ))}
            </div>
          ) : filteredOrders?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                style={{ backgroundColor: 'var(--color-muted)' }}
              >
                <Icon name="ShoppingCart" size={28} color="var(--color-muted-foreground)" />
              </div>
              <h3 className="text-base font-semibold mb-1" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
                {searchQuery || filterStatus !== 'all' ? 'Sin resultados' : 'Aún no hay pedidos'}
              </h3>
              <p className="text-sm max-w-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                {searchQuery || filterStatus !== 'all' ?'Intenta con otros filtros o términos de búsqueda.' :'Cuando tus clientes realicen pedidos desde tu catálogo, aparecerán aquí.'}
              </p>
              {(searchQuery || filterStatus !== 'all') && (
                <button
                  onClick={() => { setSearchQuery(''); setFilterStatus('all'); }}
                  className="mt-4 px-4 py-2 rounded-xl text-sm font-medium transition-colors hover:opacity-90"
                  style={{ backgroundColor: 'var(--color-primary)', color: '#fff', fontFamily: 'var(--font-caption)' }}
                >
                  Ver todos los pedidos
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredOrders?.map(order => (
                <OrderCard
                  key={order?.id}
                  order={order}
                  onUpdate={handleUpdate}
                  businessName={business?.name}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
