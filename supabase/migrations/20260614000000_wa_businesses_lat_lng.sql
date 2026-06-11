-- Coordenadas del negocio para el mapa de ubicación (LocationPicker en
-- /business-configuration) y el link "Cómo llegar" del catálogo público,
-- que ya prefiere lat/lng sobre la dirección textual (buildMapsSearchUrl).
-- Idempotente: segura aunque las columnas existan por una aplicación previa.

ALTER TABLE public.wa_businesses
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
