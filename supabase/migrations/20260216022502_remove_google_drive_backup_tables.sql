/*
  # Remove Google Drive Backup Tables

  1. Tables Dropped
    - backup_queue: Queue for incremental backups
    - backup_logs: History of backup operations
    - backup_settings: Configuration for automatic backups

  2. Security
    - Clean removal of all backup-related infrastructure
*/

-- Drop backup tables
DROP TABLE IF EXISTS backup_queue CASCADE;
DROP TABLE IF EXISTS backup_logs CASCADE;
DROP TABLE IF EXISTS backup_settings CASCADE;

-- Drop backup-related functions
DROP FUNCTION IF EXISTS check_backup_health() CASCADE;
DROP FUNCTION IF EXISTS cleanup_old_backups() CASCADE;
DROP FUNCTION IF EXISTS update_last_backup_status() CASCADE;
DROP FUNCTION IF EXISTS update_backup_settings_timestamp() CASCADE;

-- Drop backup-related views
DROP VIEW IF EXISTS backup_statistics CASCADE;