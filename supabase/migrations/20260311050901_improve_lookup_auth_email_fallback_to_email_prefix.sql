/*
  # Improve username lookup to also match email prefix

  1. Problem
    - Some users have NULL username but their auth email is like `abd@bloov.local`
    - When they type "abd" as username, it doesn't match because username is NULL

  2. Solution
    - Update `lookup_auth_email_by_username` to first try matching by username
    - If no match, fall back to matching by email prefix (for @bloov.local accounts)
    - This allows users without a username set to still log in with their name

  3. Security
    - Same SECURITY DEFINER approach, only returns email string
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
     OR a.email = lower(p_username) || '@bloov.local'
  ORDER BY (CASE WHEN lower(u.username) = lower(p_username) THEN 0 ELSE 1 END)
  LIMIT 1;
$$;
