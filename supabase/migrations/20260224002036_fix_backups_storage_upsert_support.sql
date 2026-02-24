/*
  # Fix backups storage - add UPDATE policy and simplify INSERT

  The upsert operation requires both INSERT and UPDATE permissions.
  Add UPDATE policy for backups bucket for both authenticated and anon users.
  Also drop and recreate INSERT policy with true condition to ensure no conflicts.
*/

DROP POLICY IF EXISTS "Anyone can upload to backups" ON storage.objects;
DROP POLICY IF EXISTS "Service role can update backups" ON storage.objects;

CREATE POLICY "Anyone can insert to backups"
ON storage.objects
FOR INSERT
TO authenticated, anon
WITH CHECK (bucket_id = 'backups');

CREATE POLICY "Anyone can update backups"
ON storage.objects
FOR UPDATE
TO authenticated, anon
USING (bucket_id = 'backups')
WITH CHECK (bucket_id = 'backups');
