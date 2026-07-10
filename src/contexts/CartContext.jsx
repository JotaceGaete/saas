import React, { createContext, useContext, useState, useCallback } from 'react';
import { computeCartTotal, hasHiddenPriceItems as computeHasHiddenPriceItems } from '../lib/cartPricing';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);

  const addItem = useCallback((product) => {
    setItems(prev => {
      const existing = prev?.find(i => i?.id === product?.id);
      if (existing) {
        return prev?.map(i => i?.id === product?.id ? { ...i, quantity: i?.quantity + 1 } : i);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  }, []);

  const removeItem = useCallback((productId) => {
    setItems(prev => prev?.filter(i => i?.id !== productId));
  }, []);

  const updateQuantity = useCallback((productId, quantity) => {
    if (quantity <= 0) {
      setItems(prev => prev?.filter(i => i?.id !== productId));
    } else {
      setItems(prev => prev?.map(i => i?.id === productId ? { ...i, quantity } : i));
    }
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const total = computeCartTotal(items);
  const hasHiddenPriceItems = computeHasHiddenPriceItems(items);
  const itemCount = items?.reduce((sum, i) => sum + i?.quantity, 0);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQuantity, clearCart, total, hasHiddenPriceItems, itemCount }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}

export default CartContext;
