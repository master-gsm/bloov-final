/*
  # Fix Users with NULL branch_id — Safe Migration

  ## Problem
  Users with branch_id = NULL cannot see any data because:
    branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
    evaluates to: branch_id = NULL → matches nothing in SQL

  ## Solution
  1. Temporarily disable the branch-change trigger
  2. Assign Main Branch to all users who have branch_id = NULL
  3. Re-enable the trigger
  4. Update SELECT policies to handle edge cases properly

  ## Safety
  - Trigger only blocks non-admin users from changing their OWN branch
  - This migration runs as service role (bypasses RLS) but trigger fires
  - We disable trigger only during this migration
*/

-- Temporarily disable the trigger so service role migration can assign branches
ALTER TABLE users DISABLE TRIGGER trg_prevent_self_branch_change;

-- Assign Main Branch to all users with NULL branch_id
UPDATE users
SET branch_id = (
  SELECT id FROM branches WHERE code = 'MAIN' LIMIT 1
)
WHERE branch_id IS NULL;

-- Re-enable the trigger
ALTER TABLE users ENABLE TRIGGER trg_prevent_self_branch_change;

-- Now fix the SELECT policies to be robust

-- SALES
DROP POLICY IF EXISTS "sales_select_policy" ON sales;

CREATE POLICY "sales_select_policy"
  ON sales FOR SELECT
  TO authenticated
  USING (
    (is_deleted = false)
    AND (
      EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = auth.uid()
          AND u.role IN ('admin', 'observer')
      )
      OR branch_id = (
        SELECT u.branch_id FROM users u WHERE u.id = auth.uid()
      )
    )
  );

-- PURCHASES
DROP POLICY IF EXISTS "purchases_select_policy" ON purchases;

CREATE POLICY "purchases_select_policy"
  ON purchases FOR SELECT
  TO authenticated
  USING (
    (is_deleted = false)
    AND (
      EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = auth.uid()
          AND u.role IN ('admin', 'observer')
      )
      OR branch_id = (SELECT u.branch_id FROM users u WHERE u.id = auth.uid())
    )
  );

-- OPERATING_EXPENSES
DROP POLICY IF EXISTS "opex_select_policy" ON operating_expenses;

CREATE POLICY "opex_select_policy"
  ON operating_expenses FOR SELECT
  TO authenticated
  USING (
    (is_deleted = false)
    AND (
      EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = auth.uid()
          AND u.role IN ('admin', 'observer')
      )
      OR branch_id = (SELECT u.branch_id FROM users u WHERE u.id = auth.uid())
    )
  );

-- INVENTORY
DROP POLICY IF EXISTS "inventory_select_policy" ON inventory;

CREATE POLICY "inventory_select_policy"
  ON inventory FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'observer')
    )
    OR branch_id = (SELECT u.branch_id FROM users u WHERE u.id = auth.uid())
  );

-- CASH_TRANSACTIONS
DROP POLICY IF EXISTS "cash_transactions_select_policy" ON cash_transactions;

CREATE POLICY "cash_transactions_select_policy"
  ON cash_transactions FOR SELECT
  TO authenticated
  USING (
    (is_deleted = false)
    AND (
      EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = auth.uid()
          AND u.role IN ('admin', 'observer')
      )
      OR branch_id = (SELECT u.branch_id FROM users u WHERE u.id = auth.uid())
    )
  );

-- CASH_SHIFTS
DROP POLICY IF EXISTS "cash_shifts_select_policy" ON cash_shifts;

CREATE POLICY "cash_shifts_select_policy"
  ON cash_shifts FOR SELECT
  TO authenticated
  USING (
    (is_deleted = false)
    AND (
      EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = auth.uid()
          AND u.role IN ('admin', 'observer')
      )
      OR branch_id = (SELECT u.branch_id FROM users u WHERE u.id = auth.uid())
    )
  );

-- EMPLOYEES
DROP POLICY IF EXISTS "employees_select_policy" ON employees;

CREATE POLICY "employees_select_policy"
  ON employees FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'observer')
    )
    OR branch_id = (SELECT u.branch_id FROM users u WHERE u.id = auth.uid())
  );
