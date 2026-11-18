/** Precedencia de imagen de producto (Storefront v1.2 §6). */
export function pickProductImage(row) {
  const first = [row.card_image_url, row.thumbnail_url, row.image_url].find(
    (v) => typeof v === 'string' && v.trim().length > 0,
  );
  if (first) return first;
  if (Array.isArray(row.images)) {
    const head = row.images[0];
    if (typeof head === 'string' && head.trim().length > 0) return head;
  }
  return null;
}
