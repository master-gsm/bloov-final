/*
  # Add function to get current user's role

  1. New Functions
    - `get_my_role()` - Returns the current authenticated user's role from the users table
    - Uses SECURITY DEFINER to bypass RLS, ensuring the user can always check their own role

  2. Security
    - Function only returns the role for the calling user (auth.uid())
    - Cannot be used to check other users' roles
*/

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM users WHERE id = auth.uid() AND is_active = true;
$$;