-- OPERATING-CALENDAR-1 — calendario operativo semanal del negocio.
--
-- Mismo patrón que design_settings (20260309180000_add_design_settings.sql):
-- una columna JSONB nullable en wa_businesses, sin tabla nueva -- la
-- auditoría confirmó que es la convención ya establecida en este proyecto
-- para configuración opcional por negocio, y esto es exactamente eso (7
-- booleanos, sin horarios ni feriados todavía).
--
-- NULL = no configurado = modo legacy: el Termómetro y /crm/costos tratan
-- TODOS los días calendario del mes como operativos, igual que calculaban
-- antes de esta migración. Esto es deliberado: no le inventamos un
-- horario a un negocio existente que nunca lo configuró -- el comerciante
-- debe elegirlo explícitamente en Configuración del negocio antes de que
-- el prorrateo de costos fijos cambie.
--
-- Estructura esperada (validada en aplicación, ver
-- src/lib/finance/operatingCalendar.js#normalizeOperatingDays):
--   {"monday": true, "tuesday": true, ..., "sunday": false}
--
-- El CHECK de acá es deliberadamente laxo (solo exige "objeto JSON, no
-- array/escalar" cuando no es NULL) -- no valida las 7 claves ni que los
-- valores sean booleanos, para no volver frágil la migración ante datos
-- futuros ligeramente distintos (p. ej. si alguna vez se guarda una clave
-- extra). La validación real y completa vive en la aplicación.
ALTER TABLE public.wa_businesses
  ADD COLUMN IF NOT EXISTS operating_days JSONB DEFAULT NULL;

COMMENT ON COLUMN public.wa_businesses.operating_days IS
  'Calendario operativo semanal (OPERATING-CALENDAR-1): {"monday":bool,...,"sunday":bool}. NULL = no configurado (legacy: todos los días del mes cuentan como operativos).';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wa_businesses_operating_days_is_object'
      AND conrelid = 'public.wa_businesses'::regclass
  ) THEN
    ALTER TABLE public.wa_businesses
      ADD CONSTRAINT wa_businesses_operating_days_is_object
      CHECK (operating_days IS NULL OR jsonb_typeof(operating_days) = 'object');
  END IF;
END $$;

-- No se modifica RLS: wa_businesses ya tiene sus políticas de owner
-- (auth.uid() = user_id, ver migraciones previas) y operating_days es una
-- columna más de esa misma fila -- no requiere ninguna política nueva.
