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
  getProductsForBarcodes,
  generateUniqueBarcode,
  saveProductBarcode,
} from '../../services/crmService';

const fmt = (n, currency) => formatMoney(n, currency || 'CLP');

// ─── Configuración de tamaños ─────────────────────────────────────────────────

const LABEL_SIZES = {
  S: {
    id: 'S',
    label: 'Pequeña',
    dims: '30×20mm',
    use: 'Estanterías pequeñas',
    widthMm: 30,
    heightMm: 20,
    cols: 6,
    nameFontSize: '5px',
    nameMaxChars: 28,
    codeFontSize: '4px',
    priceFontSize: '9px',
    barcodeHeight: 18,
    barcodeWidth: 1.0,
    paddingX: '1mm',
    paddingY: '0.5mm',
    gapMm: 2,
  },
  M: {
    id: 'M',
    label: 'Mediana',
    dims: '50×30mm',
    use: 'Formato estándar',
    widthMm: 50,
    heightMm: 30,
    cols: 4,
    nameFontSize: '7px',
    nameMaxChars: 36,
    codeFontSize: '5.5px',
    priceFontSize: '14px',
    barcodeHeight: 28,
    barcodeWidth: 1.4,
    paddingX: '1.5mm',
    paddingY: '1mm',
    gapMm: 2,
  },
  L: {
    id: 'L',
    label: 'Grande',
    dims: '70×40mm',
    use: 'Productos de exhibición',
    widthMm: 70,
    heightMm: 40,
    cols: 3,
    nameFontSize: '9px',
    nameMaxChars: 48,
    codeFontSize: '6.5px',
    priceFontSize: '20px',
    barcodeHeight: 38,
    barcodeWidth: 1.6,
    paddingX: '2mm',
    paddingY: '1.5mm',
    gapMm: 3,
  },
  XL: {
    id: 'XL',
    label: 'XL',
    dims: '100×50mm',
    use: 'Góndolas y cartelería',
    widthMm: 100,
    heightMm: 50,
    cols: 2,
    nameFontSize: '11px',
    nameMaxChars: 60,
    codeFontSize: '8px',
    priceFontSize: '28px',
    barcodeHeight: 52,
    barcodeWidth: 1.8,
    paddingX: '3mm',
    paddingY: '2mm',
    gapMm: 3,
  },
};

// ─── Barcode SVG ──────────────────────────────────────────────────────────────

function BarcodeSvg({ value, height, width }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: 'EAN13',
        width: width || 1.2,
        height: height || 32,
        displayValue: false,
        margin: 0,
      });
    } catch {
      // invalid barcode — leave empty
    }
  }, [value, height, width]);

  if (!value) return null;
  return <svg ref={ref} style={{ width: '100%', display: 'block' }} />;
}

// ─── Etiqueta individual ──────────────────────────────────────────────────────

function BarcodeLabel({ product, size = 'S', currency }) {
  const cfg = LABEL_SIZES[size];
  const name = (product.name || '').slice(0, cfg.nameMaxChars);

  return (
    <div
      className="barcode-label"
      style={{
        width: `${cfg.widthMm}mm`,
        height: `${cfg.heightMm}mm`,
        overflow: 'hidden',
        border: '0.2mm dashed #ccc',
        pageBreakInside: 'avoid',
        boxSizing: 'border-box',
        fontFamily: "'Arial', 'Helvetica', sans-serif",
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: cfg.paddingX,
        paddingRight: cfg.paddingX,
        paddingTop: cfg.paddingY,
        paddingBottom: cfg.paddingY,
        backgroundColor: '#fff',
      }}
    >
      {/* Nombre — arriba, 1 línea */}
      <p style={{
        fontSize: cfg.nameFontSize,
        fontWeight: 700,
        textAlign: 'center',
        lineHeight: 1.2,
        width: '100%',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        color: '#333',
        margin: 0,
        flexShrink: 0,
      }}>
        {name}
      </p>

      {/* Barcode — zona media */}
      <div style={{ width: '100%', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
        <BarcodeSvg value={product.barcode} height={cfg.barcodeHeight} width={cfg.barcodeWidth} />
        <p style={{
          fontSize: cfg.codeFontSize,
          fontFamily: 'monospace',
          letterSpacing: '0.3px',
          color: '#555',
          margin: '0.5mm 0 0',
          textAlign: 'center',
          lineHeight: 1,
        }}>
          {product.barcode}
        </p>
      </div>

      {/* Precio — zona inferior, elemento dominante */}
      {product.price != null && (
        <p style={{
          fontSize: cfg.priceFontSize,
          fontWeight: 900,
          textAlign: 'center',
          lineHeight: 1,
          color: '#000',
          margin: 0,
          flexShrink: 0,
          letterSpacing: '-0.5px',
        }}>
          {fmt(product.price, currency)}
        </p>
      )}
    </div>
  );
}

// ─── Selector de tamaño ───────────────────────────────────────────────────────

function SizeSelector({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Object.values(LABEL_SIZES).map(s => (
        <button
          key={s.id}
          onClick={() => onChange(s.id)}
          className={`flex flex-col items-start px-3 py-2 rounded-xl border text-left transition-all ${
            value === s.id
              ? 'border-blue-500 bg-blue-50 text-blue-700'
              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
          }`}
        >
          <span className="font-bold text-sm">{s.label}</span>
          <span className="text-[10px] opacity-70">{s.dims}</span>
          <span className="text-[10px] opacity-50 mt-0.5">{s.use}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Fila de selección de producto ───────────────────────────────────────────

function ProductRow({ item, onQtyChange, onRemove, onGenerateBarcode, generating }) {
  const hasBarcode = !!item.barcode;
  const isGenerating = generating === item.id;
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
              disabled={isGenerating}
              className="text-xs text-amber-600 hover:text-amber-700 flex items-center gap-1 font-semibold disabled:opacity-50"
            >
              <Icon name={isGenerating ? 'Loader2' : 'Wand2'} size={11} className={isGenerating ? 'animate-spin' : ''} />
              {isGenerating ? 'Generando…' : 'Generar código'}
            </button>
          )}
          {item.sku && <span className="text-xs text-gray-400">SKU: {item.sku}</span>}
          {item.price != null && <span className="text-xs text-gray-400 font-medium">{fmt(item.price)}</span>}
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

  const results = query.trim().length >= 2
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
      {open && query.trim().length >= 2 && results.length === 0 && (
        <div className="absolute z-30 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl px-4 py-4 text-sm text-gray-400 text-center">
          Sin resultados
        </div>
      )}
    </div>
  );
}

// ─── Vista previa de impresión ────────────────────────────────────────────────

function PrintPreview({ items, size, currency }) {
  const cfg = LABEL_SIZES[size];
  const labels = items.flatMap(item =>
    Array.from({ length: item.qty }, (_, i) => ({ ...item, _labelKey: `${item.id}-${i}` }))
  );

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cfg.cols}, ${cfg.widthMm}mm)`,
      gap: `${cfg.gapMm}mm`,
      width: 'fit-content',
      margin: '0 auto',
    }}>
      {labels.map(item => (
        <BarcodeLabel key={item._labelKey} product={item} size={size} currency={currency} />
      ))}
    </div>
  );
}

// ─── CSS de impresión (dinámico según tamaño) ─────────────────────────────────

function buildPrintStyle(size) {
  const cfg = LABEL_SIZES[size];
  return `
@media print {
  body * {
    visibility: hidden !important;
  }
  .barcode-print-area,
  .barcode-print-area * {
    visibility: visible !important;
  }
  .barcode-print-area {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    display: grid !important;
    grid-template-columns: repeat(${cfg.cols}, ${cfg.widthMm}mm) !important;
    gap: ${cfg.gapMm}mm !important;
  }
  @page {
    size: A4;
    margin: 10mm;
  }
}
`;
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function CrmBarcodes() {
  const { business }                    = useAuth();
  const [searchParams]                  = useSearchParams();
  const [allProducts, setAllProducts]   = useState([]);
  const [loading, setLoading]           = useState(true);
  const [items, setItems]               = useState([]);
  const [showPreview, setShowPreview]   = useState(false);
  const [generating, setGenerating]     = useState(null);
  const [labelSize, setLabelSize]       = useState('S');
  const printStyleRef                   = useRef(null);

  // Inject/update print CSS when size changes
  useEffect(() => {
    if (!printStyleRef.current) {
      printStyleRef.current = document.createElement('style');
      document.head.appendChild(printStyleRef.current);
    }
    printStyleRef.current.textContent = buildPrintStyle(labelSize);
    return () => {
      if (printStyleRef.current) {
        document.head.removeChild(printStyleRef.current);
        printStyleRef.current = null;
      }
    };
  }, [labelSize]);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const { data } = await getProductsForBarcodes(business.id);
    const products = data || [];
    setAllProducts(products);

    const preloadId = searchParams.get('product');
    if (preloadId) {
      const p = products.find(x => x.id === preloadId);
      if (p) setItems([{ ...p, qty: 1 }]);
    }
    setLoading(false);
  }, [business?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const handleAdd    = (p)        => setItems(prev => prev.find(i => i.id === p.id) ? prev : [...prev, { ...p, qty: 1 }]);
  const handleRemove = (id)       => setItems(prev => prev.filter(i => i.id !== id));
  const handleQty    = (id, qty)  => setItems(prev => prev.map(i => i.id === id ? { ...i, qty } : i));

  const handleGenerateBarcode = async (product) => {
    if (!business?.id) return;
    setGenerating(product.id);
    const { barcode, error } = await generateUniqueBarcode(business.id);
    if (error) { alert(error); setGenerating(null); return; }
    await saveProductBarcode(product.id, barcode);
    setAllProducts(prev => prev.map(p => p.id === product.id ? { ...p, barcode } : p));
    setItems(prev => prev.map(i => i.id === product.id ? { ...i, barcode } : i));
    setGenerating(null);
  };

  const handlePrint = () => window.print();

  const selectedIds     = new Set(items.map(i => i.id));
  const totalLabels     = items.reduce((s, i) => s + i.qty, 0);
  const hasMissingCodes = items.some(i => !i.barcode);
  const canPrint        = items.length > 0 && !hasMissingCodes;
  const printItems      = items.filter(i => i.barcode);
  const cfg             = LABEL_SIZES[labelSize];

  return (
    <DashboardAppShell>
      {/* Off-screen print area — always rendered so SVGs are pre-computed */}
      <div
        className="barcode-print-area"
        aria-hidden="true"
        style={{ position: 'absolute', left: '-9999px', top: 0, visibility: 'hidden', pointerEvents: 'none' }}
      >
        {printItems.flatMap(item =>
          Array.from({ length: item.qty }, (_, i) => (
            <BarcodeLabel key={`${item.id}-${i}`} product={item} size={labelSize} currency={business?.currency} />
          ))
        )}
      </div>

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
            Etiqueta {cfg.label} · {cfg.dims} · hoja A4
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

            {/* Selector de tamaño */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
              <p className="text-sm font-bold text-gray-800">Tamaño de etiqueta</p>
              <SizeSelector value={labelSize} onChange={setLabelSize} />
            </div>

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
                      Algunos sin código
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
                      generating={generating}
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
            {showPreview && printItems.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-bold text-gray-800">Vista previa — {cfg.label} ({cfg.dims})</p>
                  <p className="text-xs text-gray-400 mt-0.5">El tamaño en pantalla es aproximado; la impresión usa milímetros exactos.</p>
                </div>
                <div className="p-4 overflow-auto">
                  <PrintPreview items={printItems} size={labelSize} currency={business?.currency} />
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
              <p>Formato {cfg.label}: {cfg.dims} · {cfg.cols} columnas por hoja A4</p>
              <p>Los códigos internos (prefijo 20) son de uso exclusivo del negocio. No reemplazan códigos GS1 oficiales.</p>
            </div>

          </div>
        )}
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
