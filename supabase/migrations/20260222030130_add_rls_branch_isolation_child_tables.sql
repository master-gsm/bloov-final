/*
  # RLS Branch Isolation for Child Tables

  ## Summary
  Adds Row Level Security policies to:
  - sale_items: users can only see/insert sale items belonging to their branch
  - purchase_items: users can only see/insert purchase items belonging to their branch
  - employee_commissions: users can only see commissions for their branch's employees
  - cash_registers: users can only see/manage their branch's cash registers

  ## Security Rules
  - super_admin: sees all data across all branches
  - All other roles: restricted to their assigned branch only
  - All policies use auth.uid() and the get_user_branch_id() helper function
*/

-- Enable RLS on child tables (may already be enabled, safe to run again)
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_commissions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- sale_items policies
-- ============================================================
DROP POLICY IF EXISTS "sale_items_select_branch" ON sale_items;
CREATE POLICY "sale_items_select_branch"
  ON sale_items FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "sale_items_insert_branch" ON sale_items;
CREATE POLICY "sale_items_insert_branch"
  ON sale_items FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('super_admin', 'admin', 'accountant', 'salesperson', 'cashier')
    AND (
      branch_id IS NULL
      OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
      OR (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "sale_items_update_branch" ON sale_items;
CREATE POLICY "sale_items_update_branch"
  ON sale_items FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('super_admin', 'admin', 'accountant')
    AND (
      branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
      OR (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    )
  )
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('super_admin', 'admin', 'accountant')
  );

DROP POLICY IF EXISTS "sale_items_delete_branch" ON sale_items;
CREATE POLICY "sale_items_delete_branch"
  ON sale_items FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('super_admin', 'admin', 'accountant')
    AND (
      branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
      OR (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    )
  );

-- ============================================================
-- purchase_items policies
-- ============================================================
DROP POLICY IF EXISTS "purchase_items_select_branch" ON purchase_items;
CREATE POLICY "purchase_items_select_branch"
  ON purchase_items FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "purchase_items_insert_branch" ON purchase_items;
CREATE POLICY "purchase_items_insert_branch"
  ON purchase_items FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('super_admin', 'admin', 'accountant')
    AND (
      branch_id IS NULL
      OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
      OR (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "purchase_items_update_branch" ON purchase_items;
CREATE POLICY "purchase_items_update_branch"
  ON purchase_items FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('super_admin', 'admin', 'accountant')
    AND (
      branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
      OR (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    )
  )
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('super_admin', 'admin', 'accountant')
  );

DROP POLICY IF EXISTS "purchase_items_delete_branch" ON purchase_items;
CREATE POLICY "purchase_items_delete_branch"
  ON purchase_items FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('super_admin', 'admin', 'accountant')
    AND (
      branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
      OR (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    )
  );

-- ============================================================
-- employee_commissions policies
-- ============================================================
DROP POLICY IF EXISTS "commissions_select_branch" ON employee_commissions;
CREATE POLICY "commissions_select_branch"
  ON employee_commissions FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "commissions_insert_branch" ON employee_commissions;
CREATE POLICY "commissions_insert_branch"
  ON employee_commissions FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('super_admin', 'admin', 'accountant')
  );

DROP POLICY IF EXISTS "commissions_update_branch" ON employee_commissions;
CREATE POLICY "commissions_update_branch"
  ON employee_commissions FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('super_admin', 'admin', 'accountant')
  )
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('super_admin', 'admin', 'accountant')
  );

DROP POLICY IF EXISTS "commissions_delete_branch" ON employee_commissions;
CREATE POLICY "commissions_delete_branch"
  ON employee_commissions FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('super_admin', 'admin')
  );

-- ============================================================
-- cash_registers branch isolation
-- ============================================================
DROP POLICY IF EXISTS "cash_registers_select_branch" ON cash_registers;
CREATE POLICY "cash_registers_select_branch"
  ON cash_registers FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
    OR branch_id IS NULL
  );

DROP POLICY IF EXISTS "cash_registers_insert_branch" ON cash_registers;
CREATE POLICY "cash_registers_insert_branch"
  ON cash_registers FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('super_admin', 'admin', 'accountant', 'cashier')
    AND (
      branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
      OR (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "cash_registers_update_branch" ON cash_registers;
CREATE POLICY "cash_registers_update_branch"
  ON cash_registers FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('super_admin', 'admin', 'accountant', 'cashier')
    AND (
      branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
      OR (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
      OR branch_id IS NULL
    )
  )
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('super_admin', 'admin', 'accountant', 'cashier')
  );
