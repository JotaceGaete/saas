import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import PanelHeader from "components/ui/PanelHeader";
import DashboardAppShell from "components/ui/DashboardAppShell";
import DashboardLayoutContent from "components/ui/DashboardLayoutContent";
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
  const [categoryFilter, setCategoryFilter] = useState("all");
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
    active: p?.isActive, image: p?.imageUrl || '', imageAlt: p?.name,
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
    if (statusFilter !== "all") result = result?.filter(p => statusFilter === "active" ? p?.active : !p?.active);
    result?.sort((a, b) => {
      let aVal = a?.name?.toLowerCase(), bVal = b?.name?.toLowerCase();
      if (sortField === "price") { aVal = a?.price; bVal = b?.price; }
      else if (sortField === "status") { aVal = a?.active ? 1 : 0; bVal = b?.active ? 1 : 0; }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return result;
  }, [tableProducts, searchQuery, statusFilter, sortField, sortDir]);

  const stats = useMemo(() => ({
    total: products?.length,
    active: products?.filter(p => p?.isActive)?.length,
    inactive: products?.filter(p => !p?.isActive)?.length,
  }), [products]);

  const handleSort = useCallback((field) => {
    setSortField(prev => { if (prev === field) { setSortDir(d => d === "asc" ? "desc" : "asc"); return field; } setSortDir("asc"); return field; });
  }, []);

  const handleSelectAll = useCallback((checked) => { setSelectedIds(checked ? filteredProducts?.map(p => p?.id) : []); }, [filteredProducts]);
  const handleSelectOne = useCallback((id, checked) => { setSelectedIds(prev => checked ? [...prev, id] : prev?.filter(x => x !== id)); }, []);

  const handleToggleStatus = useCallback(async (id) => {
    const product = products?.find(p => p?.id === id);
    if (!product) return;
    const activating = !product?.isActive;
    if (activating) {
      guard.runIfConfirmed(async () => {
        const { error: err } = await updateProduct(id, { isActive: true });
        if (err) {
          toast?.error(err?.message || 'No se pudo actualizar.');
          return;
        }
        setProducts(prev => prev?.map(p => p?.id === id ? { ...p, isActive: true } : p));
      });
      return;
    }
    const { error: err } = await updateProduct(id, { isActive: false });
    if (err) {
      toast?.error(err?.message || 'No se pudo actualizar.');
      return;
    }
    setProducts(prev => prev?.map(p => p?.id === id ? { ...p, isActive: false } : p));
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
  return (
    <DashboardAppShell backgroundColor="var(--color-background)">
        <PanelHeader
          title={<h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>Gestión de Productos</h1>}
          subtitle={<p className="text-xs hidden sm:block" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{loading ? 'Cargando...' : `${stats?.total} productos · ${stats?.active} activos · ${stats?.inactive} inactivos`}</p>}
        >
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => navigate("/product-editor")} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all duration-150 hover:bg-[#6D28D9] active:scale-[0.98]" style={{ backgroundColor: 'var(--color-primary)', fontFamily: 'var(--font-caption)', boxShadow: 'var(--shadow-violet)' }}>
              <Icon name="Plus" size={15} color="#FFFFFF" />
              <span className="hidden sm:inline">Agregar producto</span>
              <span className="sm:hidden">Agregar</span>
            </button>
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
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
                <p className="text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Cargando productos...</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <ProductStatsBar stats={stats} />
                <button
                  type="button"
                  onClick={() => navigate('/product-editor')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-[0.98]"
                  style={{ backgroundColor: 'var(--color-primary)', fontFamily: 'var(--font-caption)', boxShadow: '0 4px 14px rgba(124,58,237,0.35)' }}
                >
                  <Icon name="Plus" size={18} color="#FFFFFF" />
                  Agregar producto
                </button>
              </div>
              <div>
                <ProductFilters searchQuery={searchQuery} onSearchChange={setSearchQuery} statusFilter={statusFilter} onStatusChange={setStatusFilter} categoryFilter={categoryFilter} onCategoryChange={setCategoryFilter} />
              </div>
              {selectedIds?.length > 0 && (<div><BulkActionBar selectedCount={selectedIds?.length} onDelete={handleBulkDelete} onDeselect={() => setSelectedIds([])} /></div>)}
              <ProductTable products={filteredProducts} selectedIds={selectedIds} onSelectAll={handleSelectAll} onSelectOne={handleSelectOne} onToggleStatus={handleToggleStatus} onEdit={handleEdit} onDuplicate={handleDuplicate} onDeleteRequest={handleDeleteRequest} sortField={sortField} sortDir={sortDir} onSort={handleSort} />
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