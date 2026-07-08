-- Arqueo de caja: datos de cierre inmutables (fotografía histórica)
-- Nunca recalcular estos valores después de un cierre.

ALTER TABLE crm_cash_sessions
  ADD COLUMN IF NOT EXISTS expected_cash   NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS counted_cash    NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS cash_difference NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS closing_notes   TEXT,
  ADD COLUMN IF NOT EXISTS closed_by       UUID REFERENCES auth.users(id);

COMMENT ON COLUMN crm_cash_sessions.expected_cash
  IS 'Efectivo esperado en caja al cierre (calculado en el momento del cierre, no recalcular)';
COMMENT ON COLUMN crm_cash_sessions.counted_cash
  IS 'Efectivo físico contado por el cajero al cerrar';
COMMENT ON COLUMN crm_cash_sessions.cash_difference
  IS 'counted_cash - expected_cash (positivo = sobrante, negativo = faltante)';
COMMENT ON COLUMN crm_cash_sessions.closing_notes
  IS 'Observación obligatoria cuando cash_difference != 0';
COMMENT ON COLUMN crm_cash_sessions.closed_by
  IS 'Usuario que realizó el cierre';
