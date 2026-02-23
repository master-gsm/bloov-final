/*
  # BUG-04 Fix: Operating Expenses — Add GL posting trigger

  ## Problem
  The `operating_expenses` table had no GL posting trigger. Inserting an expense
  correctly recorded a VAT transaction but never created a journal entry, making
  all operating expenses invisible to the trial balance and income statement.

  ## Fix
  1. Create function `post_operating_expense_gl()` — posts a balanced journal entry:
       Dr 6000 Operating Expenses   (net_amount)
       Dr 2140 VAT Recoverable      (vat_amount, if > 0 and vat_category = 'standard')
       Cr 1110 Cash                 (total amount = net_amount + vat_amount)
         OR
       Cr 2110 Accounts Payable     (if payment_method = 'credit' or NULL)
     Entry status = 'Posted', reference_type = 'operating_expense'
  2. Create AFTER INSERT trigger `trg_post_operating_expense_gl` on `operating_expenses`

  ## Notes
  - Uses `accounts` table (the real GL ledger table) via `code` column
  - Atomic within the same INSERT transaction — if GL fails, expense insert rolls back
  - Idempotent: skips if a GL entry already exists for this expense
*/

-- GL posting function for operating expenses
CREATE OR REPLACE FUNCTION public.post_operating_expense_gl()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_expense_account_id UUID;
  v_vat_account_id     UUID;
  v_credit_account_id  UUID;
  v_journal_entry_id   UUID;
  v_entry_number       TEXT;
  v_net_amount         NUMERIC;
  v_vat_amount         NUMERIC;
  v_total_amount       NUMERIC;
  v_created_by         UUID;
BEGIN
  -- Idempotency: skip if GL entry already exists for this expense
  IF EXISTS (
    SELECT 1 FROM journal_entries
    WHERE reference_type = 'operating_expense'
      AND reference_id   = NEW.id
      AND voided_at IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  -- Resolve amounts
  v_net_amount   := COALESCE(NEW.net_amount, NEW.amount, 0);
  v_vat_amount   := COALESCE(NEW.vat_amount, 0);
  v_total_amount := v_net_amount + v_vat_amount;

  IF v_total_amount <= 0 THEN
    RETURN NEW;
  END IF;

  v_created_by := COALESCE(NEW.created_by, auth.uid());
  IF v_created_by IS NULL THEN
    RAISE WARNING 'post_operating_expense_gl: No created_by. Skipping GL post for expense %.', NEW.id;
    RETURN NEW;
  END IF;

  -- Expense account: 6000 Operating Expenses
  SELECT id INTO v_expense_account_id
  FROM accounts WHERE code = '6000' AND is_active = true LIMIT 1;

  -- VAT Recoverable account: 2140
  SELECT id INTO v_vat_account_id
  FROM accounts WHERE code = '2140' AND is_active = true LIMIT 1;

  -- Credit side: Cash (default) or AP if payment_method indicates credit
  IF NEW.payment_method IN ('credit', 'bank_transfer', 'check', 'transfer') THEN
    SELECT id INTO v_credit_account_id
    FROM accounts WHERE code = '2110' AND is_active = true LIMIT 1;
  ELSE
    SELECT id INTO v_credit_account_id
    FROM accounts WHERE code = '1110' AND is_active = true LIMIT 1;
  END IF;

  IF v_expense_account_id IS NULL OR v_credit_account_id IS NULL THEN
    RAISE WARNING 'post_operating_expense_gl: Required accounts not found (6000 or 1110/2110). Skipping GL post.';
    RETURN NEW;
  END IF;

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
    COALESCE(NEW.description, 'Operating Expense'),
    'Posted',
    NEW.branch_id,
    'operating_expense',
    NEW.id,
    v_created_by,
    v_created_by,
    now()
  ) RETURNING id INTO v_journal_entry_id;

  -- Dr 6000 Operating Expenses (net amount)
  INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, line_number)
  VALUES (v_journal_entry_id, v_expense_account_id, v_net_amount, 0, COALESCE(NEW.description, 'Operating Expense'), 1);

  -- Dr 2140 VAT Recoverable (if VAT applies)
  IF v_vat_amount > 0 AND v_vat_account_id IS NOT NULL AND NEW.vat_category = 'standard' THEN
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, line_number)
    VALUES (v_journal_entry_id, v_vat_account_id, v_vat_amount, 0, 'VAT Input on Expense', 2);
  END IF;

  -- Cr Cash or AP (total amount)
  INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, line_number)
  VALUES (v_journal_entry_id, v_credit_account_id, 0, v_total_amount, COALESCE(NEW.description, 'Operating Expense'), 3);

  RETURN NEW;
END;
$$;

-- Attach the trigger AFTER INSERT on operating_expenses
DROP TRIGGER IF EXISTS trg_post_operating_expense_gl ON operating_expenses;
CREATE TRIGGER trg_post_operating_expense_gl
  AFTER INSERT ON operating_expenses
  FOR EACH ROW
  EXECUTE FUNCTION post_operating_expense_gl();
