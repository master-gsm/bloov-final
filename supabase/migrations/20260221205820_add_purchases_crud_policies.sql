/*
  # Add missing CRUD policies for purchases table

  ## Summary
  The purchases table was missing INSERT, UPDATE, and DELETE policies,
  which prevented users from creating, updating, or deleting purchase records.
  This migration adds comprehensive RLS policies for all CRUD operations.

  ## Changes
  - Add INSERT policy: Admins can create purchases for their branch
  - Add UPDATE policy: Admins can update purchases for their branch
  - Add DELETE policy: Only admins can soft-delete purchases
*/

CREATE POLICY "Admins can insert purchases"
  ON purchases FOR INSERT
  TO authenticated
  WITH CHECK (
    (get_my_role() = ANY (ARRAY['super_admin'::text, 'admin'::text, 'accountant'::text]))
    AND (branch_id = get_user_branch_id() OR get_my_role() = 'super_admin'::text)
  );

CREATE POLICY "Admins can update purchases"
  ON purchases FOR UPDATE
  TO authenticated
  USING (
    is_deleted = false
    AND (get_my_role() = ANY (ARRAY['super_admin'::text, 'admin'::text, 'accountant'::text]))
    AND (branch_id = get_user_branch_id() OR get_my_role() = 'super_admin'::text)
  )
  WITH CHECK (
    (get_my_role() = ANY (ARRAY['super_admin'::text, 'admin'::text, 'accountant'::text]))
    AND (branch_id = get_user_branch_id() OR get_my_role() = 'super_admin'::text)
  );

CREATE POLICY "Admins can delete purchases"
  ON purchases FOR DELETE
  TO authenticated
  USING (
    is_deleted = false
    AND (get_my_role() = ANY (ARRAY['super_admin'::text, 'admin'::text, 'accountant'::text]))
    AND (branch_id = get_user_branch_id() OR get_my_role() = 'super_admin'::text)
  );
