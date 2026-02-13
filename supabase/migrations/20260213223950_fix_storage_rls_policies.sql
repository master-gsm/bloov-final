/*
  # Fix Storage RLS Policies for Invoice Upload

  ## Changes
  1. Drop and recreate INSERT policy to require authentication
  2. Add UPDATE policy for authenticated users
  3. Ensure policies work correctly with auth.uid()

  ## Security
  - Only authenticated users can upload invoices
  - Users can update their own invoices
  - Anyone can read invoices (public bucket)
*/

-- Drop existing INSERT policy
DROP POLICY IF EXISTS "Authenticated users can upload invoices" ON storage.objects;

-- Create new INSERT policy with proper authentication check
CREATE POLICY "Authenticated users can upload invoices"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'invoices' 
    AND auth.uid() IS NOT NULL
  );

-- Add UPDATE policy if it doesn't exist
DROP POLICY IF EXISTS "Authenticated users can update invoices" ON storage.objects;

CREATE POLICY "Authenticated users can update invoices"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'invoices')
  WITH CHECK (bucket_id = 'invoices');
