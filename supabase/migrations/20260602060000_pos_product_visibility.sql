-- Add POS-specific visibility and sort order to wa_products.
-- show_in_pos: product appears in the TPV quick-access grid.
-- pos_sort_order: controls position in the grid (lower = higher).
-- Default false so existing products don't flood the POS grid.

ALTER TABLE wa_products
  ADD COLUMN IF NOT EXISTS show_in_pos    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pos_sort_order INTEGER NOT NULL DEFAULT 0;

-- Index for fast POS grid queries (only fetches show_in_pos=true rows)
CREATE INDEX IF NOT EXISTS idx_wa_products_pos
  ON wa_products (business_id, show_in_pos, pos_sort_order, name)
  WHERE show_in_pos = true AND is_active = true;
