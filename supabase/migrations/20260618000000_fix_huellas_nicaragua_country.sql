-- Corrige el país del negocio "Huellas Nicaragua" (slug: huellas-beauty-de3b3).
-- Era Costa Rica (CR / CRC), debe ser Nicaragua (NI / NIO).
UPDATE wa_businesses
SET
  country      = 'Nicaragua',
  country_code = 'NI',
  currency     = 'NIO'
WHERE slug = 'huellas-beauty-de3b3'
  AND (country_code IS DISTINCT FROM 'NI');
