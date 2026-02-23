/*
  # Ensure backups storage bucket exists with correct policies

  Creates the backups bucket if it doesn't exist and ensures
  authenticated users can upload, read, and delete backups.
  The bucket is private (not public) for security.
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('backups', 'backups', false, 209715200, ARRAY['application/json'])
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 209715200;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Authenticated users can upload to backups'
  ) THEN
    CREATE POLICY "Authenticated users can upload to backups"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'backups');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Authenticated users can read from backups'
  ) THEN
    CREATE POLICY "Authenticated users can read from backups"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'backups');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Authenticated users can delete from backups'
  ) THEN
    CREATE POLICY "Authenticated users can delete from backups"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'backups');
  END IF;
END $$;
