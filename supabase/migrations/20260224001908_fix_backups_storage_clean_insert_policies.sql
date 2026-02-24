/*
  # Fix backups storage INSERT policies

  Remove all conflicting INSERT policies on the backups bucket and replace
  with a single permissive policy that allows both authenticated and anon roles.
*/

DROP POLICY IF EXISTS "Admins can upload backups" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload backups" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to backups" ON storage.objects;
DROP POLICY IF EXISTS "Service role can upload backups" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon upload to backups" ON storage.objects;

CREATE POLICY "Anyone can upload to backups"
ON storage.objects
FOR INSERT
TO authenticated, anon
WITH CHECK (bucket_id = 'backups');
