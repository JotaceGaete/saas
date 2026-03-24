import React, { useState } from 'react';
import Image from 'components/AppImage';
import Icon from 'components/AppIcon';
import { deleteProduct } from '../../../services/waBusinessService';
import { formatCurrency } from 'utils/formatCLP';

function ProductRow({ product, onEdit, onDelete, currency, locale }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className="group flex items-center gap-3 px-4 py-3 rounded-xl border bg-white transition-all hover:shadow-sm"
      style={{ borderColor: 'var(--color-border)' }}
    >
      {/* Drag handle */}
      <div
        className="flex-shrink-0 opacity-0 group-hover:opacity-40 transition-opacity cursor-grab"
        aria-hidden="true"
      >
        <Icon name="GripVertical" size={16} color="var(--color-muted-foreground)" />
      </div>

      {/* Thumbnail */}
      <div
        className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 border"
        style={{ borderColor: 'var(--color-border)', backgroundColor: '#f0f0f5' }}
      >
        {product?.imageUrl || product?.image ? (
          <Image
            src={product?.imageUrl || product?.image}
            alt={`Imagen de ${product?.name}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Icon name="ImageOff" size={18} color="#c0c0d0" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-semibold text-foreground truncate"
          style={{ fontFamily: 'var(--font-caption)' }}
        >
          {product?.name}
        </p>
        <p
          className="text-sm font-medium"
          style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-data)' }}
        >
          {formatCurrency(product?.price, currency, locale)}
        </p>
      </div>

      {/* Status badge */}
      {!product?.isActive && (
        <span
          className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium"
          style={{
            backgroundColor: '#fef3c7',
            color: '#92400e',
            fontFamily: 'var(--font-caption)',
          }}
        >
          Inactivo
        </span>
      )}

      {/* Menu */}
      <div className="relative flex-shrink-0">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
          aria-label="Opciones del producto"
        >
          <Icon name="MoreVertical" size={16} color="var(--color-muted-foreground)" />
        </button>
        {menuOpen && (
          <div
            className="absolute right-0 top-9 z-20 w-36 rounded-xl border bg-white shadow-lg py-1"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <button
              onClick={() => { setMenuOpen(false); onEdit(product?.id); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
              style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}
            >
              <Icon name="Pencil" size={14} color="var(--color-muted-foreground)" />
              Editar
            </button>
            <button
              onClick={() => { setMenuOpen(false); onDelete(product?.id); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-red-50 transition-colors"
              style={{ fontFamily: 'var(--font-caption)', color: '#ef4444' }}
            >
              <Icon name="Trash2" size={14} color="#ef4444" />
              Eliminar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProductListPanel({ products, loading, onAddProduct, onEditProduct, onReload, currency = 'USD', locale = 'en-US' }) {
  const cur = String(currency || 'USD').trim().toUpperCase();
  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este producto?')) return;
    await deleteProduct(id);
    onReload();
  };

  return (
    <div className="space-y-3">
      {/* Product rows */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3]?.map((i) => (
            <div
              key={i}
              className="h-[72px] rounded-xl border bg-white animate-pulse"
              style={{ borderColor: 'var(--color-border)' }}
            />
          ))}
        </div>
      ) : products?.length === 0 ? (
        <div
          className="rounded-xl border bg-white px-6 py-10 text-center"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{ backgroundColor: '#f0f0f8' }}
          >
            <Icon name="Package" size={22} color="#a0a0c0" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1" style={{ fontFamily: 'var(--font-caption)' }}>
            Sin productos aún
          </p>
          <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            Agrega tu primer producto para empezar
          </p>
        </div>
      ) : (
        products?.map((product) => (
          <ProductRow
            key={product?.id}
            product={product}
            onEdit={onEditProduct}
            onDelete={handleDelete}
            currency={cur}
            locale={locale}
          />
        ))
      )}
      {/* Add Product CTA */}
      <button
        onClick={onAddProduct}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90 active:scale-[0.99] mt-2"
        style={{
          background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
          fontFamily: 'var(--font-caption)',
          boxShadow: '0 4px 14px rgba(124,58,237,0.35)',
        }}
      >
        <Icon name="Plus" size={18} color="#fff" />
        Agregar Producto
      </button>
      {/* Add Section link */}
      <div className="text-center pt-1">
        <button
          className="text-sm font-medium transition-colors hover:opacity-70"
          style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
          onClick={() => {}}
        >
          Agregar Sección
        </button>
      </div>
    </div>
  );
}
