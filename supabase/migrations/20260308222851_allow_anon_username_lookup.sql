/*
  # Allow anonymous username lookup for login
  
  1. Changes
    - Add RLS policy to allow anonymous users to select id by username for login purposes
*/

CREATE POLICY "anon_can_lookup_username"
  ON public.users
  FOR SELECT
  TO anon
  USING (true);
