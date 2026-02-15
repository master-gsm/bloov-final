/*
  # Create Receipts Storage Bucket for Attachments

  1. Storage
    - Create `receipts` bucket for storing all attachments (images, PDFs)
    - Set bucket to be publicly accessible
  
  2. Security
    - Allow authenticated users to upload attachments
    - Allow public read access to attachments
    - Allow authenticated users to delete attachments

  3. Purpose
    - This bucket will be used for all file attachments across the system:
      - Purchase receipts
      - Operating expense attachments  
      - Partner contribution attachments
      - Setup expense attachments
*/

-- Create the receipts bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  true,
  10485760, -- 10MB limit
  ARRAY[
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO UPDATE
SET 
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Authenticated users can upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Public read access to receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update receipts" ON storage.objects;

-- Allow authenticated users to upload receipts
CREATE POLICY "Authenticated users can upload receipts"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'receipts' 
    AND auth.uid() IS NOT NULL
  );

-- Allow public read access to receipts
CREATE POLICY "Public read access to receipts"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'receipts');

-- Allow authenticated users to delete receipts
CREATE POLICY "Authenticated users can delete receipts"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND auth.uid() IS NOT NULL
  );

-- Allow authenticated users to update receipts
CREATE POLICY "Authenticated users can update receipts"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND auth.uid() IS NOT NULL
  )
  WITH CHECK (
    bucket_id = 'receipts'
    AND auth.uid() IS NOT NULL
  );
