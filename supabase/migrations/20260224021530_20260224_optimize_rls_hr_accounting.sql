/*
  # Optimize RLS in HR and Accounting Tables

  Performance optimization for:
  - employee_leaves
  - employee_settlements
  - employee_loans
  - payroll_runs, payroll_items
  - bank account and reconciliation tables
*/

-- employee_leaves table
DROP POLICY IF EXISTS "HR managers can delete leaves" ON public.employee_leaves;
DROP POLICY IF EXISTS "HR managers can insert leaves" ON public.employee_leaves;
DROP POLICY IF EXISTS "HR managers can update leaves" ON public.employee_leaves;
DROP POLICY IF EXISTS "HR managers can view leaves" ON public.employee_leaves;

CREATE POLICY "HR managers can delete leaves"
  ON public.employee_leaves
  FOR DELETE
  TO authenticated
  USING (
    (SELECT get_user_role()) IN ('admin', 'hr_manager')
  );

CREATE POLICY "HR managers can insert leaves"
  ON public.employee_leaves
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT get_user_role()) IN ('admin', 'hr_manager')
  );

CREATE POLICY "HR managers can update leaves"
  ON public.employee_leaves
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT get_user_role()) IN ('admin', 'hr_manager')
  )
  WITH CHECK (
    (SELECT get_user_role()) IN ('admin', 'hr_manager')
  );

CREATE POLICY "HR managers can view leaves"
  ON public.employee_leaves
  FOR SELECT
  TO authenticated
  USING (
    (SELECT get_user_role()) IN ('admin', 'hr_manager', 'accountant')
  );

-- employee_settlements table
DROP POLICY IF EXISTS "HR managers can delete settlements" ON public.employee_settlements;
DROP POLICY IF EXISTS "HR managers can insert settlements" ON public.employee_settlements;
DROP POLICY IF EXISTS "HR managers can update settlements" ON public.employee_settlements;
DROP POLICY IF EXISTS "HR managers can view settlements" ON public.employee_settlements;

CREATE POLICY "HR managers can delete settlements"
  ON public.employee_settlements
  FOR DELETE
  TO authenticated
  USING (
    (SELECT get_user_role()) IN ('admin', 'hr_manager')
  );

CREATE POLICY "HR managers can insert settlements"
  ON public.employee_settlements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT get_user_role()) IN ('admin', 'hr_manager')
  );

CREATE POLICY "HR managers can update settlements"
  ON public.employee_settlements
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT get_user_role()) IN ('admin', 'hr_manager')
  )
  WITH CHECK (
    (SELECT get_user_role()) IN ('admin', 'hr_manager')
  );

CREATE POLICY "HR managers can view settlements"
  ON public.employee_settlements
  FOR SELECT
  TO authenticated
  USING (
    (SELECT get_user_role()) IN ('admin', 'hr_manager', 'accountant')
  );

-- employee_loans table
DROP POLICY IF EXISTS "HR can delete loans" ON public.employee_loans;
DROP POLICY IF EXISTS "HR can insert loans" ON public.employee_loans;
DROP POLICY IF EXISTS "HR can update loans" ON public.employee_loans;
DROP POLICY IF EXISTS "HR can view loans" ON public.employee_loans;

CREATE POLICY "HR can delete loans"
  ON public.employee_loans
  FOR DELETE
  TO authenticated
  USING (
    (SELECT get_user_role()) IN ('admin', 'hr_manager')
  );

CREATE POLICY "HR can insert loans"
  ON public.employee_loans
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT get_user_role()) IN ('admin', 'hr_manager')
  );

CREATE POLICY "HR can update loans"
  ON public.employee_loans
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT get_user_role()) IN ('admin', 'hr_manager')
  )
  WITH CHECK (
    (SELECT get_user_role()) IN ('admin', 'hr_manager')
  );

CREATE POLICY "HR can view loans"
  ON public.employee_loans
  FOR SELECT
  TO authenticated
  USING (
    (SELECT get_user_role()) IN ('admin', 'hr_manager', 'accountant')
  );

-- payroll_runs table
DROP POLICY IF EXISTS "HR can insert payroll_runs" ON public.payroll_runs;
DROP POLICY IF EXISTS "HR can update payroll_runs" ON public.payroll_runs;
DROP POLICY IF EXISTS "HR can view payroll_runs" ON public.payroll_runs;

CREATE POLICY "HR can insert payroll_runs"
  ON public.payroll_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT get_user_role()) IN ('admin', 'hr_manager')
  );

CREATE POLICY "HR can update payroll_runs"
  ON public.payroll_runs
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT get_user_role()) IN ('admin', 'hr_manager')
  )
  WITH CHECK (
    (SELECT get_user_role()) IN ('admin', 'hr_manager')
  );

CREATE POLICY "HR can view payroll_runs"
  ON public.payroll_runs
  FOR SELECT
  TO authenticated
  USING (
    (SELECT get_user_role()) IN ('admin', 'hr_manager', 'accountant')
  );

-- payroll_items table
DROP POLICY IF EXISTS "Admins and Accountants can view all payroll items" ON public.payroll_items;
DROP POLICY IF EXISTS "HR can delete payroll_items" ON public.payroll_items;
DROP POLICY IF EXISTS "HR can insert payroll_items" ON public.payroll_items;
DROP POLICY IF EXISTS "HR can update payroll_items" ON public.payroll_items;
DROP POLICY IF EXISTS "HR can view payroll_items" ON public.payroll_items;

CREATE POLICY "Admins and Accountants can view all payroll items"
  ON public.payroll_items
  FOR SELECT
  TO authenticated
  USING (
    (SELECT get_user_role()) IN ('admin', 'accountant')
  );

CREATE POLICY "HR can delete payroll_items"
  ON public.payroll_items
  FOR DELETE
  TO authenticated
  USING (
    (SELECT get_user_role()) IN ('admin', 'hr_manager')
  );

CREATE POLICY "HR can insert payroll_items"
  ON public.payroll_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT get_user_role()) IN ('admin', 'hr_manager')
  );

CREATE POLICY "HR can update payroll_items"
  ON public.payroll_items
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT get_user_role()) IN ('admin', 'hr_manager')
  )
  WITH CHECK (
    (SELECT get_user_role()) IN ('admin', 'hr_manager')
  );

CREATE POLICY "HR can view payroll_items"
  ON public.payroll_items
  FOR SELECT
  TO authenticated
  USING (
    (SELECT get_user_role()) IN ('admin', 'hr_manager')
  );

-- bank_accounts table
DROP POLICY IF EXISTS "Admins can insert bank_accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "Admins can update bank_accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "Branch members can view bank_accounts" ON public.bank_accounts;

CREATE POLICY "Admins can insert bank_accounts"
  ON public.bank_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT get_user_role()) IN ('admin', 'accountant')
  );

CREATE POLICY "Admins can update bank_accounts"
  ON public.bank_accounts
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT get_user_role()) IN ('admin', 'accountant')
  )
  WITH CHECK (
    (SELECT get_user_role()) IN ('admin', 'accountant')
  );

CREATE POLICY "Branch members can view bank_accounts"
  ON public.bank_accounts
  FOR SELECT
  TO authenticated
  USING (
    branch_id = (SELECT get_user_branch_id()) OR
    (SELECT get_user_role()) IN ('admin', 'accountant')
  );

-- bank_reconciliations table
DROP POLICY IF EXISTS "Admins can insert bank_reconciliations" ON public.bank_reconciliations;
DROP POLICY IF EXISTS "Admins can update bank_reconciliations" ON public.bank_reconciliations;
DROP POLICY IF EXISTS "Branch members can view bank_reconciliations" ON public.bank_reconciliations;

CREATE POLICY "Admins can insert bank_reconciliations"
  ON public.bank_reconciliations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT get_user_role()) IN ('admin', 'accountant')
  );

CREATE POLICY "Admins can update bank_reconciliations"
  ON public.bank_reconciliations
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT get_user_role()) IN ('admin', 'accountant')
  )
  WITH CHECK (
    (SELECT get_user_role()) IN ('admin', 'accountant')
  );

CREATE POLICY "Branch members can view bank_reconciliations"
  ON public.bank_reconciliations
  FOR SELECT
  TO authenticated
  USING (
    (SELECT get_user_role()) IN ('admin', 'accountant')
  );
