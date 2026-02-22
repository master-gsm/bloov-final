/*
  # Allow deleting draft sales in the prevent_financial_delete trigger

  1. Changes
    - Modified `prevent_financial_delete()` to allow deletion of sales with status = 'draft'
    - The RLS policy already restricts deletion to draft sales only for admin/accountant/super_admin
    - The trigger was previously blocking ALL deletes regardless of status

  2. Also fix `prevent_closed_period_modifications` for DELETE operations
    - The function references NEW which doesn't exist in DELETE triggers
    - Now returns OLD for DELETE operations to avoid errors

  3. Security
    - Draft sales have no financial impact (not confirmed), so deletion is safe
    - RLS policy still enforces role-based access control
*/

CREATE OR REPLACE FUNCTION prevent_financial_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.bypass_immutable', true) = 'true' THEN
    RETURN OLD;
  END IF;

  IF TG_TABLE_NAME = 'sales' AND OLD.status = 'draft' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'DELETE operation is not permitted on financial table "%" - use void/reversal functions instead. Record ID: %', TG_TABLE_NAME, OLD.id;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_closed_period_modifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  transaction_date DATE;
  period_closed BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF TG_TABLE_NAME = 'sales' THEN
    transaction_date := (NEW.sale_date)::DATE;
  ELSIF TG_TABLE_NAME = 'purchases' THEN
    transaction_date := (NEW.purchase_date)::DATE;
  ELSIF TG_TABLE_NAME = 'journal_entries' THEN
    transaction_date := NEW.date;
  ELSIF TG_TABLE_NAME = 'cash_transactions' THEN
    transaction_date := (NEW.transaction_date)::DATE;
  ELSIF TG_TABLE_NAME = 'operating_expenses' THEN
    transaction_date := (NEW.expense_date)::DATE;
  ELSIF TG_TABLE_NAME = 'supplier_payments' THEN
    transaction_date := (NEW.payment_date)::DATE;
  ELSIF TG_TABLE_NAME = 'partner_contributions' THEN
    transaction_date := (NEW.contribution_date)::DATE;
  ELSE
    RETURN NEW;
  END IF;

  SELECT is_closed INTO period_closed
  FROM accounting_periods
  WHERE transaction_date BETWEEN start_date AND end_date
  AND is_closed = true
  LIMIT 1;

  IF FOUND AND period_closed THEN
    RAISE EXCEPTION 'Cannot modify transactions in closed accounting period';
  END IF;

  RETURN NEW;
END;
$$;
