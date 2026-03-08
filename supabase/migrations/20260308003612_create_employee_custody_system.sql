/*
  # Employee Custody (Petty Cash Advance) System
  
  ## Overview
  This migration creates a complete employee custody management system for tracking
  cash advances given to employees for business expenses.
  
  ## 1. New GL Account
  - `1140` - Employee Custodies (عهد الموظفين) - Asset account
  
  ## 2. New Tables
  - `employee_custodies` - Main custody records (advances given to employees)
  - `custody_settlements` - Settlement transactions against custodies
  
  ## 3. Security
  - RLS enabled on both tables
  - Policies for authenticated users based on branch
  
  ## 4. Accounting Logic
  - Creating custody: Dr. Employee Custodies (1140) / Cr. Cash/Bank/Partner
  - Using custody: Dr. Expense/Purchase/Asset / Cr. Employee Custodies (1140)
  - Returning cash: Dr. Cash (1111) / Cr. Employee Custodies (1140)
  
  ## 5. Views
  - `v_employee_custody_summary` - Summary report per employee
*/

-- 1. Add Employee Custodies GL Account
INSERT INTO accounts (code, name, name_ar, type, parent_id, is_active, is_system)
SELECT '1140', 'Employee Custodies', 'عهد الموظفين', 'Asset', 
       (SELECT id FROM accounts WHERE code = '1100'), true, true
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE code = '1140');

-- 2. Create Employee Custodies Table
CREATE TABLE IF NOT EXISTS employee_custodies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  custody_number TEXT NOT NULL UNIQUE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  
  custody_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  
  funding_source TEXT NOT NULL CHECK (funding_source IN ('cash', 'bank', 'partner')),
  partner_id UUID REFERENCES partners(id) ON DELETE RESTRICT,
  
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank_transfer', 'check')),
  
  description TEXT,
  description_ar TEXT,
  
  total_spent NUMERIC(15, 2) NOT NULL DEFAULT 0,
  total_returned NUMERIC(15, 2) NOT NULL DEFAULT 0,
  remaining_balance NUMERIC(15, 2) GENERATED ALWAYS AS (amount - total_spent - total_returned) STORED,
  
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partial', 'settled', 'cancelled')),
  
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  is_voided BOOLEAN NOT NULL DEFAULT false,
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES users(id),
  void_reason TEXT,
  
  version INTEGER NOT NULL DEFAULT 1,
  
  CONSTRAINT valid_partner_funding CHECK (
    (funding_source = 'partner' AND partner_id IS NOT NULL) OR
    (funding_source != 'partner' AND partner_id IS NULL)
  )
);

-- 3. Create Custody Settlements Table
CREATE TABLE IF NOT EXISTS custody_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  custody_id UUID NOT NULL REFERENCES employee_custodies(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  
  settlement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  settlement_type TEXT NOT NULL CHECK (settlement_type IN ('expense', 'purchase', 'asset', 'cash_return')),
  
  account_code TEXT,
  
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  
  description TEXT,
  description_ar TEXT,
  
  reference_type TEXT CHECK (reference_type IN ('purchases', 'expenses', 'fixed_assets', 'manual')),
  reference_id UUID,
  
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  is_voided BOOLEAN NOT NULL DEFAULT false,
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES users(id),
  void_reason TEXT
);

-- 4. Create indexes
CREATE INDEX IF NOT EXISTS idx_employee_custodies_employee ON employee_custodies(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_custodies_branch ON employee_custodies(branch_id);
CREATE INDEX IF NOT EXISTS idx_employee_custodies_status ON employee_custodies(status);
CREATE INDEX IF NOT EXISTS idx_employee_custodies_date ON employee_custodies(custody_date);
CREATE INDEX IF NOT EXISTS idx_custody_settlements_custody ON custody_settlements(custody_id);
CREATE INDEX IF NOT EXISTS idx_custody_settlements_branch ON custody_settlements(branch_id);
CREATE INDEX IF NOT EXISTS idx_custody_settlements_type ON custody_settlements(settlement_type);

-- 5. Enable RLS
ALTER TABLE employee_custodies ENABLE ROW LEVEL SECURITY;
ALTER TABLE custody_settlements ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for employee_custodies
CREATE POLICY "Users can view custodies in their branch"
  ON employee_custodies FOR SELECT
  TO authenticated
  USING (
    branch_id IN (
      SELECT branch_id FROM users WHERE id = auth.uid()
      UNION
      SELECT id FROM branches WHERE EXISTS (
        SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
      )
    )
  );

CREATE POLICY "Admins and accountants can insert custodies"
  ON employee_custodies FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'super_admin', 'accountant')
    )
  );

CREATE POLICY "Admins and accountants can update custodies"
  ON employee_custodies FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'super_admin', 'accountant')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'super_admin', 'accountant')
    )
  );

-- 7. RLS Policies for custody_settlements
CREATE POLICY "Users can view settlements in their branch"
  ON custody_settlements FOR SELECT
  TO authenticated
  USING (
    branch_id IN (
      SELECT branch_id FROM users WHERE id = auth.uid()
      UNION
      SELECT id FROM branches WHERE EXISTS (
        SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
      )
    )
  );

CREATE POLICY "Admins and accountants can insert settlements"
  ON custody_settlements FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'super_admin', 'accountant')
    )
  );

CREATE POLICY "Admins and accountants can update settlements"
  ON custody_settlements FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'super_admin', 'accountant')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'super_admin', 'accountant')
    )
  );

-- 8. Custody number generation function
CREATE OR REPLACE FUNCTION generate_custody_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year TEXT;
  v_seq INTEGER;
BEGIN
  v_year := TO_CHAR(CURRENT_DATE, 'YYYY');
  
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(custody_number FROM 'CUS-' || v_year || '-(\d+)') AS INTEGER)
  ), 0) + 1
  INTO v_seq
  FROM employee_custodies
  WHERE custody_number LIKE 'CUS-' || v_year || '-%';
  
  NEW.custody_number := 'CUS-' || v_year || '-' || LPAD(v_seq::TEXT, 4, '0');
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_custody_number ON employee_custodies;
CREATE TRIGGER trg_generate_custody_number
  BEFORE INSERT ON employee_custodies
  FOR EACH ROW
  WHEN (NEW.custody_number IS NULL OR NEW.custody_number = '')
  EXECUTE FUNCTION generate_custody_number();

-- 9. Update custody totals function
CREATE OR REPLACE FUNCTION update_custody_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_spent NUMERIC(15, 2);
  v_returned NUMERIC(15, 2);
  v_original NUMERIC(15, 2);
  v_new_status TEXT;
  v_custody_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_custody_id := OLD.custody_id;
  ELSE
    v_custody_id := NEW.custody_id;
  END IF;
  
  SELECT 
    COALESCE(SUM(CASE WHEN settlement_type != 'cash_return' AND NOT is_voided THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN settlement_type = 'cash_return' AND NOT is_voided THEN amount ELSE 0 END), 0)
  INTO v_spent, v_returned
  FROM custody_settlements
  WHERE custody_id = v_custody_id;
  
  SELECT amount INTO v_original FROM employee_custodies WHERE id = v_custody_id;
  
  IF (v_spent + v_returned) >= v_original THEN
    v_new_status := 'settled';
  ELSIF (v_spent + v_returned) > 0 THEN
    v_new_status := 'partial';
  ELSE
    v_new_status := 'open';
  END IF;
  
  UPDATE employee_custodies
  SET total_spent = v_spent,
      total_returned = v_returned,
      status = v_new_status,
      updated_at = now()
  WHERE id = v_custody_id;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_custody_totals ON custody_settlements;
CREATE TRIGGER trg_update_custody_totals
  AFTER INSERT OR UPDATE OR DELETE ON custody_settlements
  FOR EACH ROW
  EXECUTE FUNCTION update_custody_totals();

-- 10. Employee Custody Summary View
CREATE OR REPLACE VIEW v_employee_custody_summary
WITH (security_invoker = true)
AS
SELECT
  e.id AS employee_id,
  e.full_name,
  e.branch_id,
  COUNT(DISTINCT c.id) FILTER (WHERE NOT c.is_voided) AS total_custodies,
  COALESCE(SUM(c.amount) FILTER (WHERE NOT c.is_voided), 0) AS total_advanced,
  COALESCE(SUM(c.total_spent) FILTER (WHERE NOT c.is_voided), 0) AS total_spent,
  COALESCE(SUM(c.total_returned) FILTER (WHERE NOT c.is_voided), 0) AS total_returned,
  COALESCE(SUM(c.remaining_balance) FILTER (WHERE NOT c.is_voided AND c.status != 'settled'), 0) AS total_remaining,
  COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'open' AND NOT c.is_voided) AS open_custodies,
  COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'partial' AND NOT c.is_voided) AS partial_custodies
FROM employees e
LEFT JOIN employee_custodies c ON e.id = c.employee_id
WHERE e.is_active = true
GROUP BY e.id, e.full_name, e.branch_id;

-- 11. Function to create custody with journal entry
CREATE OR REPLACE FUNCTION create_employee_custody_atomic(
  p_employee_id UUID,
  p_branch_id UUID,
  p_amount NUMERIC,
  p_funding_source TEXT,
  p_partner_id UUID DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'cash',
  p_description TEXT DEFAULT NULL,
  p_description_ar TEXT DEFAULT NULL,
  p_custody_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_custody_id UUID;
  v_custody_number TEXT;
  v_je_id UUID;
  v_je_number TEXT;
  v_user_id UUID;
  v_credit_account TEXT;
  v_emp_name TEXT;
  v_custody_account_id UUID;
  v_credit_account_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    v_user_id := (SELECT id FROM users WHERE role = 'super_admin' LIMIT 1);
  END IF;
  
  SELECT full_name INTO v_emp_name FROM employees WHERE id = p_employee_id;
  IF v_emp_name IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Employee not found');
  END IF;
  
  IF p_funding_source = 'cash' THEN
    v_credit_account := '1111';
  ELSIF p_funding_source = 'bank' THEN
    v_credit_account := '1112';
  ELSIF p_funding_source = 'partner' THEN
    v_credit_account := '3110';
  ELSE
    RETURN json_build_object('success', false, 'message', 'Invalid funding source');
  END IF;
  
  SELECT id INTO v_custody_account_id FROM accounts WHERE code = '1140';
  SELECT id INTO v_credit_account_id FROM accounts WHERE code = v_credit_account;
  
  IF v_custody_account_id IS NULL OR v_credit_account_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Required accounts not found');
  END IF;
  
  SELECT 'JE-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || 
         LPAD((COALESCE(MAX(CAST(SUBSTRING(entry_number FROM 'JE-\d{4}-(\d+)') AS INTEGER)), 0) + 1)::TEXT, 4, '0')
  INTO v_je_number
  FROM journal_entries
  WHERE entry_number LIKE 'JE-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-%';
  
  INSERT INTO journal_entries (entry_number, date, description, status, branch_id, created_by)
  VALUES (
    v_je_number,
    p_custody_date,
    COALESCE(p_description, 'Employee custody advance for ' || v_emp_name),
    'Draft',
    p_branch_id,
    v_user_id
  )
  RETURNING id INTO v_je_id;
  
  INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, base_debit, base_credit, description, line_number)
  VALUES (v_je_id, v_custody_account_id, p_amount, 0, p_amount, 0, 'Employee custody - ' || v_emp_name, 1);
  
  INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, base_debit, base_credit, description, line_number)
  VALUES (v_je_id, v_credit_account_id, 0, p_amount, 0, p_amount, 'Funding source', 2);
  
  UPDATE journal_entries SET status = 'Posted', posted_at = now(), posted_by = v_user_id WHERE id = v_je_id;
  
  INSERT INTO employee_custodies (
    employee_id, branch_id, custody_date, amount, funding_source, partner_id,
    payment_method, description, description_ar, journal_entry_id, created_by
  ) VALUES (
    p_employee_id, p_branch_id, p_custody_date, p_amount, p_funding_source, p_partner_id,
    p_payment_method, p_description, p_description_ar, v_je_id, v_user_id
  )
  RETURNING id, custody_number INTO v_custody_id, v_custody_number;
  
  RETURN json_build_object(
    'success', true,
    'custody_id', v_custody_id,
    'custody_number', v_custody_number,
    'journal_entry_id', v_je_id
  );
END;
$$;

-- 12. Function to add custody settlement with journal entry
CREATE OR REPLACE FUNCTION add_custody_settlement_atomic(
  p_custody_id UUID,
  p_settlement_type TEXT,
  p_amount NUMERIC,
  p_account_code TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_description_ar TEXT DEFAULT NULL,
  p_settlement_date DATE DEFAULT CURRENT_DATE,
  p_reference_type TEXT DEFAULT 'manual',
  p_reference_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_custody RECORD;
  v_settlement_id UUID;
  v_je_id UUID;
  v_je_number TEXT;
  v_user_id UUID;
  v_debit_account TEXT;
  v_debit_account_id UUID;
  v_custody_account_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    v_user_id := (SELECT id FROM users WHERE role = 'super_admin' LIMIT 1);
  END IF;
  
  SELECT c.*, e.full_name AS emp_name
  INTO v_custody
  FROM employee_custodies c
  JOIN employees e ON e.id = c.employee_id
  WHERE c.id = p_custody_id AND NOT c.is_voided;
  
  IF v_custody.id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Custody not found or voided');
  END IF;
  
  IF v_custody.status = 'settled' THEN
    RETURN json_build_object('success', false, 'message', 'Custody already settled');
  END IF;
  
  IF p_amount > v_custody.remaining_balance THEN
    RETURN json_build_object('success', false, 'message', 'Amount exceeds remaining balance');
  END IF;
  
  IF p_settlement_type = 'cash_return' THEN
    v_debit_account := '1111';
  ELSIF p_settlement_type = 'expense' THEN
    v_debit_account := COALESCE(p_account_code, '6300');
  ELSIF p_settlement_type = 'purchase' THEN
    v_debit_account := COALESCE(p_account_code, '1131');
  ELSIF p_settlement_type = 'asset' THEN
    v_debit_account := COALESCE(p_account_code, '1213');
  ELSE
    RETURN json_build_object('success', false, 'message', 'Invalid settlement type');
  END IF;
  
  SELECT id INTO v_debit_account_id FROM accounts WHERE code = v_debit_account;
  SELECT id INTO v_custody_account_id FROM accounts WHERE code = '1140';
  
  IF v_debit_account_id IS NULL OR v_custody_account_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Required accounts not found');
  END IF;
  
  SELECT 'JE-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || 
         LPAD((COALESCE(MAX(CAST(SUBSTRING(entry_number FROM 'JE-\d{4}-(\d+)') AS INTEGER)), 0) + 1)::TEXT, 4, '0')
  INTO v_je_number
  FROM journal_entries
  WHERE entry_number LIKE 'JE-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-%';
  
  INSERT INTO journal_entries (entry_number, date, description, status, branch_id, created_by)
  VALUES (
    v_je_number,
    p_settlement_date,
    COALESCE(p_description, 'Custody settlement - ' || v_custody.emp_name),
    'Draft',
    v_custody.branch_id,
    v_user_id
  )
  RETURNING id INTO v_je_id;
  
  INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, base_debit, base_credit, description, line_number)
  VALUES (v_je_id, v_debit_account_id, p_amount, 0, p_amount, 0, p_description, 1);
  
  INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, base_debit, base_credit, description, line_number)
  VALUES (v_je_id, v_custody_account_id, 0, p_amount, 0, p_amount, 'Settlement from employee custody', 2);
  
  UPDATE journal_entries SET status = 'Posted', posted_at = now(), posted_by = v_user_id WHERE id = v_je_id;
  
  INSERT INTO custody_settlements (
    custody_id, branch_id, settlement_date, settlement_type, account_code,
    amount, description, description_ar, reference_type, reference_id, journal_entry_id, created_by
  ) VALUES (
    p_custody_id, v_custody.branch_id, p_settlement_date, p_settlement_type, v_debit_account,
    p_amount, p_description, p_description_ar, p_reference_type, p_reference_id, v_je_id, v_user_id
  )
  RETURNING id INTO v_settlement_id;
  
  RETURN json_build_object(
    'success', true,
    'settlement_id', v_settlement_id,
    'journal_entry_id', v_je_id,
    'new_remaining', v_custody.remaining_balance - p_amount
  );
END;
$$;

-- 13. Function to get open custodies for an employee (for payment dropdown)
CREATE OR REPLACE FUNCTION get_employee_open_custodies(p_employee_id UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  custody_number TEXT,
  employee_id UUID,
  employee_name TEXT,
  amount NUMERIC,
  remaining_balance NUMERIC,
  custody_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.custody_number,
    c.employee_id,
    e.full_name,
    c.amount,
    c.remaining_balance,
    c.custody_date
  FROM employee_custodies c
  JOIN employees e ON e.id = c.employee_id
  WHERE c.status IN ('open', 'partial')
    AND NOT c.is_voided
    AND c.remaining_balance > 0
    AND (p_employee_id IS NULL OR c.employee_id = p_employee_id)
  ORDER BY c.custody_date DESC;
END;
$$;
