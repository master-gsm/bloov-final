/*
  # Cleanup Duplicate Storage Policies
  
  ## Summary
  Remove old/duplicate storage policies that were not dropped in previous migration.
  Keep only the new admin-only policies for backups.
  
  ## Changes
  - Drop old authenticated-only backup policies
  - Keep admin_only_* policies
*/

-- Drop old backup policies (keep only admin_only_* ones)
DROP POLICY IF EXISTS "Authenticated users can delete backups" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete from backups" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can insert to backups" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can list backups in dashboard" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read backups" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read from backups" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update backups" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete backups" ON storage.objects;
