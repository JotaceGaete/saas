-- ============================================================
-- Backfill: crear wa_businesses para usuarios que no tienen una
-- (usuarios registrados antes de que existiera el trigger automático)
-- ============================================================

DO $$
DECLARE
  rec RECORD;
  v_name TEXT;
  v_base_slug TEXT;
  v_slug TEXT;
  v_counter INTEGER;
BEGIN
  FOR rec IN
    SELECT u.id, u.email, u.raw_user_meta_data
    FROM auth.users u
    WHERE NOT EXISTS (
      SELECT 1 FROM public.wa_businesses b WHERE b.user_id = u.id
    )
  LOOP
    -- Nombre del negocio desde metadata o email
    v_name := COALESCE(
      rec.raw_user_meta_data->>'name',
      rec.raw_user_meta_data->>'full_name',
      split_part(rec.email, '@', 1),
      'Mi Negocio'
    );

    -- Generar slug único
    v_base_slug := lower(
      regexp_replace(
        regexp_replace(v_name, '[^a-zA-Z0-9\s-]', '', 'g'),
        '\s+', '-', 'g'
      )
    );
    v_base_slug := trim(both '-' from v_base_slug);
    IF v_base_slug = '' THEN
      v_base_slug := 'negocio';
    END IF;

    v_slug := v_base_slug;
    v_counter := 0;
    WHILE EXISTS (SELECT 1 FROM public.wa_businesses WHERE slug = v_slug) LOOP
      v_counter := v_counter + 1;
      v_slug := v_base_slug || '-' || v_counter;
    END LOOP;

    INSERT INTO public.wa_businesses (
      user_id,
      name,
      email,
      whatsapp,
      currency,
      slug,
      is_active
    ) VALUES (
      rec.id,
      v_name,
      rec.email,
      '',
      'CLP',
      v_slug,
      true
    )
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Negocio creado para user_id=% slug=%', rec.id, v_slug;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
