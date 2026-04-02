/*
  # Allow Super Admin Full Edit Access to Setup Expenses

  ## Overview
  Updates the setup_expenses table to allow super_admin users to modify
  all fields including amount, date, and category while maintaining
  restrictions for all other users.

  ## Changes
  1. Update freeze_setup_expenses_financials trigger to allow super_admin bypass
  2. Update RLS policy for super_admin to have full update access
  3. Add audit trigger to log all super_admin modifications

  ## Security
  - Only super_admin can bypass financial freeze
  - All modifications by super_admin are logged to audit_logs
  - Regular users remain restricted from modifying financial values
  - Does not affect journal entries - those remain separate
*/

-- 1. Update the freeze trigger to allow super_admin bypass with audit logging
CREATE OR REPLACE FUNCTION freeze_setup_expenses_financials()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
  v_caller_id UUID;
BEGIN
  IF current_setting('app.bypass_immutable', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF OLD.is_deleted = true THEN
    RAISE EXCEPTION 'Cannot update a deleted record on setup_expenses. Record ID: %', OLD.id;
  END IF;

  IF NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.expense_date IS DISTINCT FROM OLD.expense_date
     OR NEW.category IS DISTINCT FROM OLD.category
  THEN
    v_caller_id := auth.uid();
    SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;
    
    IF v_caller_role = 'super_admin' THEN
      INSERT INTO audit_logs (action, table_name, record_id, user_id, metadata)
      VALUES (
        'SETUP_EXPENSE_MODIFIED',
        'setup_expenses',
        OLD.id,
        v_caller_id,
        jsonb_build_object(
          'operation', 'UPDATE',
          'changes', jsonb_build_object(
            'amount', jsonb_build_object('old', OLD.amount, 'new', NEW.amount),
            'expense_date', jsonb_build_object('old', OLD.expense_date, 'new', NEW.expense_date),
            'category', jsonb_build_object('old', OLD.category, 'new', NEW.category),
            'description', jsonb_build_object('old', OLD.description, 'new', NEW.description)
          ),
          'modified_at', NOW(),
          'warning', 'AUDIT_EVENT: Setup expense financial values modified by super_admin'
        )
      );
      
      RETURN NEW;
    END IF;
    
    RAISE EXCEPTION 'Financial values (amount, expense_date, category) on setup_expenses are frozen after creation. Only super_admin can modify. Record ID: %', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Drop existing update policy and create new one allowing super_admin full access
DROP POLICY IF EXISTS "Accountants and admins can update setup expenses" ON setup_expenses;
DROP POLICY IF EXISTS "Super admin can update all setup expense fields" ON setup_expenses;

CREATE POLICY "Super admin can update all setup expense fields"
  ON setup_expenses
  FOR UPDATE
  TO authenticated
  USING (
    is_deleted = false
    AND EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'super_admin'
    )
  );

CREATE POLICY "Accountants and admins can update non-financial fields"
  ON setup_expenses
  FOR UPDATE
  TO authenticated
  USING (
    is_deleted = false
    AND EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role IN ('admin', 'accountant')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role IN ('admin', 'accountant')
    )
  );

-- 3. Create function to update setup expense with super_admin privileges
CREATE OR REPLACE FUNCTION public.fn_super_admin_update_setup_expense(
  p_expense_id UUID,
  p_amount DECIMAL DEFAULT NULL,
  p_expense_date DATE DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_partner_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT 'Updated by super_admin'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_old_expense RECORD;
  v_result JSONB;
BEGIN
  v_caller_id := auth.uid();
  SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;
  
  IF v_caller_role != 'super_admin' THEN
    RAISE EXCEPTION 'ACCESS_DENIED: Only super_admin can use this function';
  END IF;
  
  SELECT * INTO v_old_expense FROM setup_expenses WHERE id = p_expense_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EXPENSE_NOT_FOUND: Setup expense does not exist';
  END IF;
  
  IF v_old_expense.is_deleted = true THEN
    RAISE EXCEPTION 'EXPENSE_DELETED: Cannot update a deleted expense';
  END IF;
  
  UPDATE setup_expenses SET
    amount = COALESCE(p_amount, amount),
    expense_date = COALESCE(p_expense_date, expense_date),
    category = COALESCE(p_category, category),
    description = COALESCE(p_description, description),
    notes = COALESCE(p_notes, notes),
    partner_id = CASE WHEN p_partner_id IS NOT NULL THEN p_partner_id ELSE partner_id END,
    updated_at = NOW(),
    version = version + 1
  WHERE id = p_expense_id;
  
  INSERT INTO audit_logs (action, table_name, record_id, user_id, metadata)
  VALUES (
    'SETUP_EXPENSE_ADMIN_UPDATE',
    'setup_expenses',
    p_expense_id,
    v_caller_id,
    jsonb_build_object(
      'old_values', jsonb_build_object(
        'amount', v_old_expense.amount,
        'expense_date', v_old_expense.expense_date,
        'category', v_old_expense.category,
        'description', v_old_expense.description
      ),
      'new_values', jsonb_build_object(
        'amount', COALESCE(p_amount, v_old_expense.amount),
        'expense_date', COALESCE(p_expense_date, v_old_expense.expense_date),
        'category', COALESCE(p_category, v_old_expense.category),
        'description', COALESCE(p_description, v_old_expense.description)
      ),
      'reason', p_reason,
      'updated_at', NOW()
    )
  );
  
  SELECT jsonb_build_object(
    'success', true,
    'expense_id', p_expense_id,
    'message', 'Setup expense updated successfully'
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION fn_super_admin_update_setup_expense IS 'Allows super_admin to update all fields of a setup expense including financial values with full audit logging';
