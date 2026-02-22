/*
  # Fix infinite recursion in users DELETE and UPDATE policies

  ## Problem
  users_delete_policy and users_update_policy also contain subqueries
  that read FROM users to check the caller's role, causing the same
  infinite recursion (42P17) seen in the SELECT policy.

  ## Solution
  Replace recursive subqueries with the SECURITY DEFINER function get_my_role().
*/

DROP POLICY IF EXISTS "users_delete_policy" ON users;
DROP POLICY IF EXISTS "users_update_policy" ON users;

CREATE POLICY "users_delete_policy"
  ON users
  FOR DELETE
  TO authenticated
  USING (get_my_role() = 'admin');

CREATE POLICY "users_update_policy"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id OR get_my_role() = 'admin')
  WITH CHECK (auth.uid() = id OR get_my_role() = 'admin');
