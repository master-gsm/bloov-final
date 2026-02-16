/*
  # Optimize RLS Policies for Employees and Accounting Tables

  1. Performance Improvements
    - Replace auth.uid() with (select auth.uid()) in all RLS policies
    - Covers: employees, compensation_plans, payroll, journal entries, etc.

  2. Tables Optimized
    - employees, compensation_plans, payroll_runs, payroll_lines
    - employee_commissions, commission_accruals, salary_payments
    - chart_of_accounts, journal_entries, journal_entry_lines
    - customer_payments, supplier_payments, accounting_periods
    - audit_log, audit_logs
*/

-- Employees table
DROP POLICY IF EXISTS "Admin and Accountant can manage employees" ON employees;
CREATE POLICY "Admin and Accountant can manage employees" ON employees
  FOR ALL
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  )
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Admin and Accountant can view employees" ON employees;
DROP POLICY IF EXISTS "Admin and accountant access employees" ON employees;
DROP POLICY IF EXISTS "Admins and Accountants can view all employees" ON employees;
DROP POLICY IF EXISTS "Admins can view all employees" ON employees;
DROP POLICY IF EXISTS "Admins can delete employees" ON employees;
DROP POLICY IF EXISTS "Admins can insert employees" ON employees;
DROP POLICY IF EXISTS "Admins can update employees" ON employees;
DROP POLICY IF EXISTS "Observer can view employees" ON employees;

CREATE POLICY "Admin and accountant access employees" ON employees
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'observer', 'super_admin')
    )
  );

-- Compensation plans table
DROP POLICY IF EXISTS "Admin and Accountant can manage compensation plans" ON compensation_plans;
DROP POLICY IF EXISTS "Admin and Accountant can view compensation plans" ON compensation_plans;
DROP POLICY IF EXISTS "Admin and accountant access compensation" ON compensation_plans;
DROP POLICY IF EXISTS "Admins and Accountants can view all compensation plans" ON compensation_plans;
DROP POLICY IF EXISTS "Observer can view compensation plans" ON compensation_plans;

CREATE POLICY "Admin and accountant manage compensation" ON compensation_plans
  FOR ALL
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  )
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

CREATE POLICY "Observer can view compensation" ON compensation_plans
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'observer', 'super_admin')
    )
  );

-- Employee commissions table
DROP POLICY IF EXISTS "Admin and accountant access commissions" ON employee_commissions;
DROP POLICY IF EXISTS "Admins and Accountants can view all commissions" ON employee_commissions;
DROP POLICY IF EXISTS "Admins can view all employee commissions" ON employee_commissions;
DROP POLICY IF EXISTS "Admins can insert employee commissions" ON employee_commissions;
DROP POLICY IF EXISTS "Admins can update employee commissions" ON employee_commissions;

CREATE POLICY "Admin and accountant access commissions" ON employee_commissions
  FOR ALL
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  )
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

-- Commission accruals table
DROP POLICY IF EXISTS "Admin and Accountant can view commissions" ON commission_accruals;
CREATE POLICY "Admin and Accountant can view commissions" ON commission_accruals
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'observer', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Admin and Accountant can update commissions" ON commission_accruals;
CREATE POLICY "Admin and Accountant can update commissions" ON commission_accruals
  FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Observer can view commissions" ON commission_accruals;

-- Payroll runs table
DROP POLICY IF EXISTS "Admin and Accountant can manage payroll runs" ON payroll_runs;
DROP POLICY IF EXISTS "Admin and accountant access payroll_runs" ON payroll_runs;
DROP POLICY IF EXISTS "Admins and Accountants can view all payroll runs" ON payroll_runs;
DROP POLICY IF EXISTS "Observer can view payroll runs" ON payroll_runs;

CREATE POLICY "Admin and accountant manage payroll" ON payroll_runs
  FOR ALL
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  )
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

CREATE POLICY "Observer can view payroll" ON payroll_runs
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'observer', 'super_admin')
    )
  );

-- Payroll lines table
DROP POLICY IF EXISTS "Admin and Accountant can manage payroll lines" ON payroll_lines;
DROP POLICY IF EXISTS "Observer can view payroll lines" ON payroll_lines;

CREATE POLICY "Admin and accountant manage payroll lines" ON payroll_lines
  FOR ALL
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  )
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

CREATE POLICY "Observer can view payroll lines" ON payroll_lines
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'observer', 'super_admin')
    )
  );

-- Salary payments table
DROP POLICY IF EXISTS "Admins can view all salary payments" ON salary_payments;
CREATE POLICY "Admins can view all salary payments" ON salary_payments
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'observer', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Admins can insert salary payments" ON salary_payments;
CREATE POLICY "Admins can insert salary payments" ON salary_payments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Admins can update salary payments" ON salary_payments;
CREATE POLICY "Admins can update salary payments" ON salary_payments
  FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  );

-- Chart of accounts table
DROP POLICY IF EXISTS "Observer can view chart of accounts" ON chart_of_accounts;
CREATE POLICY "Observer can view chart of accounts" ON chart_of_accounts
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'observer', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "manage_coa" ON chart_of_accounts;
CREATE POLICY "manage_coa" ON chart_of_accounts
  FOR ALL
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  )
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

-- Journal entries table
DROP POLICY IF EXISTS "Observer can view journal entries" ON journal_entries;
CREATE POLICY "Observer can view journal entries" ON journal_entries
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'observer', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "create_je" ON journal_entries;
CREATE POLICY "create_je" ON journal_entries
  FOR ALL
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  )
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

-- Journal entry lines table
DROP POLICY IF EXISTS "Observer can view journal entry lines" ON journal_entry_lines;
CREATE POLICY "Observer can view journal entry lines" ON journal_entry_lines
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'observer', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "manage_jel" ON journal_entry_lines;
CREATE POLICY "manage_jel" ON journal_entry_lines
  FOR ALL
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  )
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

-- Customer payments table
DROP POLICY IF EXISTS "manage_cp" ON customer_payments;
CREATE POLICY "manage_cp" ON customer_payments
  FOR ALL
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  )
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

-- Supplier payments table
DROP POLICY IF EXISTS "manage_sp" ON supplier_payments;
CREATE POLICY "manage_sp" ON supplier_payments
  FOR ALL
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  )
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

-- Accounting periods table
DROP POLICY IF EXISTS "manage_periods" ON accounting_periods;
CREATE POLICY "manage_periods" ON accounting_periods
  FOR ALL
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  )
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

-- Audit log table
DROP POLICY IF EXISTS "Admin and Super Admin can view audit log" ON audit_log;
CREATE POLICY "Admin and Super Admin can view audit log" ON audit_log
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  );

-- Audit logs table
DROP POLICY IF EXISTS "Admins and accountants can view all audit logs" ON audit_logs;
CREATE POLICY "Admins and accountants can view all audit logs" ON audit_logs
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Only admins can insert audit logs" ON audit_logs;
CREATE POLICY "Only admins can insert audit logs" ON audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  );