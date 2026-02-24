/*
  # Fix backups storage INSERT policy
  
  The existing INSERT policy has a null WITH CHECK which may cause issues.
  Drop and recreate with explicit bucket_id check for authenticated users.
*/

DROP POLICY IF EXISTS "Anyone can insert to backups" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update backups" ON storage.objects;

CREATE POLICY "Authenticated users can insert to backups"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'backups');

CREATE POLICY "Authenticated users can update backups"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'backups')
  WITH CHECK (bucket_id = 'backups');
