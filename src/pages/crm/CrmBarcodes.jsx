import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import JsBarcode from 'jsbarcode';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import CrmBreadcrumb from 'components/ui/CrmBreadcrumb';
import Icon from 'components/AppIcon';
import { formatMoney } from 'utils/formatMoney';
import { useAuth } from '../../contexts/AuthContext';
import {
  getCrmStockProducts,
  generateUniqueBarcode,
  saveProductBarcode,
} from '../../services/crmService';

const fmt = (n) => formatMoney(n, 'CLP');

// ─── Barcode SVG ──────────────────────────────────────────────────────────────

function BarcodeSvg({ value, height = 32 }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: 'EAN13',
        width: 1.2,
        height,
        displayValue: false,
        margin: 0,
      });
    } catch {
      // invalid barcode value — leave empty
    }
  }, [value, height]);

  if (!value) return null;
  return <svg ref={ref} className="w-full" />;
}

// ─── Etiqueta individual ──────────────────────────────────────────────────────

function BarcodeLabel({ product }) {
  const shortName = (product.name || '').slice(0, 28);
  return (
    <div
      className="barcode-label flex flex-col items-center justify-between px-1 py-0.5"
      style={{
        width: '30mm',
        height: '20mm',
        overflow: 'hidden',
        border: '0.2mm dashed #bbb',
        pageBreakInside: 'avoid',
        boxSizing: 'border-box',
        fontFamily: 'monospace',
      }}
    >
      <p style={{ fontSize: '5px', fontWeight: 700, textAlign: 'center', lineHeight: 1.2, maxWidth: '100%', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        {shortName}
      </p>
      <div style={{ width: '100%', flex: 1, display: 'flex', alignItems: 'center' }}>
        <BarcodeSvg value={product.barcode} height={22} />
      </div>
      <div style={{ textAlign: 'center', fontSize: '4.5px', lineHeight: 1.2 }}>
        <div style={{ letterSpacing: '0.5px' }}>{product.barcode}</div>
        {product.price != null && <div style={{ fontWeight: 700 }}>{fmt(product.price)}</div>}
      </div>
    </div>
  );
}

// ─── Fila de selección de producto ───────────────────────────────────────────

function ProductRow({ item, onQtyChange, onRemove, onGenerateBarcode }) {
  const hasBarcode = !!item.barcode;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
      {item.thumbnail_url ? (
        <img src={item.thumbnail_url} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
      ) : (
        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
          <Icon name="Package" size={14} className="text-gray-400" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {hasBarcode ? (
            <span className="text-xs font-mono text-gray-500">{item.barcode}</span>
          ) : (
            <button
              onClick={() => onGenerateBarcode(item)}
              className="text-xs text-amber-600 hover:text-amber-700 flex items-center gap-1 font-semibold"
            >
              <Icon name="Wand2" size={11} />
              Generar código
            </button>
          )}
          {item.sku && <span className="text-xs text-gray-400">SKU: {item.sku}</span>}
          {item.price != null && <span className="text-xs text-gray-400">{fmt(item.price)}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <label className="text-xs text-gray-500">Etiquetas:</label>
        <input
          type="number"
          min="1"
          max="200"
          value={item.qty}
          onChange={e => onQtyChange(item.id, Math.max(1, Math.min(200, parseInt(e.target.value) || 1)))}
          className="w-14 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button onClick={() => onRemove(item.id)} className="text-gray-300 hover:text-red-500 p-1">
          <Icon name="X" size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Búsqueda de productos ────────────────────────────────────────────────────

function ProductSearch({ products, selectedIds, onAdd }) {
  const [query, setQuery] = useState('');
  const [open, setOpen]   = useState(false);
  const ref               = useRef(null);

  const results = query.trim().length > 0
    ? products
        .filter(p => {
          const q = query.toLowerCase();
          return (
            p.name?.toLowerCase().includes(q) ||
            (p.public_code && p.public_code.toLowerCase().includes(q)) ||
            (p.sku         && p.sku.toLowerCase().includes(q)) ||
            (p.barcode     && p.barcode.toLowerCase().includes(q))
          );
        })
        .filter(p => !selectedIds.has(p.id))
        .slice(0, 8)
    : [];

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const pick = (p) => { onAdd(p); setQuery(''); setOpen(false); };

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Icon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar por nombre, SKU, código o barcode…"
          className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-30 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          {results.map(p => (
            <button key={p.id} onClick={() => pick(p)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left border-b border-gray-50 last:border-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                <p className="text-xs text-gray-400">
                  {p.barcode ? `🔲 ${p.barcode}` : '⚠ Sin código'}{p.sku ? ` · SKU: ${p.sku}` : ''}
                </p>
              </div>
              <Icon name="Plus" size={14} className="text-blue-500 shrink-0" />
            </button>
          ))}
        </div>
      )}
      {open && query.trim() && results.length === 0 && (
        <div className="absolute z-30 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl px-4 py-4 text-sm text-gray-400 text-center">
          Sin resultados
        </div>
      )}
    </div>
  );
}

// ─── Vista previa de impresión ────────────────────────────────────────────────

function PrintPreview({ items }) {
  const labels = items.flatMap(item =>
    Array.from({ length: item.qty }, (_, i) => ({ ...item, _labelKey: `${item.id}-${i}` }))
  );

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 30mm)',
        gap: '2mm',
        padding: '0',
        width: 'fit-content',
        margin: '0 auto',
      }}
    >
      {labels.map(item => (
        <BarcodeLabel key={item._labelKey} product={item} />
      ))}
    </div>
  );
}

// ─── CSS de impresión ─────────────────────────────────────────────────────────

const PRINT_STYLE = `
@media print {
  body > * { display: none !important; }
  #barcode-print-root { display: block !important; }
  @page { size: A4; margin: 10mm; }
}
#barcode-print-root {
  display: none;
}
`;

// ─── Página principal ─────────────────────────────────────────────────────────

export default function CrmBarcodes() {
  const { business }           = useAuth();
  const [searchParams]         = useSearchParams();
  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading]  = useState(true);
  const [items, setItems]      = useState([]); // { ...product, qty }
  const [showPreview, setShowPreview] = useState(false);
  const [generating, setGenerating]  = useState(null); // product id being generated
  const printRef = useRef(null);

  // Inject print CSS once
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = PRINT_STYLE;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const { data } = await getCrmStockProducts(business.id);
    const products = data || [];
    setAllProducts(products);

    // Pre-load product from URL param
    const preloadId = searchParams.get('product');
    if (preloadId) {
      const p = products.find(x => x.id === preloadId);
      if (p && !items.find(i => i.id === p.id)) {
        setItems([{ ...p, qty: 1 }]);
      }
    }
    setLoading(false);
  }, [business?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const handleAdd = (p) => {
    setItems(prev => prev.find(i => i.id === p.id) ? prev : [...prev, { ...p, qty: 1 }]);
  };

  const handleRemove = (id) => setItems(prev => prev.filter(i => i.id !== id));

  const handleQty = (id, qty) => setItems(prev => prev.map(i => i.id === id ? { ...i, qty } : i));

  const handleGenerateBarcode = async (product) => {
    if (!business?.id) return;
    setGenerating(product.id);
    const { barcode, error } = await generateUniqueBarcode(business.id);
    if (error) { alert(error); setGenerating(null); return; }
    await saveProductBarcode(product.id, barcode);
    // Update both allProducts and items
    setAllProducts(prev => prev.map(p => p.id === product.id ? { ...p, barcode } : p));
    setItems(prev => prev.map(i => i.id === product.id ? { ...i, barcode } : i));
    setGenerating(null);
  };

  const handlePrint = () => {
    const printRoot = document.getElementById('barcode-print-root');
    if (!printRoot || !printRef.current) return;
    printRoot.innerHTML = '';
    printRoot.appendChild(printRef.current.cloneNode(true));
    window.print();
  };

  const selectedIds     = new Set(items.map(i => i.id));
  const totalLabels     = items.reduce((s, i) => s + i.qty, 0);
  const hasMissingCodes = items.some(i => !i.barcode);
  const canPrint        = items.length > 0 && !hasMissingCodes;

  return (
    <DashboardAppShell>
      {/* Print root — hidden, populated on print */}
      <div id="barcode-print-root" aria-hidden="true" />

      <PanelHeader
        title={
          <>
            <CrmBreadcrumb section="Etiquetas" />
            <h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>
              Imprimir etiquetas
            </h1>
          </>
        }
        subtitle={
          <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
            Etiquetas 30×20mm · hoja A4
          </p>
        }
      >
        <div className="flex gap-2">
          <button
            onClick={() => setShowPreview(v => !v)}
            disabled={items.length === 0}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            <Icon name={showPreview ? 'EyeOff' : 'Eye'} size={15} />
            {showPreview ? 'Ocultar vista previa' : 'Vista previa'}
          </button>
          <button
            onClick={handlePrint}
            disabled={!canPrint}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-40"
          >
            <Icon name="Printer" size={15} />
            Imprimir ({totalLabels})
          </button>
        </div>
      </PanelHeader>

      <DashboardLayoutContent>
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-5 max-w-3xl mx-auto">

            {/* Buscador */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
              <p className="text-sm font-bold text-gray-800">Agregar producto</p>
              <ProductSearch products={allProducts} selectedIds={selectedIds} onAdd={handleAdd} />
            </div>

            {/* Lista seleccionada */}
            {items.length > 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <p className="text-sm font-bold text-gray-800">
                    Productos ({items.length}) · {totalLabels} etiquetas
                  </p>
                  {hasMissingCodes && (
                    <span className="text-xs text-amber-600 flex items-center gap-1">
                      <Icon name="AlertTriangle" size={12} />
                      Algunos productos no tienen código de barras
                    </span>
                  )}
                </div>
                <div className="px-4">
                  {items.map(item => (
                    <ProductRow
                      key={item.id}
                      item={item}
                      onQtyChange={handleQty}
                      onRemove={handleRemove}
                      onGenerateBarcode={handleGenerateBarcode}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-16 text-gray-400">
                <Icon name="Tag" size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Usa el buscador para agregar productos</p>
              </div>
            )}

            {/* Vista previa */}
            {showPreview && items.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-bold text-gray-800">Vista previa</p>
                  <p className="text-xs text-gray-400 mt-0.5">Tamaño real aproximado en pantalla puede variar según zoom del navegador</p>
                </div>
                <div className="p-4 overflow-auto">
                  <div ref={printRef}>
                    <PrintPreview items={items.filter(i => i.barcode)} />
                  </div>
                </div>
                {hasMissingCodes && (
                  <div className="px-4 pb-4">
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Los productos sin código de barras no aparecen en la vista previa ni se imprimirán.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Info */}
            <div className="text-xs text-gray-400 text-center space-y-1 pb-4">
              <p>Etiquetas de 30×20mm · 6 columnas · 13 filas · hasta 78 etiquetas por hoja A4</p>
              <p>Los códigos internos generados (prefijo 20) son de uso exclusivo del negocio. No reemplazan códigos GS1 oficiales.</p>
            </div>
          </div>
        )}
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
