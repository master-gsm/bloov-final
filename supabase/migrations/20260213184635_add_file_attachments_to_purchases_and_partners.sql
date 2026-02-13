/*
  # Add File Attachments Support

  1. Schema Changes
    - Add `attachment_url` column to `purchases` table
    - Add `attachment_url` column to `partner_contributions` table
    - Add `attachment_url` column to `partner_settlements` table

  2. Notes
    - Files will be stored in Supabase Storage bucket 'receipts'
    - Storage bucket and policies are managed through Supabase dashboard
*/

-- Add attachment_url column to purchases table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchases' AND column_name = 'attachment_url'
  ) THEN
    ALTER TABLE purchases ADD COLUMN attachment_url TEXT;
  END IF;
END $$;

-- Add attachment_url column to partner_contributions table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partner_contributions' AND column_name = 'attachment_url'
  ) THEN
    ALTER TABLE partner_contributions ADD COLUMN attachment_url TEXT;
  END IF;
END $$;

-- Add attachment_url column to partner_settlements table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partner_settlements' AND column_name = 'attachment_url'
  ) THEN
    ALTER TABLE partner_settlements ADD COLUMN attachment_url TEXT;
  END IF;
END $$;

COMMENT ON COLUMN purchases.attachment_url IS 'Path to uploaded invoice/receipt file in storage';
COMMENT ON COLUMN partner_contributions.attachment_url IS 'Path to uploaded receipt file in storage';
COMMENT ON COLUMN partner_settlements.attachment_url IS 'Path to uploaded receipt file in storage';