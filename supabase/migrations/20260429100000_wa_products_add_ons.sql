-- Add add_ons column to wa_products
-- Idempotent: uses IF NOT EXISTS.
-- Structure: [{ "id": "str", "label": "str", "price": 0, "emoji": "🍟", "active": true }]

ALTER TABLE public.wa_products
  ADD COLUMN IF NOT EXISTS add_ons jsonb NOT NULL DEFAULT '[]'::jsonb;
