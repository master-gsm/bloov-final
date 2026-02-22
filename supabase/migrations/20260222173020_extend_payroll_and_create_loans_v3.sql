/*
  # Extend Payroll Tables + Create Employee Loans

  ## Summary
  - payroll_runs already exists (period_year, period_month, branch_id)
  - payroll_items already exists (payroll_run_id, employee_id, base_salary, etc.)
  - Add missing columns to both tables for full payroll engine
  - Create employee_loans table
  - Add RLS to payroll tables
*/

-- ─────────────────────────────────────────────
-- 1. Extend payroll_runs
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='total_base_salary') THEN
    ALTER TABLE payroll_runs ADD COLUMN total_base_salary numeric(15,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='total_loan_deductions') THEN
    ALTER TABLE payroll_runs ADD COLUMN total_loan_deductions numeric(15,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='payment_method') THEN
    ALTER TABLE payroll_runs ADD COLUMN payment_method text DEFAULT 'bank_transfer';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='approved_by') THEN
    ALTER TABLE payroll_runs ADD COLUMN approved_by uuid REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='approved_at') THEN
    ALTER TABLE payroll_runs ADD COLUMN approved_at timestamptz;
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 2. Extend payroll_items
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_items' AND column_name='loan_deduction') THEN
    ALTER TABLE payroll_items ADD COLUMN loan_deduction numeric(15,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_items' AND column_name='unpaid_leave_deduction') THEN
    ALTER TABLE payroll_items ADD COLUMN unpaid_leave_deduction numeric(15,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_items' AND column_name='commission_amount') THEN
    ALTER TABLE payroll_items ADD COLUMN commission_amount numeric(15,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_items' AND column_name='net_salary') THEN
    ALTER TABLE payroll_items ADD COLUMN net_salary numeric(15,2) DEFAULT 0;
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 3. RLS for payroll tables
-- ─────────────────────────────────────────────
ALTER TABLE payroll_runs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "HR can view payroll_runs"   ON payroll_runs;
DROP POLICY IF EXISTS "HR can insert payroll_runs"  ON payroll_runs;
DROP POLICY IF EXISTS "HR can update payroll_runs"  ON payroll_runs;

CREATE POLICY "HR can view payroll_runs"
  ON payroll_runs FOR SELECT TO authenticated
  USING ((SELECT role FROM users WHERE id = auth.uid()) IN ('admin','accountant','observer','super_admin'));

CREATE POLICY "HR can insert payroll_runs"
  ON payroll_runs FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM users WHERE id = auth.uid()) IN ('admin','accountant','super_admin'));

CREATE POLICY "HR can update payroll_runs"
  ON payroll_runs FOR UPDATE TO authenticated
  USING ((SELECT role FROM users WHERE id = auth.uid()) IN ('admin','accountant','super_admin'))
  WITH CHECK ((SELECT role FROM users WHERE id = auth.uid()) IN ('admin','accountant','super_admin'));

DROP POLICY IF EXISTS "HR can view payroll_items"   ON payroll_items;
DROP POLICY IF EXISTS "HR can insert payroll_items"  ON payroll_items;
DROP POLICY IF EXISTS "HR can update payroll_items"  ON payroll_items;
DROP POLICY IF EXISTS "HR can delete payroll_items"  ON payroll_items;

CREATE POLICY "HR can view payroll_items"
  ON payroll_items FOR SELECT TO authenticated
  USING ((SELECT role FROM users WHERE id = auth.uid()) IN ('admin','accountant','observer','super_admin'));

CREATE POLICY "HR can insert payroll_items"
  ON payroll_items FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM users WHERE id = auth.uid()) IN ('admin','accountant','super_admin'));

CREATE POLICY "HR can update payroll_items"
  ON payroll_items FOR UPDATE TO authenticated
  USING ((SELECT role FROM users WHERE id = auth.uid()) IN ('admin','accountant','super_admin'))
  WITH CHECK ((SELECT role FROM users WHERE id = auth.uid()) IN ('admin','accountant','super_admin'));

CREATE POLICY "HR can delete payroll_items"
  ON payroll_items FOR DELETE TO authenticated
  USING ((SELECT role FROM users WHERE id = auth.uid()) IN ('admin','accountant','super_admin'));

-- ─────────────────────────────────────────────
-- 4. employee_loans
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_loans (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  branch_id           uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  loan_amount         numeric(15,2) NOT NULL CHECK (loan_amount > 0),
  monthly_deduction   numeric(15,2) NOT NULL CHECK (monthly_deduction > 0),
  remaining_balance   numeric(15,2) NOT NULL DEFAULT 0,
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
  notes               text,
  created_by          uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_loans_employee ON employee_loans(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_loans_status   ON employee_loans(status);

ALTER TABLE employee_loans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR can view loans"
  ON employee_loans FOR SELECT TO authenticated
  USING ((SELECT role FROM users WHERE id = auth.uid()) IN ('admin','accountant','observer','super_admin'));

CREATE POLICY "HR can insert loans"
  ON employee_loans FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM users WHERE id = auth.uid()) IN ('admin','accountant','super_admin'));

CREATE POLICY "HR can update loans"
  ON employee_loans FOR UPDATE TO authenticated
  USING ((SELECT role FROM users WHERE id = auth.uid()) IN ('admin','accountant','super_admin'))
  WITH CHECK ((SELECT role FROM users WHERE id = auth.uid()) IN ('admin','accountant','super_admin'));

CREATE POLICY "HR can delete loans"
  ON employee_loans FOR DELETE TO authenticated
  USING ((SELECT role FROM users WHERE id = auth.uid()) IN ('admin','accountant','super_admin'));
