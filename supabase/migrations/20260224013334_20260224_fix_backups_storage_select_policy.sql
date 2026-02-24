/*
  # Fix backups storage SELECT policy for Dashboard visibility

  - Add SELECT policy for authenticated users to see backups in Supabase Dashboard
  - This allows users to view backup files they created via the dashboard
*/

CREATE POLICY "Authenticated users can list backups in dashboard"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'backups');
