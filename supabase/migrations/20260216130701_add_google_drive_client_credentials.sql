/*
  # Add Google Drive Client Credentials to Settings
  
  ## Description
  Adds fields to store Google Drive OAuth client credentials in the settings table.
  This allows administrators to configure Google Drive integration directly from the app
  without needing to set environment variables.
  
  ## Changes
  1. Adds google_drive_client_id TEXT field - stores Google OAuth client ID
  2. Adds google_drive_client_secret TEXT field - stores Google OAuth client secret
  
  ## Security
  - These fields are only accessible by admin users through existing RLS policies
  - Client secret is stored in the database (consider using encryption in production)
  
  ## Notes
  - Users need to create a Google Cloud project and OAuth credentials to get these values
  - Instructions will be provided in the UI
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'google_drive_client_id'
  ) THEN
    ALTER TABLE settings ADD COLUMN google_drive_client_id TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'google_drive_client_secret'
  ) THEN
    ALTER TABLE settings ADD COLUMN google_drive_client_secret TEXT;
  END IF;
END $$;

COMMENT ON COLUMN settings.google_drive_client_id IS 'Google OAuth 2.0 Client ID for Drive API';
COMMENT ON COLUMN settings.google_drive_client_secret IS 'Google OAuth 2.0 Client Secret for Drive API';
