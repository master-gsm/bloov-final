/*
  # Add Theme ID Column to Users Table

  1. Changes
    - Adds `theme_id` column to `users` table for storing user's preferred theme
    - Default value is 'light-default'
  
  2. Purpose
    - Allow users to save their theme preference in the database
    - Theme preference persists across devices when logged in
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'theme_id'
  ) THEN
    ALTER TABLE users ADD COLUMN theme_id text DEFAULT 'light-default';
  END IF;
END $$;
