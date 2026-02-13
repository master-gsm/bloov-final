/*
  # Create Invoices Storage Bucket

  1. Storage
    - Create `invoices` bucket for storing PDF invoices
    - Set bucket to be publicly accessible
  
  2. Security
    - Allow authenticated users to upload invoices
    - Allow public read access to invoices
*/

-- Create the invoices bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invoices',
  'invoices',
  true,
  10485760,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Authenticated users can upload invoices" ON storage.objects;
DROP POLICY IF EXISTS "Public read access to invoices" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own invoices" ON storage.objects;

-- Allow authenticated users to upload invoices
CREATE POLICY "Authenticated users can upload invoices"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'invoices');

-- Allow public read access to invoices
CREATE POLICY "Public read access to invoices"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'invoices');

-- Allow authenticated users to delete invoices
CREATE POLICY "Users can delete their own invoices"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'invoices');
