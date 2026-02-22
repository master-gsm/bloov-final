/*
  # Fix Branches RLS Policies

  ## Summary
  Adds missing INSERT, UPDATE, and DELETE policies on the branches table.
  Previously only a SELECT policy existed, causing "violates row-level security policy"
  errors when super_admin tried to create a new branch.

  ## Changes
  1. INSERT: only super_admin can create branches
  2. UPDATE: only super_admin can update branches
  3. DELETE: only super_admin can delete branches
  4. SELECT: keep existing policy (super_admin/observer/admin see all; others see their own branch)

  ## Security
  - No regular user can create or modify branches
  - Branch isolation is enforced via RLS at the database level
*/

DROP POLICY IF EXISTS "super_admin can insert branches" ON branches;
CREATE POLICY "super_admin can insert branches"
  ON branches FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
  );

DROP POLICY IF EXISTS "super_admin can update branches" ON branches;
CREATE POLICY "super_admin can update branches"
  ON branches FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
  )
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
  );

DROP POLICY IF EXISTS "super_admin can delete branches" ON branches;
CREATE POLICY "super_admin can delete branches"
  ON branches FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
  );
