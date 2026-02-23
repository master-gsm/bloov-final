/*
  # Create backups storage bucket

  Creates the backups bucket if it doesn't exist and sets up RLS policies
  so authenticated users can upload and read backups.
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('backups', 'backups', false, 104857600, ARRAY['application/json'])
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated users can upload backups'
  ) THEN
    CREATE POLICY "Authenticated users can upload backups"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'backups');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated users can read backups'
  ) THEN
    CREATE POLICY "Authenticated users can read backups"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'backups');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated users can delete backups'
  ) THEN
    CREATE POLICY "Authenticated users can delete backups"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'backups');
  END IF;
END $$;
