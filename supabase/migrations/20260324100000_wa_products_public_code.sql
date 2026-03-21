-- Código público único por producto (WhatsApp): 6 caracteres, alfabeto sin O/0/I/1.

-- 1) Columna (nullable hasta backfill)
ALTER TABLE public.wa_products
  ADD COLUMN IF NOT EXISTS public_code VARCHAR(6);

COMMENT ON COLUMN public.wa_products.public_code IS 'Código corto único global para identificar el producto en WhatsApp (generado en servidor).';

-- 2) Generación con reintentos (máx. 10) ante colisión
CREATE OR REPLACE FUNCTION public.wa_try_generate_unique_public_code()
RETURNS VARCHAR(6)
LANGUAGE plpgsql
AS $$
DECLARE
  chars   CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  len     CONSTANT INT := length(chars);
  attempt INT := 0;
  i       INT;
  out     TEXT := '';
BEGIN
  LOOP
    attempt := attempt + 1;
    IF attempt > 10 THEN
      RAISE EXCEPTION 'No se pudo generar public_code único (máximo 10 intentos)'
        USING ERRCODE = 'P0001';
    END IF;
    out := '';
    FOR i IN 1..6 LOOP
      out := out || substr(chars, floor(random() * len)::int + 1, 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.wa_products WHERE public_code = out) THEN
      RETURN out::VARCHAR(6);
    END IF;
  END LOOP;
END;
$$;

-- 3) Backfill filas existentes
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.wa_products WHERE public_code IS NULL ORDER BY created_at LOOP
    UPDATE public.wa_products
    SET public_code = public.wa_try_generate_unique_public_code()
    WHERE id = r.id;
  END LOOP;
END $$;

-- 4) Restricciones
ALTER TABLE public.wa_products
  ALTER COLUMN public_code SET NOT NULL;

ALTER TABLE public.wa_products
  DROP CONSTRAINT IF EXISTS wa_products_public_code_len;

ALTER TABLE public.wa_products
  ADD CONSTRAINT wa_products_public_code_len CHECK (char_length(trim(public_code)) = 6);

ALTER TABLE public.wa_products
  DROP CONSTRAINT IF EXISTS wa_products_public_code_unique;

ALTER TABLE public.wa_products
  ADD CONSTRAINT wa_products_public_code_unique UNIQUE (public_code);

-- Índice explícito para búsquedas en panel (el UNIQUE ya crea un índice único; no duplicar)
-- UNIQUE public_code cubre búsqueda por igualdad.

-- 5) Trigger: INSERT siempre genera código (ignora valor cliente); UPDATE no permite cambiarlo
CREATE OR REPLACE FUNCTION public.wa_products_assign_public_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.public_code := public.wa_try_generate_unique_public_code();
  ELSIF TG_OP = 'UPDATE' THEN
    -- Solo bloquear cambios cuando ya había código (backfill desde NULL puede asignar una vez)
    IF OLD.public_code IS NOT NULL AND NEW.public_code IS DISTINCT FROM OLD.public_code THEN
      NEW.public_code := OLD.public_code;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wa_products_0_assign_public_code ON public.wa_products;
CREATE TRIGGER wa_products_0_assign_public_code
  BEFORE INSERT OR UPDATE ON public.wa_products
  FOR EACH ROW
  EXECUTE FUNCTION public.wa_products_assign_public_code();
