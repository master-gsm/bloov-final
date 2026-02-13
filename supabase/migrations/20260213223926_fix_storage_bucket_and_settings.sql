/*
  # Fix Storage Bucket and Settings Issues

  ## Changes
  1. Update invoices storage bucket to accept images (PNG, JPG, JPEG)
  2. Add tax_rate column to settings table (default 15% for Saudi Arabia)

  ## Details
  - Storage bucket will accept both PDFs and images
  - Tax rate column added with default 15% (0.15)
*/

-- Update storage bucket to accept images
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']
WHERE id = 'invoices';

-- Add tax_rate column to settings table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'tax_rate'
  ) THEN
    ALTER TABLE settings ADD COLUMN tax_rate DECIMAL(5,4) DEFAULT 0.15 NOT NULL;
    
    -- Set default tax rate for existing row
    UPDATE settings SET tax_rate = 0.15 WHERE id = 1;
  END IF;
END $$;
