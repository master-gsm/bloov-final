/*
  # Fix void_partner_operation_atomic: add created_by fallback

  ## Problem
  When `auth.uid()` returns NULL (e.g., in admin SQL sessions or service role),
  the INSERT into `journal_entries` fails with:
    "null value in column 'created_by'"

  ## Fix
  After fetching `v_orig_je`, use COALESCE to fall back to `v_orig_je.created_by`
  so the reversal entry always has a valid `created_by`.

  ## No other changes to logic, amounts, or GL routing.
*/

CREATE OR REPLACE FUNCTION public.void_partner_operation_atomic(
  p_expense_id uuid,
  p_reason     text DEFAULT 'Voided'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $void_fn$
DECLARE
  v_orig_je   journal_entries%ROWTYPE;
  v_rev_je_id uuid;
  v_rev_number text;
  v_user_id   uuid;
  v_line      RECORD;
  v_line_no   int := 0;
BEGIN
  PERFORM set_config('app.bypass_immutable', 'true', true);

  -- Find original GL entry FIRST so we can fall back to its created_by
  SELECT * INTO v_orig_je
  FROM journal_entries
  WHERE reference_type = 'setup_expense'
    AND reference_id = p_expense_id
    AND status = 'Posted'
  ORDER BY created_at DESC
  LIMIT 1;

  -- Resolve user: auth.uid() first, then original JE author, then expense creator
  v_user_id := COALESCE(
    auth.uid(),
    v_orig_je.created_by,
    (SELECT created_by FROM setup_expenses WHERE id = p_expense_id LIMIT 1)
  );

  IF NOT FOUND THEN
    -- No GL to reverse — just soft-delete the expense
    UPDATE setup_expenses
    SET is_deleted = true, voided_at = now(), voided_by = v_user_id,
        updated_at = now()
    WHERE id = p_expense_id;

    PERFORM set_config('app.bypass_immutable', 'false', true);
    RETURN jsonb_build_object(
      'success', true,
      'reversed', false,
      'message', 'Expense soft-deleted (no GL entry found to reverse)'
    );
  END IF;

  -- Create reverse journal entry
  v_rev_je_id := gen_random_uuid();
  v_rev_number := 'REV-' || v_orig_je.entry_number;

  INSERT INTO journal_entries (
    id, entry_number, date, description,
    branch_id, reference_type, reference_id,
    original_entry_id,
    status, created_by, created_at, updated_at
  ) VALUES (
    v_rev_je_id, v_rev_number, CURRENT_DATE,
    'REVERSAL: ' || p_reason || ' — ' || v_orig_je.description,
    v_orig_je.branch_id,
    'setup_expense_reversal', p_expense_id,
    v_orig_je.id,
    'Draft', v_user_id, now(), now()
  );

  -- Flip all lines (debit ↔ credit)
  FOR v_line IN
    SELECT * FROM journal_lines
    WHERE journal_entry_id = v_orig_je.id
    ORDER BY line_number
  LOOP
    v_line_no := v_line_no + 1;
    INSERT INTO journal_lines (
      id, journal_entry_id, account_id,
      debit, credit, base_debit, base_credit,
      description, line_number, created_at
    ) VALUES (
      gen_random_uuid(), v_rev_je_id, v_line.account_id,
      v_line.credit, v_line.debit,
      v_line.base_credit, v_line.base_debit,
      'REV: ' || COALESCE(v_line.description, ''),
      v_line_no, now()
    );
  END LOOP;

  -- Post the reversal
  UPDATE journal_entries
  SET status = 'Posted',
      reverse_entry_id = v_rev_je_id,
      posted_by = v_user_id, posted_at = now(), updated_at = now()
  WHERE id = v_orig_je.id;

  UPDATE journal_entries
  SET status = 'Posted', posted_by = v_user_id, posted_at = now(), updated_at = now()
  WHERE id = v_rev_je_id;

  -- Settle the VAT transaction
  UPDATE vat_transactions
  SET status = 'settled'
  WHERE reference_type = 'setup_expense'
    AND reference_id = p_expense_id
    AND status = 'open';

  -- Soft-delete the expense
  UPDATE setup_expenses
  SET is_deleted = true, voided_at = now(), voided_by = v_user_id,
      updated_at = now()
  WHERE id = p_expense_id;

  PERFORM set_config('app.bypass_immutable', 'false', true);

  RETURN jsonb_build_object(
    'success',          true,
    'reversed',         true,
    'original_je_id',   v_orig_je.id,
    'reversal_je_id',   v_rev_je_id,
    'message',          'Partner operation reversed and expense voided'
  );

EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.bypass_immutable', 'false', true);
  RAISE;
END;
$void_fn$;

GRANT EXECUTE ON FUNCTION public.void_partner_operation_atomic(uuid, text) TO authenticated;
