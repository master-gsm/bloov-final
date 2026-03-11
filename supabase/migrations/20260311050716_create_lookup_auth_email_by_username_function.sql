/*
  # Create secure username-to-email lookup function

  1. Problem
    - Login form queries `users` table to find username, but RLS blocks
      unauthenticated reads, so the lookup always returns NULL.
    - This causes login to fail for all username-based logins.

  2. Solution
    - Create a SECURITY DEFINER function `lookup_auth_email_by_username`
      that takes a username and returns the matching auth email.
    - The function bypasses RLS safely since it only returns an email
      (no sensitive data) and is needed for the login flow.

  3. Security
    - Function is SECURITY DEFINER with restricted search_path
    - Only returns the email string, no other user data
    - Uses `anon` role access so it works before authentication
*/

CREATE OR REPLACE FUNCTION public.lookup_auth_email_by_username(p_username text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public', 'auth'
AS $$
  SELECT a.email
  FROM public.users u
  JOIN auth.users a ON a.id = u.id
  WHERE lower(u.username) = lower(p_username)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_auth_email_by_username(text) TO anon;
GRANT EXECUTE ON FUNCTION public.lookup_auth_email_by_username(text) TO authenticated;
