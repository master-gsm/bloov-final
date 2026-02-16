/*
  # Fix Backups Storage Policies
  
  ## Description
  Fixes storage policies for backups bucket to allow service role access for Edge Functions.
  
  ## Changes
  1. Adds policy for service role to upload backups
  2. Ensures Edge Functions can upload without RLS restrictions
  
  ## Security
  - Service role can upload (used by Edge Function which checks admin auth)
  - Admins can view and delete backups
  - Public can view backups (for download links)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Service role can upload backups'
  ) THEN
    CREATE POLICY "Service role can upload backups"
      ON storage.objects
      FOR INSERT
      TO service_role
      WITH CHECK (bucket_id = 'backups');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Service role can update backups'
  ) THEN
    CREATE POLICY "Service role can update backups"
      ON storage.objects
      FOR UPDATE
      TO service_role
      USING (bucket_id = 'backups')
      WITH CHECK (bucket_id = 'backups');
  END IF;
END $$;
