/*
  # Add ZATCA Credentials Storage to Settings

  ## Summary
  Adds columns to the settings table to securely store ZATCA API credentials
  obtained during the onboarding process.

  ## New Columns on `settings`
  - `zatca_certificate` (TEXT) - Binary Security Token from ZATCA
  - `zatca_secret` (TEXT) - Secret key paired with the certificate
  - `zatca_private_key` (TEXT) - Private key for signing invoices
  - `business_address` (TEXT) - Business street address
  - `business_city` (TEXT) - Business city
  - `business_postal_code` (TEXT) - Business postal code
  - `zatca_qr_code` (TEXT) - Last generated QR code for reference

  ## Security Notes
  - These credentials should only be accessed by the Edge Function
  - The service role key is used for credential storage/retrieval
  - RLS policies ensure regular users cannot see sensitive fields
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'zatca_certificate'
  ) THEN
    ALTER TABLE settings ADD COLUMN zatca_certificate TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'zatca_secret'
  ) THEN
    ALTER TABLE settings ADD COLUMN zatca_secret TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'zatca_private_key'
  ) THEN
    ALTER TABLE settings ADD COLUMN zatca_private_key TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'business_address'
  ) THEN
    ALTER TABLE settings ADD COLUMN business_address TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'business_city'
  ) THEN
    ALTER TABLE settings ADD COLUMN business_city TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'business_postal_code'
  ) THEN
    ALTER TABLE settings ADD COLUMN business_postal_code TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'zatca_cleared_invoice'
  ) THEN
    ALTER TABLE sales ADD COLUMN zatca_cleared_invoice TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'zatca_qr_code'
  ) THEN
    ALTER TABLE sales ADD COLUMN zatca_qr_code TEXT;
  END IF;
END $$;
