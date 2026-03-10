/*
  # Fix Users Table RLS Infinite Recursion
  
  ## Problem
  The `authenticated_can_lookup_users` policy queries the `users` table within its own USING clause,
  causing infinite recursion when RLS is evaluated.
  
  ## Solution
  - Drop the problematic policy
  - Keep the simpler `users_select_policy` which uses `get_user_role()` function that bypasses RLS
  
  ## Changes
  - Drop `authenticated_can_lookup_users` policy
*/

DROP POLICY IF EXISTS "authenticated_can_lookup_users" ON public.users;
