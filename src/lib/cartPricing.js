/**
 * Total del carrito apto para mostrar al cliente: excluye los productos marcados
 * "Consultar precio" (showPrice=false), cuyo precio es de uso interno del negocio
 * y no debe sumarse a un monto visible en la UI ni en el mensaje de WhatsApp.
 */
export function computeCartTotal(items) {
  return items?.reduce((sum, item) => (
    item?.showPrice === false ? sum : sum + item?.price * item?.quantity
  ), 0) ?? 0;
}

/** true si el carrito tiene al menos un producto con precio oculto al cliente. */
export function hasHiddenPriceItems(items) {
  return items?.some((item) => item?.showPrice === false) ?? false;
}
