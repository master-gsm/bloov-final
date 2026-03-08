/*
  # Add Username Column to Users Table
  
  1. Changes
    - Add `username` column to `users` table to store the display username (supports Arabic)
    - Add unique index on username for fast lookup during login
    
  2. Purpose
    - Allow users to login with Arabic usernames
    - The username is stored separately from the email (which is used internally by Supabase Auth)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'username'
  ) THEN
    ALTER TABLE public.users ADD COLUMN username text;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique 
ON public.users (username) 
WHERE username IS NOT NULL;