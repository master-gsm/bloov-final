/*
  # Fix infinite recursion in users SELECT policy

  ## Problem
  The users_select_policy on the users table contains subqueries that read
  FROM users again (to check role and branch_id), causing infinite recursion
  error code 42P17.

  ## Solution
  Replace the recursive subqueries with calls to get_my_role() and
  get_user_branch_id() which are SECURITY DEFINER functions that bypass RLS,
  breaking the recursion cycle.

  ## Changes
  - DROP the recursive users_select_policy
  - CREATE a new non-recursive users_select_policy using existing helper functions
*/

DROP POLICY IF EXISTS "users_select_policy" ON users;

CREATE POLICY "users_select_policy"
  ON users
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR get_my_role() = ANY (ARRAY['admin', 'observer'])
    OR branch_id = get_user_branch_id()
  );
