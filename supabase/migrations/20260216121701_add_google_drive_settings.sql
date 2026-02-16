/*
  # Add Google Drive Settings
  
  ## Description
  Adds Google Drive integration settings for automatic backups.
  
  ## Changes
  1. Adds google_drive_enabled boolean field
  2. Adds google_drive_folder_id for target folder
  3. Adds google_drive_credentials for OAuth tokens (encrypted)
  4. Adds auto_backup_enabled and auto_backup_schedule
  
  ## Security
  - Only admins can modify these settings through RLS
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'google_drive_enabled'
  ) THEN
    ALTER TABLE settings ADD COLUMN google_drive_enabled BOOLEAN DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'google_drive_folder_id'
  ) THEN
    ALTER TABLE settings ADD COLUMN google_drive_folder_id TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'google_drive_credentials'
  ) THEN
    ALTER TABLE settings ADD COLUMN google_drive_credentials JSONB;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'auto_backup_enabled'
  ) THEN
    ALTER TABLE settings ADD COLUMN auto_backup_enabled BOOLEAN DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'auto_backup_schedule'
  ) THEN
    ALTER TABLE settings ADD COLUMN auto_backup_schedule TEXT DEFAULT 'daily';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'last_backup_date'
  ) THEN
    ALTER TABLE settings ADD COLUMN last_backup_date TIMESTAMPTZ;
  END IF;
END $$;

COMMENT ON COLUMN settings.google_drive_enabled IS 'Enable automatic backup to Google Drive';
COMMENT ON COLUMN settings.google_drive_folder_id IS 'Google Drive folder ID for backups';
COMMENT ON COLUMN settings.google_drive_credentials IS 'Encrypted Google OAuth credentials';
COMMENT ON COLUMN settings.auto_backup_enabled IS 'Enable automatic scheduled backups';
COMMENT ON COLUMN settings.auto_backup_schedule IS 'Backup schedule: daily, weekly, monthly';
COMMENT ON COLUMN settings.last_backup_date IS 'Last successful backup timestamp';
