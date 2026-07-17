export function isCatalogDocumentItem(item) {
  return Boolean(
    item?.product_id
    || item?.origin === 'catalog'
    || item?.source === 'catalog'
    || item?.item_type === 'catalog',
  );
}

export function getDocumentItemDetail(item) {
  if (!item || isCatalogDocumentItem(item)) return null;
  const detail = typeof item.description === 'string' ? item.description.trim() : '';
  return detail || null;
}
