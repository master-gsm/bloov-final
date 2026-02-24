/*
  # Temporarily Disable RLS for Debugging

  This migration disables RLS on the users table temporarily to diagnose branch loading issues.
  Once we verify the data is accessible and identify the root cause, RLS will be re-enabled
  with corrected policies.
*/

ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
