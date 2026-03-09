-- Fix: Auto-create wa_businesses on user signup via trigger (bypasses RLS)
-- This resolves the "Error inesperado" on registration caused by missing session
-- when email confirmation is enabled in Supabase.

-- 1. SECURITY DEFINER function to create business bypassing RLS
CREATE OR REPLACE FUNCTION public.wa_handle_new_user_business()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT;
  v_whatsapp TEXT;
  v_slug TEXT;
  v_base_slug TEXT;
  v_counter INTEGER := 0;
BEGIN
  -- Extract business name from metadata, fallback to email prefix
  v_name := COALESCE(
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1),
    'Mi Negocio'
  );

  v_whatsapp := COALESCE(NEW.raw_user_meta_data->>'whatsapp', '');

  -- Generate unique slug
  v_base_slug := lower(regexp_replace(regexp_replace(v_name, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  IF v_base_slug = '' THEN
    v_base_slug := 'negocio';
  END IF;
  v_slug := v_base_slug;

  WHILE EXISTS (SELECT 1 FROM public.wa_businesses WHERE slug = v_slug) LOOP
    v_counter := v_counter + 1;
    v_slug := v_base_slug || '-' || v_counter;
  END LOOP;

  -- Insert business row (SECURITY DEFINER bypasses RLS)
  INSERT INTO public.wa_businesses (
    user_id,
    name,
    whatsapp,
    email,
    currency,
    slug,
    is_active
  ) VALUES (
    NEW.id,
    v_name,
    v_whatsapp,
    NEW.email,
    'CLP',
    v_slug,
    true
  ) ON CONFLICT DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Never block user creation even if business insert fails
    RAISE WARNING 'wa_handle_new_user_business failed for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- 2. Trigger: fires after new auth user is created
DROP TRIGGER IF EXISTS wa_on_auth_user_created ON auth.users;
CREATE TRIGGER wa_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.wa_handle_new_user_business();

-- 3. Also add a permissive INSERT policy so authenticated users can
--    create their own business row if the trigger somehow missed it
DROP POLICY IF EXISTS "wa_businesses_owner_insert" ON public.wa_businesses;
CREATE POLICY "wa_businesses_owner_insert"
ON public.wa_businesses
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());
