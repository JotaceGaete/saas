-- Migración reconstruida 1:1 desde supabase_migrations.schema_migrations
-- (version = '20260502162609', name = 'creator_platform_core').
-- El archivo original nunca se commiteó al repo; este contenido replica los
-- statements exactamente como fueron aplicados a la base remota, en el mismo
-- orden y sin modificaciones. La migración ya figura como aplicada en el
-- historial remoto: el CLI no la re-ejecuta.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.creator_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.creator_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  slug text NOT NULL UNIQUE,
  bio text,
  avatar_url text,
  cover_url text,
  whatsapp text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.creator_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  title text,
  description text,
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'subscribers', 'paid')),
  media_type text NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video', 'mixed')),
  cover_path text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.creator_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  price numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  product_type text NOT NULL DEFAULT 'pack' CHECK (product_type IN ('pack', 'subscription', 'unlock')),
  cover_path text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.creator_product_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.creator_products(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  media_type text NOT NULL CHECK (media_type IN ('image', 'video')),
  media_path text NOT NULL,
  thumbnail_path text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.creator_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fan_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.creator_products(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'refunded', 'cancelled')),
  amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  provider text,
  provider_payment_id text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.creator_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fan_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'expired', 'cancelled')),
  provider text,
  provider_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS creator_profiles_user_id_key ON public.creator_profiles(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS creator_profiles_slug_key ON public.creator_profiles(slug);

CREATE INDEX IF NOT EXISTS creator_profiles_is_active_idx ON public.creator_profiles(is_active);

CREATE INDEX IF NOT EXISTS creator_posts_creator_id_idx ON public.creator_posts(creator_id);

CREATE INDEX IF NOT EXISTS creator_posts_visibility_active_idx ON public.creator_posts(visibility, is_active);

CREATE INDEX IF NOT EXISTS creator_posts_created_at_idx ON public.creator_posts(created_at DESC);

CREATE INDEX IF NOT EXISTS creator_products_creator_id_idx ON public.creator_products(creator_id);

CREATE INDEX IF NOT EXISTS creator_products_type_active_idx ON public.creator_products(product_type, is_active);

CREATE INDEX IF NOT EXISTS creator_products_created_at_idx ON public.creator_products(created_at DESC);

CREATE INDEX IF NOT EXISTS creator_product_media_product_sort_idx ON public.creator_product_media(product_id, sort_order);

CREATE INDEX IF NOT EXISTS creator_product_media_creator_id_idx ON public.creator_product_media(creator_id);

CREATE INDEX IF NOT EXISTS creator_purchases_fan_status_idx ON public.creator_purchases(fan_user_id, status);

CREATE INDEX IF NOT EXISTS creator_purchases_creator_status_idx ON public.creator_purchases(creator_id, status);

CREATE INDEX IF NOT EXISTS creator_purchases_product_status_idx ON public.creator_purchases(product_id, status);

CREATE INDEX IF NOT EXISTS creator_purchases_paid_at_idx ON public.creator_purchases(paid_at DESC);

CREATE INDEX IF NOT EXISTS creator_subscriptions_fan_status_idx ON public.creator_subscriptions(fan_user_id, status);

CREATE INDEX IF NOT EXISTS creator_subscriptions_creator_status_idx ON public.creator_subscriptions(creator_id, status);

CREATE INDEX IF NOT EXISTS creator_subscriptions_period_end_idx ON public.creator_subscriptions(current_period_end);

CREATE OR REPLACE FUNCTION public.is_creator_owner(target_creator_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.creator_profiles cp
      WHERE cp.id = target_creator_id
        AND cp.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.has_active_creator_subscription(target_creator_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.creator_subscriptions cs
      WHERE cs.creator_id = target_creator_id
        AND cs.fan_user_id = auth.uid()
        AND cs.status = 'active'
        AND (cs.current_period_end IS NULL OR cs.current_period_end > now())
    );
$$;

CREATE OR REPLACE FUNCTION public.has_paid_creator_purchase(target_product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.creator_purchases cp
      WHERE cp.product_id = target_product_id
        AND cp.fan_user_id = auth.uid()
        AND cp.status = 'paid'
    );
$$;

CREATE OR REPLACE FUNCTION public.has_paid_creator_access_to_creator(target_creator_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.creator_purchases purchase
      JOIN public.creator_products product
        ON product.id = purchase.product_id
      WHERE purchase.fan_user_id = auth.uid()
        AND purchase.status = 'paid'
        AND product.creator_id = target_creator_id
    );
$$;

DROP TRIGGER IF EXISTS set_creator_profiles_updated_at ON public.creator_profiles;

CREATE TRIGGER set_creator_profiles_updated_at
BEFORE UPDATE ON public.creator_profiles
FOR EACH ROW
EXECUTE FUNCTION public.creator_set_updated_at();

DROP TRIGGER IF EXISTS set_creator_posts_updated_at ON public.creator_posts;

CREATE TRIGGER set_creator_posts_updated_at
BEFORE UPDATE ON public.creator_posts
FOR EACH ROW
EXECUTE FUNCTION public.creator_set_updated_at();

DROP TRIGGER IF EXISTS set_creator_products_updated_at ON public.creator_products;

CREATE TRIGGER set_creator_products_updated_at
BEFORE UPDATE ON public.creator_products
FOR EACH ROW
EXECUTE FUNCTION public.creator_set_updated_at();

DROP TRIGGER IF EXISTS set_creator_subscriptions_updated_at ON public.creator_subscriptions;

CREATE TRIGGER set_creator_subscriptions_updated_at
BEFORE UPDATE ON public.creator_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.creator_set_updated_at();

ALTER TABLE public.creator_profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.creator_posts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.creator_products ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.creator_product_media ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.creator_purchases ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.creator_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "creator_profiles_public_read" ON public.creator_profiles;

CREATE POLICY "creator_profiles_public_read"
ON public.creator_profiles
FOR SELECT
TO public
USING (is_active = true);

DROP POLICY IF EXISTS "creator_profiles_owner_all" ON public.creator_profiles;

CREATE POLICY "creator_profiles_owner_all"
ON public.creator_profiles
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "creator_posts_public_read" ON public.creator_posts;

CREATE POLICY "creator_posts_public_read"
ON public.creator_posts
FOR SELECT
TO public
USING (is_active = true AND visibility = 'public');

DROP POLICY IF EXISTS "creator_posts_subscribers_read" ON public.creator_posts;

CREATE POLICY "creator_posts_subscribers_read"
ON public.creator_posts
FOR SELECT
TO authenticated
USING (
  is_active = true
  AND visibility = 'subscribers'
  AND public.has_active_creator_subscription(creator_id)
);

DROP POLICY IF EXISTS "creator_posts_paid_read" ON public.creator_posts;

CREATE POLICY "creator_posts_paid_read"
ON public.creator_posts
FOR SELECT
TO authenticated
USING (
  is_active = true
  AND visibility = 'paid'
  AND public.has_paid_creator_access_to_creator(creator_id)
);

DROP POLICY IF EXISTS "creator_posts_owner_all" ON public.creator_posts;

CREATE POLICY "creator_posts_owner_all"
ON public.creator_posts
FOR ALL
TO authenticated
USING (public.is_creator_owner(creator_id))
WITH CHECK (public.is_creator_owner(creator_id));

DROP POLICY IF EXISTS "creator_products_public_read" ON public.creator_products;

CREATE POLICY "creator_products_public_read"
ON public.creator_products
FOR SELECT
TO public
USING (is_active = true);

DROP POLICY IF EXISTS "creator_products_owner_all" ON public.creator_products;

CREATE POLICY "creator_products_owner_all"
ON public.creator_products
FOR ALL
TO authenticated
USING (public.is_creator_owner(creator_id))
WITH CHECK (public.is_creator_owner(creator_id));

DROP POLICY IF EXISTS "creator_product_media_pack_unlock_read" ON public.creator_product_media;

CREATE POLICY "creator_product_media_pack_unlock_read"
ON public.creator_product_media
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.creator_products product
    WHERE product.id = creator_product_media.product_id
      AND product.creator_id = creator_product_media.creator_id
      AND product.is_active = true
      AND product.product_type IN ('pack', 'unlock')
      AND public.has_paid_creator_purchase(product.id)
  )
);

DROP POLICY IF EXISTS "creator_product_media_subscription_read" ON public.creator_product_media;

CREATE POLICY "creator_product_media_subscription_read"
ON public.creator_product_media
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.creator_products product
    WHERE product.id = creator_product_media.product_id
      AND product.creator_id = creator_product_media.creator_id
      AND product.is_active = true
      AND product.product_type = 'subscription'
      AND public.has_active_creator_subscription(product.creator_id)
  )
);

DROP POLICY IF EXISTS "creator_product_media_owner_all" ON public.creator_product_media;

CREATE POLICY "creator_product_media_owner_all"
ON public.creator_product_media
FOR ALL
TO authenticated
USING (public.is_creator_owner(creator_id))
WITH CHECK (public.is_creator_owner(creator_id));

DROP POLICY IF EXISTS "creator_purchases_fan_read" ON public.creator_purchases;

CREATE POLICY "creator_purchases_fan_read"
ON public.creator_purchases
FOR SELECT
TO authenticated
USING (fan_user_id = auth.uid());

DROP POLICY IF EXISTS "creator_purchases_creator_read" ON public.creator_purchases;

CREATE POLICY "creator_purchases_creator_read"
ON public.creator_purchases
FOR SELECT
TO authenticated
USING (public.is_creator_owner(creator_id));

DROP POLICY IF EXISTS "creator_purchases_fan_insert_pending" ON public.creator_purchases;

CREATE POLICY "creator_purchases_fan_insert_pending"
ON public.creator_purchases
FOR INSERT
TO authenticated
WITH CHECK (
  fan_user_id = auth.uid()
  AND status = 'pending'
  AND EXISTS (
    SELECT 1
    FROM public.creator_products product
    WHERE product.id = creator_purchases.product_id
      AND product.creator_id = creator_purchases.creator_id
      AND product.is_active = true
  )
);

DROP POLICY IF EXISTS "creator_subscriptions_fan_read" ON public.creator_subscriptions;

CREATE POLICY "creator_subscriptions_fan_read"
ON public.creator_subscriptions
FOR SELECT
TO authenticated
USING (fan_user_id = auth.uid());

DROP POLICY IF EXISTS "creator_subscriptions_creator_read" ON public.creator_subscriptions;

CREATE POLICY "creator_subscriptions_creator_read"
ON public.creator_subscriptions
FOR SELECT
TO authenticated
USING (public.is_creator_owner(creator_id));

DROP POLICY IF EXISTS "creator_subscriptions_fan_insert_pending" ON public.creator_subscriptions;

CREATE POLICY "creator_subscriptions_fan_insert_pending"
ON public.creator_subscriptions
FOR INSERT
TO authenticated
WITH CHECK (
  fan_user_id = auth.uid()
  AND status = 'pending'
  AND EXISTS (
    SELECT 1
    FROM public.creator_profiles profile
    WHERE profile.id = creator_subscriptions.creator_id
      AND profile.is_active = true
  )
);
