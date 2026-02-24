/*
  # Fix backups storage policy - allow anon INSERT

  Allow the anon role to upload files to the backups bucket.
  This is needed because backup uploads may occur before or outside of a full auth session.
*/

DROP POLICY IF EXISTS "Allow anon upload to backups" ON storage.objects;

CREATE POLICY "Allow anon upload to backups"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (bucket_id = 'backups');
