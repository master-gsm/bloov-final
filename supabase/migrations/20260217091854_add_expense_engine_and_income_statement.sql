/*
  # Expense Engine & Income Statement View

  ## 1. Add expense_account_id to expenses table
  Allows linking expense to specific GL account.

  ## 2. Auto-Post Expense Function
  When expense is created:
  - Dr Expense Account
  - Cr Cash Account

  ## 3. Income Statement View
  Calculates:
  - Total Revenue
  - Total COGS
  - Total Expenses
  - Net Profit = Revenue - COGS - Expenses
*/

-- ═══════════════════════════════════════════════════════════
-- 1. ADD expense_account_id TO expenses TABLE
-- ═══════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'expense_account_id'
  ) THEN
    ALTER TABLE expenses ADD COLUMN expense_account_id UUID REFERENCES chart_of_accounts(id);
  END IF;
END $$;

-- Create index
CREATE INDEX IF NOT EXISTS idx_expenses_account ON expenses(expense_account_id);

-- ═══════════════════════════════════════════════════════════
-- 2. AUTO-POST EXPENSE FUNCTION
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION auto_post_expense_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cash_account_id UUID;
  v_entry_number TEXT;
  v_journal_entry_id UUID;
BEGIN
  -- Skip if no expense_account_id or voided
  IF NEW.expense_account_id IS NULL OR NEW.voided_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Check if journal entry already exists (idempotency)
  IF EXISTS (
    SELECT 1 FROM journal_entries
    WHERE reference_type = 'expense'
      AND reference_id = NEW.id
      AND voided_at IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  -- Get Cash Account (1110)
  SELECT id INTO v_cash_account_id
  FROM chart_of_accounts
  WHERE account_code = '1110'
    AND is_active = true
  LIMIT 1;

  IF v_cash_account_id IS NULL THEN
    RAISE WARNING 'Cash account (1110) not found';
    RETURN NEW;
  END IF;

  -- Generate entry number
  v_entry_number := 'EXP-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || substr(NEW.id::text, 1, 8);

  -- Create journal entry header
  INSERT INTO journal_entries (
    entry_number,
    date,
    description,
    status,
    branch_id,
    reference_type,
    reference_id,
    created_by,
    posted_by,
    posted_at
  ) VALUES (
    v_entry_number,
    NEW.expense_date,
    'Expense: ' || COALESCE(NEW.description, NEW.category),
    'Posted',
    NEW.branch_id,
    'expense',
    NEW.id,
    NEW.created_by,
    NEW.created_by,
    now()
  ) RETURNING id INTO v_journal_entry_id;

  -- Dr Expense Account
  INSERT INTO journal_entry_lines (
    journal_entry_id,
    account_id,
    line_type,
    amount,
    description
  ) VALUES (
    v_journal_entry_id,
    NEW.expense_account_id,
    'debit',
    NEW.amount,
    COALESCE(NEW.description, NEW.category)
  );

  -- Cr Cash Account
  INSERT INTO journal_entry_lines (
    journal_entry_id,
    account_id,
    line_type,
    amount,
    description
  ) VALUES (
    v_journal_entry_id,
    v_cash_account_id,
    'credit',
    NEW.amount,
    'Cash payment for ' || COALESCE(NEW.description, NEW.category)
  );

  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trg_auto_post_expense ON expenses;
CREATE TRIGGER trg_auto_post_expense
  AFTER INSERT ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION auto_post_expense_entry();

-- ═══════════════════════════════════════════════════════════
-- 3. INCOME STATEMENT VIEW
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW v_income_statement AS
WITH 
-- Revenue (accounts with type 'revenue')
revenue_calc AS (
  SELECT 
    COALESCE(SUM(
      CASE WHEN jel.line_type = 'credit' THEN jel.amount 
           WHEN jel.line_type = 'debit' THEN -jel.amount 
           ELSE 0 END
    ), 0) as total_revenue
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.status = 'Posted'
    AND coa.account_type = 'revenue'
),
-- COGS (account 5100)
cogs_calc AS (
  SELECT 
    COALESCE(SUM(
      CASE WHEN jel.line_type = 'debit' THEN jel.amount 
           ELSE 0 END
    ), 0) as total_cogs
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.status = 'Posted'
    AND coa.account_code = '5100'
),
-- Expenses (accounts with type 'expense' but NOT COGS)
expenses_calc AS (
  SELECT 
    COALESCE(SUM(
      CASE WHEN jel.line_type = 'debit' THEN jel.amount 
           ELSE 0 END
    ), 0) as total_expenses
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.status = 'Posted'
    AND coa.account_type = 'expense'
    AND coa.account_code != '5100'
)
SELECT 
  r.total_revenue,
  c.total_cogs,
  e.total_expenses,
  (r.total_revenue - c.total_cogs - e.total_expenses) as net_profit
FROM revenue_calc r, cogs_calc c, expenses_calc e;

-- Grant access
GRANT SELECT ON v_income_statement TO authenticated;

-- Add comment
COMMENT ON VIEW v_income_statement IS 
'Income Statement: Shows Total Revenue, COGS, Expenses, and Net Profit.
Calculates Net Profit = Revenue - COGS - Expenses.';
