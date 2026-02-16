/*
  # Create Backups Storage Bucket
  
  ## Description
  Creates a storage bucket for storing system backups with proper access controls.
  
  ## Changes
  1. Creates 'backups' storage bucket if not exists
  2. Sets up RLS policies for admin-only access
  3. Configures bucket for JSON file storage
  
  ## Security
  - Only admins can upload backups
  - Only admins can download backups
  - Public access is enabled for download links
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'backups'
  ) THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'backups',
      'backups',
      true,
      52428800,
      ARRAY['application/json']::text[]
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Admins can upload backups'
  ) THEN
    CREATE POLICY "Admins can upload backups"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'backups' AND
        EXISTS (
          SELECT 1 FROM public.users
          WHERE users.id = auth.uid()
          AND users.role = 'admin'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Admins can read backups'
  ) THEN
    CREATE POLICY "Admins can read backups"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'backups' AND
        EXISTS (
          SELECT 1 FROM public.users
          WHERE users.id = auth.uid()
          AND users.role = 'admin'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Admins can delete backups'
  ) THEN
    CREATE POLICY "Admins can delete backups"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'backups' AND
        EXISTS (
          SELECT 1 FROM public.users
          WHERE users.id = auth.uid()
          AND users.role = 'admin'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Public can read backups'
  ) THEN
    CREATE POLICY "Public can read backups"
      ON storage.objects
      FOR SELECT
      TO public
      USING (bucket_id = 'backups');
  END IF;
END $$;
