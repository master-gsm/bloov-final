/*
  # Complete Branch Isolation — Single Branch Assignment Model

  ## Overview
  Enforce clean single-branch-per-user isolation. No super_admin references.
  The highest role is 'admin'. All RLS policies use the users table via auth.uid().

  ## Tables covered
  - users: protect branch_id from self-change + clean RLS
  - sales, purchases, operating_expenses, inventory: clean branch-scoped policies
  - cash_transactions, cash_shifts, employees: clean branch-scoped policies

  ## Security
  - admin + observer: can see all branches
  - all other roles: see only their assigned branch
  - Only admin can move a user to another branch
*/

-- ============================================================
-- PART 1: USERS TABLE — branch_id protection trigger
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_self_branch_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
BEGIN
  SELECT role INTO caller_role FROM users WHERE id = auth.uid();
  IF OLD.branch_id IS DISTINCT FROM NEW.branch_id THEN
    IF caller_role IS NULL OR caller_role <> 'admin' THEN
      RAISE EXCEPTION 'Only admin can change branch assignment';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_self_branch_change ON users;
CREATE TRIGGER trg_prevent_self_branch_change
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION prevent_self_branch_change();

-- Rebuild users RLS from scratch
DROP POLICY IF EXISTS "Allow all authenticated users to view users"       ON users;
DROP POLICY IF EXISTS "Admins can view all users"                          ON users;
DROP POLICY IF EXISTS "Users can view own profile"                         ON users;
DROP POLICY IF EXISTS "Users can update own profile or admin updates any"  ON users;
DROP POLICY IF EXISTS "Allow service role to insert users"                 ON users;
DROP POLICY IF EXISTS "Allow service role to delete users"                 ON users;
DROP POLICY IF EXISTS "users_select_policy"                                ON users;
DROP POLICY IF EXISTS "users_insert_service_role"                          ON users;
DROP POLICY IF EXISTS "users_update_policy"                                ON users;
DROP POLICY IF EXISTS "users_delete_policy"                                ON users;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_policy"
  ON users FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM users u2
      WHERE u2.id = auth.uid()
        AND u2.role IN ('admin', 'observer')
    )
    OR branch_id = (SELECT u3.branch_id FROM users u3 WHERE u3.id = auth.uid())
  );

CREATE POLICY "users_insert_policy"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "users_update_policy"
  ON users FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM users u2
      WHERE u2.id = auth.uid()
        AND u2.role = 'admin'
    )
  )
  WITH CHECK (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM users u2
      WHERE u2.id = auth.uid()
        AND u2.role = 'admin'
    )
  );

CREATE POLICY "users_delete_policy"
  ON users FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u2
      WHERE u2.id = auth.uid()
        AND u2.role = 'admin'
    )
  );

-- ============================================================
-- PART 2: SALES
-- ============================================================

DROP POLICY IF EXISTS "Admin can select sales"          ON sales;
DROP POLICY IF EXISTS "Admin can insert sales"          ON sales;
DROP POLICY IF EXISTS "Admin can update sales"          ON sales;
DROP POLICY IF EXISTS "Only draft sales can be deleted" ON sales;
DROP POLICY IF EXISTS "Authenticated users can view sales" ON sales;
DROP POLICY IF EXISTS "soft_delete_filter_sales"        ON sales;
DROP POLICY IF EXISTS "soft_delete_filter_update_sales" ON sales;
DROP POLICY IF EXISTS "sales_select_policy"             ON sales;
DROP POLICY IF EXISTS "sales_insert_policy"             ON sales;
DROP POLICY IF EXISTS "sales_update_policy"             ON sales;
DROP POLICY IF EXISTS "sales_delete_policy"             ON sales;

ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_select_policy"
  ON sales FOR SELECT
  TO authenticated
  USING (
    (is_deleted = false)
    AND (
      EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin','observer'))
      OR branch_id = (SELECT u.branch_id FROM users u WHERE u.id = auth.uid())
    )
  );

CREATE POLICY "sales_insert_policy"
  ON sales FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin','accountant','employee','manager')
    )
  );

CREATE POLICY "sales_update_policy"
  ON sales FOR UPDATE
  TO authenticated
  USING (
    (is_deleted = false)
    AND (
      EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin','accountant'))
      OR branch_id = (SELECT u.branch_id FROM users u WHERE u.id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin','accountant'))
    OR branch_id = (SELECT u.branch_id FROM users u WHERE u.id = auth.uid())
  );

CREATE POLICY "sales_delete_policy"
  ON sales FOR DELETE
  TO authenticated
  USING (
    status = 'draft'
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin','accountant')
    )
  );

-- ============================================================
-- PART 3: PURCHASES
-- ============================================================

DROP POLICY IF EXISTS "Admins can insert purchases"                  ON purchases;
DROP POLICY IF EXISTS "Admins can update purchases"                  ON purchases;
DROP POLICY IF EXISTS "Admins can delete purchases"                  ON purchases;
DROP POLICY IF EXISTS "Authenticated users can view purchases"       ON purchases;
DROP POLICY IF EXISTS "Users can view purchases from their branch"   ON purchases;
DROP POLICY IF EXISTS "soft_delete_filter_purchases"                 ON purchases;
DROP POLICY IF EXISTS "soft_delete_filter_update_purchases"          ON purchases;
DROP POLICY IF EXISTS "purchases_select_policy"                      ON purchases;
DROP POLICY IF EXISTS "purchases_insert_policy"                      ON purchases;
DROP POLICY IF EXISTS "purchases_update_policy"                      ON purchases;
DROP POLICY IF EXISTS "purchases_delete_policy"                      ON purchases;

ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchases_select_policy"
  ON purchases FOR SELECT
  TO authenticated
  USING (
    (is_deleted = false)
    AND (
      EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin','observer'))
      OR branch_id = (SELECT u.branch_id FROM users u WHERE u.id = auth.uid())
    )
  );

CREATE POLICY "purchases_insert_policy"
  ON purchases FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin','accountant')
    )
  );

CREATE POLICY "purchases_update_policy"
  ON purchases FOR UPDATE
  TO authenticated
  USING (
    (is_deleted = false)
    AND EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin','accountant'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin','accountant'))
  );

CREATE POLICY "purchases_delete_policy"
  ON purchases FOR DELETE
  TO authenticated
  USING (
    (is_deleted = false)
    AND EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin','accountant'))
  );

-- ============================================================
-- PART 4: OPERATING_EXPENSES
-- ============================================================

DROP POLICY IF EXISTS "Admin and accountant can insert operating expenses"  ON operating_expenses;
DROP POLICY IF EXISTS "Users can insert expenses for their branch"          ON operating_expenses;
DROP POLICY IF EXISTS "Admin and accountant can update operating expenses"  ON operating_expenses;
DROP POLICY IF EXISTS "Users can update their branch expenses"              ON operating_expenses;
DROP POLICY IF EXISTS "Admin can delete operating expenses"                 ON operating_expenses;
DROP POLICY IF EXISTS "Users can delete their branch expenses"              ON operating_expenses;
DROP POLICY IF EXISTS "Authenticated users can view operating expenses"     ON operating_expenses;
DROP POLICY IF EXISTS "Users can view operating expenses in their branch"   ON operating_expenses;
DROP POLICY IF EXISTS "Users can view their branch expenses"                ON operating_expenses;
DROP POLICY IF EXISTS "soft_delete_filter_operating_expenses"               ON operating_expenses;
DROP POLICY IF EXISTS "soft_delete_filter_update_operating_expenses"        ON operating_expenses;
DROP POLICY IF EXISTS "opex_select_policy"                                  ON operating_expenses;
DROP POLICY IF EXISTS "opex_insert_policy"                                  ON operating_expenses;
DROP POLICY IF EXISTS "opex_update_policy"                                  ON operating_expenses;
DROP POLICY IF EXISTS "opex_delete_policy"                                  ON operating_expenses;

ALTER TABLE operating_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "opex_select_policy"
  ON operating_expenses FOR SELECT
  TO authenticated
  USING (
    (is_deleted = false)
    AND (
      EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin','observer'))
      OR branch_id = (SELECT u.branch_id FROM users u WHERE u.id = auth.uid())
    )
  );

CREATE POLICY "opex_insert_policy"
  ON operating_expenses FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin','accountant')
    )
  );

CREATE POLICY "opex_update_policy"
  ON operating_expenses FOR UPDATE
  TO authenticated
  USING (
    (is_deleted = false)
    AND EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin','accountant'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin','accountant'))
  );

CREATE POLICY "opex_delete_policy"
  ON operating_expenses FOR DELETE
  TO authenticated
  USING (
    (is_deleted = false)
    AND EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- ============================================================
-- PART 5: INVENTORY
-- ============================================================

DROP POLICY IF EXISTS "Users can insert inventory for their branch"  ON inventory;
DROP POLICY IF EXISTS "Users can update their branch inventory"      ON inventory;
DROP POLICY IF EXISTS "Users can delete their branch inventory"      ON inventory;
DROP POLICY IF EXISTS "Users can view inventory in their branch"     ON inventory;
DROP POLICY IF EXISTS "Users can view their branch inventory"        ON inventory;
DROP POLICY IF EXISTS "inventory_select_policy"                      ON inventory;
DROP POLICY IF EXISTS "inventory_insert_policy"                      ON inventory;
DROP POLICY IF EXISTS "inventory_update_policy"                      ON inventory;
DROP POLICY IF EXISTS "inventory_delete_policy"                      ON inventory;

ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inventory_select_policy"
  ON inventory FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin','observer'))
    OR branch_id = (SELECT u.branch_id FROM users u WHERE u.id = auth.uid())
  );

CREATE POLICY "inventory_insert_policy"
  ON inventory FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin','accountant','manager')
    )
  );

CREATE POLICY "inventory_update_policy"
  ON inventory FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin','accountant','manager'))
    OR branch_id = (SELECT u.branch_id FROM users u WHERE u.id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin','accountant','manager'))
    OR branch_id = (SELECT u.branch_id FROM users u WHERE u.id = auth.uid())
  );

CREATE POLICY "inventory_delete_policy"
  ON inventory FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- ============================================================
-- PART 6: CASH_TRANSACTIONS
-- ============================================================

DROP POLICY IF EXISTS "Admin and accountant can insert cash transactions"      ON cash_transactions;
DROP POLICY IF EXISTS "Users can insert cash transactions for their branch"    ON cash_transactions;
DROP POLICY IF EXISTS "Admin and accountant can update cash transactions"      ON cash_transactions;
DROP POLICY IF EXISTS "Users can update their branch cash transactions"        ON cash_transactions;
DROP POLICY IF EXISTS "Only admin can delete cash transactions"                ON cash_transactions;
DROP POLICY IF EXISTS "Users can delete their branch cash transactions"        ON cash_transactions;
DROP POLICY IF EXISTS "Authenticated users can view cash transactions"         ON cash_transactions;
DROP POLICY IF EXISTS "Users can view cash transactions in their branch"       ON cash_transactions;
DROP POLICY IF EXISTS "Users can view their branch cash transactions"          ON cash_transactions;
DROP POLICY IF EXISTS "soft_delete_filter_cash_transactions"                   ON cash_transactions;
DROP POLICY IF EXISTS "soft_delete_filter_update_cash_transactions"            ON cash_transactions;
DROP POLICY IF EXISTS "cash_transactions_select_policy"                        ON cash_transactions;
DROP POLICY IF EXISTS "cash_transactions_insert_policy"                        ON cash_transactions;
DROP POLICY IF EXISTS "cash_transactions_update_policy"                        ON cash_transactions;
DROP POLICY IF EXISTS "cash_transactions_delete_policy"                        ON cash_transactions;

ALTER TABLE cash_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cash_transactions_select_policy"
  ON cash_transactions FOR SELECT
  TO authenticated
  USING (
    (is_deleted = false)
    AND (
      EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin','observer'))
      OR branch_id = (SELECT u.branch_id FROM users u WHERE u.id = auth.uid())
    )
  );

CREATE POLICY "cash_transactions_insert_policy"
  ON cash_transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin','accountant')
    )
  );

CREATE POLICY "cash_transactions_update_policy"
  ON cash_transactions FOR UPDATE
  TO authenticated
  USING (
    (is_deleted = false)
    AND EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin','accountant'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin','accountant'))
  );

CREATE POLICY "cash_transactions_delete_policy"
  ON cash_transactions FOR DELETE
  TO authenticated
  USING (
    (is_deleted = false)
    AND EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- ============================================================
-- PART 7: CASH_SHIFTS
-- ============================================================

DROP POLICY IF EXISTS "Admin and accountant can insert cash shifts"      ON cash_shifts;
DROP POLICY IF EXISTS "Users can insert cash shifts for their branch"    ON cash_shifts;
DROP POLICY IF EXISTS "Admin and accountant can update cash shifts"      ON cash_shifts;
DROP POLICY IF EXISTS "Users can update their branch cash shifts"        ON cash_shifts;
DROP POLICY IF EXISTS "Only admin can delete cash shifts"                ON cash_shifts;
DROP POLICY IF EXISTS "Users can delete their branch cash shifts"        ON cash_shifts;
DROP POLICY IF EXISTS "Authenticated users can view cash shifts"         ON cash_shifts;
DROP POLICY IF EXISTS "Users can view cash shifts in their branch"       ON cash_shifts;
DROP POLICY IF EXISTS "Users can view their branch cash shifts"          ON cash_shifts;
DROP POLICY IF EXISTS "soft_delete_filter_cash_shifts"                   ON cash_shifts;
DROP POLICY IF EXISTS "soft_delete_filter_update_cash_shifts"            ON cash_shifts;
DROP POLICY IF EXISTS "cash_shifts_select_policy"                        ON cash_shifts;
DROP POLICY IF EXISTS "cash_shifts_insert_policy"                        ON cash_shifts;
DROP POLICY IF EXISTS "cash_shifts_update_policy"                        ON cash_shifts;
DROP POLICY IF EXISTS "cash_shifts_delete_policy"                        ON cash_shifts;

ALTER TABLE cash_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cash_shifts_select_policy"
  ON cash_shifts FOR SELECT
  TO authenticated
  USING (
    (is_deleted = false)
    AND (
      EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin','observer'))
      OR branch_id = (SELECT u.branch_id FROM users u WHERE u.id = auth.uid())
    )
  );

CREATE POLICY "cash_shifts_insert_policy"
  ON cash_shifts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin','accountant')
    )
  );

CREATE POLICY "cash_shifts_update_policy"
  ON cash_shifts FOR UPDATE
  TO authenticated
  USING (
    (is_deleted = false)
    AND EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin','accountant'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin','accountant'))
  );

CREATE POLICY "cash_shifts_delete_policy"
  ON cash_shifts FOR DELETE
  TO authenticated
  USING (
    (is_deleted = false)
    AND EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- ============================================================
-- PART 8: EMPLOYEES
-- ============================================================

DROP POLICY IF EXISTS "Admin and Accountant can manage employees" ON employees;
DROP POLICY IF EXISTS "Admin and accountant access employees"      ON employees;
DROP POLICY IF EXISTS "employees_select_policy"                    ON employees;
DROP POLICY IF EXISTS "employees_insert_policy"                    ON employees;
DROP POLICY IF EXISTS "employees_update_policy"                    ON employees;
DROP POLICY IF EXISTS "employees_delete_policy"                    ON employees;

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employees_select_policy"
  ON employees FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin','observer'))
    OR branch_id = (SELECT u.branch_id FROM users u WHERE u.id = auth.uid())
  );

CREATE POLICY "employees_insert_policy"
  ON employees FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin','accountant')
    )
  );

CREATE POLICY "employees_update_policy"
  ON employees FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin','accountant'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin','accountant'))
  );

CREATE POLICY "employees_delete_policy"
  ON employees FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- ============================================================
-- PART 9: INVENTORY_MOVEMENTS — add branch_id column + policies
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_movements' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE inventory_movements
      ADD COLUMN branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
  END IF;
END $$;

DROP POLICY IF EXISTS "Authenticated users can create inventory_movements"  ON inventory_movements;
DROP POLICY IF EXISTS "Authenticated users can view inventory movements"     ON inventory_movements;
DROP POLICY IF EXISTS "Authenticated users can view inventory_movements"     ON inventory_movements;
DROP POLICY IF EXISTS "soft_delete_filter_inventory_movements"               ON inventory_movements;
DROP POLICY IF EXISTS "soft_delete_filter_update_inventory_movements"        ON inventory_movements;
DROP POLICY IF EXISTS "inv_movements_select_policy"                          ON inventory_movements;
DROP POLICY IF EXISTS "inv_movements_insert_policy"                          ON inventory_movements;
DROP POLICY IF EXISTS "inv_movements_update_policy"                          ON inventory_movements;

ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inv_movements_select_policy"
  ON inventory_movements FOR SELECT
  TO authenticated
  USING (
    (is_deleted = false)
    AND (
      EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin','observer'))
      OR branch_id = (SELECT u.branch_id FROM users u WHERE u.id = auth.uid())
      OR branch_id IS NULL
    )
  );

CREATE POLICY "inv_movements_insert_policy"
  ON inventory_movements FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin','accountant','manager','employee')
    )
  );

CREATE POLICY "inv_movements_update_policy"
  ON inventory_movements FOR UPDATE
  TO authenticated
  USING (
    (is_deleted = false)
    AND EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin','accountant'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin','accountant'))
  );
