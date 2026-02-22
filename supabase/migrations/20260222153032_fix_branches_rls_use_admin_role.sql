/*
  # Fix Branches RLS Policies — Replace super_admin with admin

  ## Problem
  All existing RLS policies on `branches` gate access on role = 'super_admin',
  but the highest role in this system is 'admin'. This causes a 403 error for
  every INSERT / UPDATE / DELETE attempted by an admin.

  ## Changes
  - Drop all existing policies on `branches`
  - Re-create four clean policies that query the `users` table via auth.uid():
    - SELECT: admin and observer see all branches; others see only their own branch
    - INSERT: admin only
    - UPDATE: admin only
    - DELETE: admin only

  No JWT / app_metadata checks — everything is derived from the `users` table.
*/

-- ── Drop every existing policy on branches ──────────────────────────────────
DROP POLICY IF EXISTS "super_admin can insert branches"   ON branches;
DROP POLICY IF EXISTS "super_admin can update branches"   ON branches;
DROP POLICY IF EXISTS "super_admin can delete branches"   ON branches;
DROP POLICY IF EXISTS "Users can view branches"           ON branches;

-- Keep RLS enabled (never disabled)
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

-- ── SELECT ───────────────────────────────────────────────────────────────────
-- admin / observer → all branches
-- everyone else    → only their own branch
CREATE POLICY "admin and observer can view all branches"
  ON branches FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('admin', 'observer')
    )
    OR
    id = (SELECT branch_id FROM users WHERE users.id = auth.uid())
  );

-- ── INSERT ───────────────────────────────────────────────────────────────────
CREATE POLICY "admin can insert branches"
  ON branches FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  );

-- ── UPDATE ───────────────────────────────────────────────────────────────────
CREATE POLICY "admin can update branches"
  ON branches FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  );

-- ── DELETE ───────────────────────────────────────────────────────────────────
CREATE POLICY "admin can delete branches"
  ON branches FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  );
