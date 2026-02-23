/*
  # BUG-04 (Second Pass): post_operating_expense_gl — Draft-then-Post Pattern

  ## Problem Discovered in Validation
  Previous fix created journal_entries with status='Posted' then tried to insert lines.
  The guard trigger `trg_protect_posted_lines` blocks all inserts into journal_lines
  for Posted/Void entries — causing full rollback of every operating_expense INSERT.

  ## Solution: Draft → Insert Lines → Update to Posted
  Same pattern as process_purchase_receipt_atomic and other working functions.
*/

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
  v_line_num           INT := 1;
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

  -- VAT Recoverable: 2140
  SELECT id INTO v_vat_account_id
  FROM accounts WHERE code = '2140' AND is_active = true LIMIT 1;

  -- Credit side: AP for credit/transfer payments, Cash otherwise
  IF NEW.payment_method IN ('credit', 'bank_transfer', 'check', 'transfer') THEN
    SELECT id INTO v_credit_account_id
    FROM accounts WHERE code = '2110' AND is_active = true LIMIT 1;
  ELSE
    SELECT id INTO v_credit_account_id
    FROM accounts WHERE code = '1110' AND is_active = true LIMIT 1;
  END IF;

  IF v_expense_account_id IS NULL OR v_credit_account_id IS NULL THEN
    RAISE WARNING 'post_operating_expense_gl: Required accounts not found. Skipping GL post.';
    RETURN NEW;
  END IF;

  v_entry_number := 'EXP-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || substr(NEW.id::text, 1, 8);

  -- Step 1: Create journal entry as DRAFT
  INSERT INTO journal_entries (
    entry_number, date, description, status,
    branch_id, reference_type, reference_id,
    created_by, posted_by, posted_at
  ) VALUES (
    v_entry_number, NEW.expense_date, COALESCE(NEW.description, 'Operating Expense'), 'Draft',
    NEW.branch_id, 'operating_expense', NEW.id,
    v_created_by, v_created_by, now()
  ) RETURNING id INTO v_journal_entry_id;

  -- Step 2: Insert lines (allowed because entry is Draft)
  -- Dr 6000 Operating Expenses (net amount)
  INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, line_number)
  VALUES (v_journal_entry_id, v_expense_account_id, v_net_amount, 0, COALESCE(NEW.description, 'Operating Expense'), v_line_num);
  v_line_num := v_line_num + 1;

  -- Dr 2140 VAT Recoverable (if standard VAT applies)
  IF v_vat_amount > 0 AND v_vat_account_id IS NOT NULL AND NEW.vat_category = 'standard' THEN
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, line_number)
    VALUES (v_journal_entry_id, v_vat_account_id, v_vat_amount, 0, 'VAT Input on Expense', v_line_num);
    v_line_num := v_line_num + 1;
  END IF;

  -- Cr Cash or AP (total amount)
  INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, line_number)
  VALUES (v_journal_entry_id, v_credit_account_id, 0, v_total_amount, COALESCE(NEW.description, 'Operating Expense'), v_line_num);

  -- Step 3: Mark as Posted
  UPDATE journal_entries
  SET status = 'Posted'
  WHERE id = v_journal_entry_id;

  RETURN NEW;
END;
$$;
