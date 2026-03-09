-- Add cover_image_url column to wa_businesses
ALTER TABLE public.wa_businesses
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

-- Create wa-business-covers storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('wa-business-covers', 'wa-business-covers', true, 10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies for wa-business-covers
DROP POLICY IF EXISTS "wa_business_covers_public_read" ON storage.objects;
DROP POLICY IF EXISTS "wa_business_covers_auth_upload" ON storage.objects;
DROP POLICY IF EXISTS "wa_business_covers_auth_delete" ON storage.objects;

CREATE POLICY "wa_business_covers_public_read"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'wa-business-covers');

CREATE POLICY "wa_business_covers_auth_upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'wa-business-covers');

CREATE POLICY "wa_business_covers_auth_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'wa-business-covers' AND owner = auth.uid());
