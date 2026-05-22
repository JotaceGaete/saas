import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import PanelHeader from "components/ui/PanelHeader";
import DashboardAppShell from "components/ui/DashboardAppShell";
import DashboardLayoutContent from "components/ui/DashboardLayoutContent";
import PremiumLoader from "components/ui/PremiumLoader";
import ProductFilters from "./components/ProductFilters";
import ProductTable from "./components/ProductTable";
import BulkActionBar from "./components/BulkActionBar";
import DeleteConfirmDialog from "./components/DeleteConfirmDialog";
import ProductStatsBar from "./components/ProductStatsBar";
import Icon from '../../components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { useConfirmedEmailGuard } from '../../hooks/useConfirmedEmailGuard';
import { getProducts, updateProduct, deleteProduct, deleteProducts, createProduct } from '../../services/waBusinessService';
import { getBusinessLocale } from '../../lib/locale/businessLocale';
import { formatBusinessCurrency } from '../../utils/formatPrice';
import { isRestaurantBusiness } from '../../utils/businessType';


export default function ProductManagement() {
  const navigate = useNavigate();
  const toast = useToast();
  const { business, user, businessLoading, refreshBusiness } = useAuth();
  const guard = useConfirmedEmailGuard();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, isBulk: false, targetId: null });
  const [deleting, setDeleting] = useState(false);
  const refreshAttempted = React.useRef(false);

  useEffect(() => {
    if (user && !business && !businessLoading && !refreshAttempted.current) {
      refreshAttempted.current = true;
      refreshBusiness();
    }
  }, [user, business, businessLoading, refreshBusiness]);

  useEffect(() => {
    if (!business?.id) { setLoading(false); return; }
    loadProducts();
  }, [business?.id]);

  const loadProducts = async () => {
    setLoading(true); setError(null);
    try {
      const { data, error: err } = await getProducts(business?.id);
      if (err) { setError(err?.message); return; }
      setProducts(data || []);
    } catch (e) { setError('Error al cargar productos'); }
    finally { setLoading(false); }
  };

  const tableProducts = useMemo(() => products?.map(p => ({
    id: p?.id, name: p?.name, description: p?.description || '', price: p?.price,
    category: (p?.category && String(p.category).trim()) || 'General',
    active: p?.isActive,
    isSoldOut: p?.isSoldOut === true,
    commercialState: p?.isActive === false ? 'hidden' : (p?.isSoldOut === true ? 'sold_out' : 'available'),
    image: p?.imageUrl || '', imageAlt: p?.name,
    publicCode: p?.publicCode || '',
  })), [products]);

  const filteredProducts = useMemo(() => {
    let result = [...tableProducts];
    if (searchQuery?.trim()) {
      const q = searchQuery?.toLowerCase();
      const qCode = searchQuery?.trim().toUpperCase();
      result = result?.filter(p =>
        p?.name?.toLowerCase()?.includes(q)
        || p?.description?.toLowerCase()?.includes(q)
        || (p?.publicCode && String(p.publicCode).toUpperCase().includes(qCode)),
      );
    }
    if (statusFilter !== "all") result = result?.filter(p => p?.commercialState === statusFilter);
    result?.sort((a, b) => {
      let aVal = a?.name?.toLowerCase(), bVal = b?.name?.toLowerCase();
      if (sortField === "price") { aVal = a?.price; bVal = b?.price; }
      else if (sortField === "status") { aVal = a?.commercialState || ''; bVal = b?.commercialState || ''; }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return result;
  }, [tableProducts, searchQuery, statusFilter, sortField, sortDir]);

  const stats = useMemo(() => ({
    total: products?.length,
    available: products?.filter(p => p?.isActive !== false && p?.isSoldOut !== true)?.length,
    soldOut: products?.filter(p => p?.isActive !== false && p?.isSoldOut === true)?.length,
    hidden: products?.filter(p => p?.isActive === false)?.length,
  }), [products]);

  const bizLocale = useMemo(() => getBusinessLocale(business), [business]);
  const isRestaurant = isRestaurantBusiness(business);
  const productNoun = isRestaurant ? 'plato' : 'producto';
  const productNounPlural = isRestaurant ? 'platos' : 'productos';
  const screenTitle = isRestaurant ? 'Menú del restaurante' : 'Catálogo de productos';
  const screenSubtitle = isRestaurant
    ? 'Gestiona platos, combos y secciones de tu carta.'
    : 'Organiza lo que tus clientes ven y compran en tu tienda.';
  const emptyTitle = isRestaurant ? 'Todavía no tienes platos en tu menú' : 'Todavía no tienes productos';
  const emptyDescription = isRestaurant
    ? 'Agrega tu primer plato para comenzar a recibir pedidos.'
    : 'Agrega tu primer producto para empezar a vender por WhatsApp.';
  const formatProductPrice = useCallback(
    (n) => formatBusinessCurrency(n, business, bizLocale),
    [business, bizLocale],
  );

  const handleSort = useCallback((field) => {
    setSortField(prev => { if (prev === field) { setSortDir(d => d === "asc" ? "desc" : "asc"); return field; } setSortDir("asc"); return field; });
  }, []);

  const handleSelectAll = useCallback((checked) => { setSelectedIds(checked ? filteredProducts?.map(p => p?.id) : []); }, [filteredProducts]);
  const handleSelectOne = useCallback((id, checked) => { setSelectedIds(prev => checked ? [...prev, id] : prev?.filter(x => x !== id)); }, []);

  const handleChangeStatus = useCallback(async (id, nextState) => {
    const product = products?.find(p => p?.id === id);
    if (!product) return;

    const payload = nextState === 'available'
      ? { isActive: true, isSoldOut: false }
      : nextState === 'sold_out'
        ? { isActive: true, isSoldOut: true }
        : { isActive: false, isSoldOut: false };

    const applyLocalState = () => {
      setProducts(prev => prev?.map(p => (
        p?.id === id
          ? { ...p, isActive: payload.isActive, isSoldOut: payload.isSoldOut }
          : p
      )));
    };

    if (nextState === 'available') {
      guard.runIfConfirmed(async () => {
        const { error: err } = await updateProduct(id, payload);
        if (err) {
          toast?.error(err?.message || 'No se pudo actualizar.');
          return;
        }
        applyLocalState();
      });
      return;
    }
    const { error: err } = await updateProduct(id, payload);
    if (err) {
      toast?.error(err?.message || 'No se pudo actualizar.');
      return;
    }
    applyLocalState();
  }, [products, toast, guard]);

  const handleEdit = useCallback((id) => { navigate(`/product-editor?id=${id}`); }, [navigate]);

  const handleDuplicate = useCallback(async (id) => {
    const product = products?.find(p => p?.id === id);
    if (!product || !business?.id) return;
    const { data, error: err } = await createProduct(business?.id, { name: `${product?.name} (copia)`, description: product?.description, price: product?.price, imageUrl: product?.imageUrl, images: product?.images, isActive: false, sortOrder: product?.sortOrder });
    if (err) {
      toast?.error(err?.message || 'No se pudo duplicar.');
      return;
    }
    if (data) setProducts(prev => [...prev, data]);
  }, [products, business?.id, toast]);

  const handleDeleteRequest = useCallback((id) => { setDeleteDialog({ open: true, isBulk: false, targetId: id }); }, []);
  const handleBulkDelete = useCallback(() => { setDeleteDialog({ open: true, isBulk: true, targetId: null }); }, []);

  const handleConfirmDelete = useCallback(async () => {
    setDeleting(true);
    try {
      if (deleteDialog?.isBulk) {
        const { error: err } = await deleteProducts(selectedIds);
        if (err) {
          toast?.error('Error al eliminar: ' + (err?.message || 'Intenta de nuevo.'));
          setDeleteDialog({ open: false, isBulk: false, targetId: null });
          return;
        }
        setProducts(prev => prev?.filter(p => !selectedIds?.includes(p?.id)));
        setSelectedIds([]);
        toast?.success(selectedIds?.length === 1 ? 'Producto eliminado.' : `${selectedIds?.length} productos eliminados.`);
      } else {
        const id = deleteDialog?.targetId;
        if (!id) { setDeleteDialog({ open: false, isBulk: false, targetId: null }); return; }
        const { error: err } = await deleteProduct(id);
        if (err) {
          toast?.error('Error al eliminar: ' + (err?.message || 'Intenta de nuevo.'));
          setDeleteDialog({ open: false, isBulk: false, targetId: null });
          return;
        }
        setProducts(prev => prev?.filter(p => p?.id !== id));
        toast?.success('Producto eliminado.');
      }
      setDeleteDialog({ open: false, isBulk: false, targetId: null });
    } finally {
      setDeleting(false);
    }
  }, [deleteDialog, selectedIds, toast]);

  const handleCancelDelete = useCallback(() => { setDeleteDialog({ open: false, isBulk: false, targetId: null }); }, []);

  const AddProductButton = ({ className = '' }) => (
    <button
      type="button"
      onClick={() => navigate('/product-editor')}
      className={`flex items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(15,23,42,0.16)] transition-colors duration-150 hover:bg-slate-800 active:scale-[0.99] ${className}`}
      style={{ fontFamily: 'var(--font-caption)' }}
    >
      <Icon name="Plus" size={18} color="#FFFFFF" />
      <span>Agregar {productNoun}</span>
    </button>
  );
  return (
    <DashboardAppShell backgroundColor="var(--color-background)">
        <PanelHeader
          title={<h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>Catálogo</h1>}
          subtitle={<p className="text-xs hidden sm:block" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{loading ? 'Cargando...' : `${stats?.total} ${productNounPlural} · ${stats?.available} disponibles · ${stats?.soldOut} agotados · ${stats?.hidden} ocultos`}</p>}
        >
          <div className="hidden 2xl:flex items-center gap-2 flex-shrink-0">
            <AddProductButton className="px-4 py-2.5" />
          </div>
        </PanelHeader>

        <DashboardLayoutContent className="page-enter">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg border scale-in" style={{ backgroundColor: 'rgba(239,68,68,0.05)', borderColor: 'rgba(239,68,68,0.2)' }}>
              <Icon name="AlertCircle" size={16} color="var(--color-error)" />
              <span className="text-sm" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>{error}</span>
              <button onClick={loadProducts} className="ml-auto text-xs font-semibold underline transition-opacity hover:opacity-70" style={{ color: 'var(--color-error)' }}>Reintentar</button>
            </div>
          )}
          {loading ? (
            <PremiumLoader business={business} context="products" />
          ) : (
            <>
              <section className="mb-2">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-3xl">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 font-[family-name:var(--font-caption)]">
                      Merchandising
                    </p>
                    <h2 className="text-[2rem] font-black leading-[1.05] text-slate-950 sm:text-5xl" style={{ fontFamily: 'var(--font-heading)', letterSpacing: 0 }}>
                      {screenTitle}
                    </h2>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base" style={{ fontFamily: 'var(--font-body)' }}>
                      {screenSubtitle}
                    </p>
                  </div>
                  <div className="hidden shrink-0 md:block 2xl:hidden">
                    <AddProductButton className="px-4 py-2.5" />
                  </div>
                </div>
              </section>

              <ProductStatsBar stats={stats} productNounPlural={productNounPlural} />

              <div className="rounded-2xl border border-white/70 bg-white/58 p-3 shadow-[0_10px_28px_rgba(17,24,39,0.04)] sm:p-4">
                <ProductFilters
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  statusFilter={statusFilter}
                  onStatusChange={setStatusFilter}
                  resultsCount={filteredProducts?.length ?? 0}
                  onClearFilters={() => {
                    setSearchQuery("");
                    setStatusFilter("all");
                  }}
                />
              </div>
              <div className="flex w-full md:hidden">
                <AddProductButton className="w-full px-4 py-3" />
              </div>
              {selectedIds?.length > 0 && (<div><BulkActionBar selectedCount={selectedIds?.length} onDelete={handleBulkDelete} onDeselect={() => setSelectedIds([])} /></div>)}
              <ProductTable products={filteredProducts} selectedIds={selectedIds} onSelectAll={handleSelectAll} onSelectOne={handleSelectOne} onChangeStatus={handleChangeStatus} onEdit={handleEdit} onDuplicate={handleDuplicate} onDeleteRequest={handleDeleteRequest} sortField={sortField} sortDir={sortDir} onSort={handleSort} formatPrice={formatProductPrice} hasProducts={products?.length > 0} emptyTitle={emptyTitle} emptyDescription={emptyDescription} filteredEmptyDescription="No encontramos ítems con estos filtros. Ajusta la búsqueda o vuelve a ver todo el catálogo." />
            </>
          )}
        </DashboardLayoutContent>
      
      {deleteDialog?.open && (
        <DeleteConfirmDialog
          isOpen={deleteDialog?.open}
          isBulk={deleteDialog?.isBulk}
          count={selectedIds?.length}
          productName={products?.find(p => p?.id === deleteDialog?.targetId)?.name}
          isDeleting={deleting}
          onConfirm={handleConfirmDelete}
          onCancel={handleCancelDelete}
        />
      )}
    </DashboardAppShell>
  );
}
