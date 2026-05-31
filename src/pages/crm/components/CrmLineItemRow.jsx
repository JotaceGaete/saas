import React, { useState } from 'react';
import Icon from 'components/AppIcon';

export function calcItemSubtotal(unitPrice, quantity, discountPct) {
  const base = (unitPrice || 0) * (quantity || 1);
  return +(base - (base * (discountPct || 0)) / 100).toFixed(2);
}

export const EMPTY_ITEM = {
  product_id: null,
  name: '',
  description: '',
  unit_price: 0,
  quantity: 1,
  discount_pct: 0,
  subtotal: 0,
};

export function fmtCLP(n) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(n || 0);
}

// ─── Vista de solo lectura (facturas ya guardadas) ──────────────────────────
export function CrmLineItemReadOnly({ item, imageUrl }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-gray-100 last:border-0 gap-3">
      <div className="flex items-start gap-3 min-w-0">
        <div className="rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center w-10 h-10">
          {imageUrl
            ? <img src={imageUrl} alt={item.name} className="w-full h-full object-cover" />
            : <Icon name="Package" size={16} color="#9ca3af" />
          }
        </div>
        <div className="min-w-0">
          <p className="text-sm text-gray-900 font-medium">{item.name}</p>
          {item.description && <p className="text-xs text-gray-500">{item.description}</p>}
          <p className="text-xs text-gray-400 mt-0.5">
            {item.quantity} × {fmtCLP(item.unit_price)}
            {item.discount_pct > 0 ? ` (−${item.discount_pct}%)` : ''}
          </p>
        </div>
      </div>
      <p className="text-sm font-semibold text-gray-900 ml-4 shrink-0">{fmtCLP(item.subtotal)}</p>
    </div>
  );
}

// ─── Fila de tabla — desktop ────────────────────────────────────────────────
export function CrmLineItemTableRow({ item, idx, onChange, onRemove, imageUrl }) {
  const set = (key, val) => {
    const next = { ...item, [key]: val };
    next.subtotal = calcItemSubtotal(+next.unit_price, +next.quantity, +next.discount_pct);
    onChange(idx, next);
  };

  const discountAmount = (item.unit_price * item.quantity * item.discount_pct) / 100;

  return (
    <tr className="border-b border-gray-100 last:border-0 group hover:bg-gray-50/40 transition-colors">
      {/* Producto / Descripción */}
      <td className="py-2 pl-0 pr-3 align-top">
        <div className="flex items-start gap-3">
          <div className="rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center w-10 h-10">
            {imageUrl
              ? <img src={imageUrl} alt={item.name} className="w-full h-full object-cover" />
              : <Icon name="Package" size={16} color="#9ca3af" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={item.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Nombre del producto o servicio..."
              className="w-full text-sm font-medium text-gray-900 placeholder-gray-300 bg-transparent border-0 border-b border-transparent hover:border-gray-200 focus:border-blue-400 focus:outline-none py-0.5 transition-colors"
            />
            <input
              type="text"
              value={item.description || ''}
              onChange={e => set('description', e.target.value)}
              placeholder="Descripción..."
              className="w-full text-xs text-gray-400 placeholder-gray-300 bg-transparent border-0 border-b border-transparent hover:border-gray-200 focus:border-blue-300 focus:outline-none py-0.5 mt-0.5 transition-colors"
            />
          </div>
        </div>
      </td>

      {/* Cantidad */}
      <td className="py-2 px-2 align-top w-20">
        <input
          type="number"
          min="1"
          value={item.quantity}
          onChange={e => set('quantity', Math.max(1, +e.target.value))}
          className="w-full text-center text-sm text-gray-900 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-white"
        />
      </td>

      {/* Precio unitario */}
      <td className="py-2 px-2 align-top w-32">
        <div className="flex items-center border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus-within:border-blue-400">
          <span className="text-xs text-gray-400 mr-1 select-none shrink-0">$</span>
          <input
            type="number"
            min="0"
            step="1"
            value={item.unit_price}
            onChange={e => set('unit_price', +e.target.value)}
            className="w-full text-sm text-gray-900 border-0 focus:outline-none bg-transparent min-w-0"
          />
        </div>
      </td>

      {/* Descuento % */}
      <td className="py-2 px-2 align-top w-20">
        <div className="flex items-center border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus-within:border-blue-400">
          <input
            type="number"
            min="0"
            max="100"
            step="0.5"
            value={item.discount_pct}
            onChange={e => set('discount_pct', Math.min(100, Math.max(0, +e.target.value)))}
            className="w-full text-sm text-center text-gray-900 border-0 focus:outline-none bg-transparent"
          />
          <span className="text-xs text-gray-400 ml-1 select-none shrink-0">%</span>
        </div>
      </td>

      {/* Total */}
      <td className="py-2 px-2 align-top w-28 text-right">
        <p className="text-sm font-semibold text-gray-900 pt-1">{fmtCLP(item.subtotal)}</p>
        {discountAmount > 0 && (
          <p className="text-xs text-green-600">−{fmtCLP(discountAmount)}</p>
        )}
      </td>

      {/* Eliminar */}
      <td className="py-2 pl-2 pr-0 align-top w-8">
        <button
          type="button"
          onClick={() => onRemove(idx)}
          className="mt-1 text-gray-300 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
          title="Eliminar"
        >
          <Icon name="X" size={13} />
        </button>
      </td>
    </tr>
  );
}

// ─── Card — mobile ──────────────────────────────────────────────────────────
export function CrmLineItemCard({ item, idx, onChange, onRemove, imageUrl }) {
  const [showDiscount, setShowDiscount] = useState(item.discount_pct > 0);

  const set = (key, val) => {
    const next = { ...item, [key]: val };
    next.subtotal = calcItemSubtotal(+next.unit_price, +next.quantity, +next.discount_pct);
    onChange(idx, next);
  };

  const isCatalog = !!item.product_id;
  const discountAmount = (item.unit_price * item.quantity * item.discount_pct) / 100;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      {/* Thumbnail + nombre + eliminar */}
      <div className="flex items-start gap-3 mb-3">
        <div className="rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center w-12 h-12">
          {imageUrl
            ? <img src={imageUrl} alt={item.name} className="w-full h-full object-cover" />
            : <Icon name="Package" size={18} color="#9ca3af" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={item.name}
            onChange={e => set('name', e.target.value)}
            placeholder="Nombre del producto o servicio..."
            className="w-full text-sm font-semibold text-gray-900 placeholder-gray-300 bg-transparent border-0 border-b border-transparent hover:border-gray-200 focus:border-blue-400 focus:outline-none py-0.5 mb-1 transition-colors"
          />
          <input
            type="text"
            value={item.description || ''}
            onChange={e => set('description', e.target.value)}
            placeholder="Descripción opcional..."
            className="w-full text-xs text-gray-500 placeholder-gray-300 bg-transparent border-0 border-b border-transparent hover:border-gray-200 focus:border-blue-400 focus:outline-none py-0.5 transition-colors"
          />
        </div>
        <button
          type="button"
          onClick={() => onRemove(idx)}
          className="text-gray-300 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors -mr-1 flex-shrink-0"
          title="Eliminar ítem"
        >
          <Icon name="X" size={14} />
        </button>
      </div>

      {/* Cant. × Precio = Subtotal */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Cantidad con +/- */}
        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
          <button
            type="button"
            onClick={() => set('quantity', Math.max(1, (item.quantity || 1) - 1))}
            className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-50 text-base font-medium transition-colors select-none"
          >−</button>
          <span className="w-8 text-center text-sm font-medium text-gray-900 select-none">
            {item.quantity}
          </span>
          <button
            type="button"
            onClick={() => set('quantity', (item.quantity || 1) + 1)}
            className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-50 text-base font-medium transition-colors select-none"
          >+</button>
        </div>

        <span className="text-xs text-gray-400">×</span>

        {/* Precio unitario */}
        <div className="flex items-center border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus-within:border-blue-400">
          <span className="text-xs text-gray-400 mr-1 select-none">$</span>
          <input
            type="number"
            min="0"
            step="1"
            value={item.unit_price}
            onChange={e => set('unit_price', +e.target.value)}
            className="w-24 text-sm text-gray-900 border-0 focus:outline-none bg-transparent"
          />
        </div>

        {/* Subtotal */}
        <div className="ml-auto text-right">
          <span className="text-sm font-bold text-gray-900">{fmtCLP(item.subtotal)}</span>
        </div>
      </div>

      {/* Descuento */}
      <div className="mt-2.5">
        {!showDiscount ? (
          <button
            type="button"
            onClick={() => setShowDiscount(true)}
            className="text-xs text-gray-400 hover:text-blue-500 transition-colors"
          >
            + Aplicar descuento
          </button>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500">Descuento</span>
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={item.discount_pct}
              onChange={e => set('discount_pct', Math.min(100, Math.max(0, +e.target.value)))}
              className="w-14 border border-gray-200 rounded-lg px-2 py-0.5 text-xs text-center focus:outline-none focus:border-blue-400"
            />
            <span className="text-xs text-gray-500">%</span>
            {discountAmount > 0 && (
              <span className="text-xs text-green-600 font-medium">−{fmtCLP(discountAmount)}</span>
            )}
            <button
              type="button"
              onClick={() => { set('discount_pct', 0); setShowDiscount(false); }}
              className="ml-auto text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Quitar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
