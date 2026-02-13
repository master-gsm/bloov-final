/*
  # Add Business WhatsApp Number to Settings

  1. Changes
    - Add `business_whatsapp` column to settings table
    - Update to store business WhatsApp number for customer communications
    - Default value is empty, admin needs to configure it in Settings

  2. Notes
    - Phone number should be in international format (e.g., 966501234567)
    - Used for WhatsApp sharing links in invoices
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'business_whatsapp'
  ) THEN
    ALTER TABLE settings ADD COLUMN business_whatsapp TEXT DEFAULT '';
  END IF;
END $$;