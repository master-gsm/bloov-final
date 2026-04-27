/*
  # Fix partners UPDATE RLS policy

  The existing "Company admins can update partners" policy relies on fn_is_company_admin
  which is SECURITY DEFINER and may not correctly resolve auth.uid() for super_admin/admin users.

  This migration drops and recreates the UPDATE policy with a direct role check that
  allows super_admin and admin roles to update partners without going through the
  company_members lookup.
*/

DROP POLICY IF EXISTS "Company admins can update partners" ON partners;

CREATE POLICY "Company admins can update partners"
  ON partners
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM company_members
      WHERE user_id = auth.uid()
      AND company_id = partners.company_id
      AND company_role IN ('owner', 'admin')
      AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM company_members
      WHERE user_id = auth.uid()
      AND company_id = partners.company_id
      AND company_role IN ('owner', 'admin')
      AND is_active = true
    )
  );
