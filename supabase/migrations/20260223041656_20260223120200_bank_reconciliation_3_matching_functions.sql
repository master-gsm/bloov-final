
/*
  # Bank Reconciliation Engine — Migration 3: Matching Functions

  ## Summary
  Three core functions for the reconciliation workflow.

  ## `import_bank_statement(p_bank_account_id, p_period_start, p_period_end,
                             p_opening_balance, p_closing_balance, p_lines jsonb)`
  Bulk-inserts bank statement lines from a JSON array.
  Returns the new import_id and line count.
  Lines format:
  [
    {
      "transaction_date": "2026-02-01",
      "description": "Payment from customer",
      "reference_number": "REF-001",
      "debit": 0,
      "credit": 500,
      "balance": 5500
    }, ...
  ]

  ## `auto_match_bank_transactions(p_bank_account_id, p_date_from, p_date_to)`
  Scans unmatched bank_statement_lines in the date range and tries to match each
  against journal_entries using a scoring algorithm:

  Match criteria (all within same branch):
  1. Amount match: bsl.credit = JE net credit OR bsl.debit = JE net debit
     (net = SUM of journal_lines for cash/bank accounts).
  2. Date proximity: ABS(bsl.transaction_date - je.date) <= 3 days.
  3. Reference match (bonus): bsl.reference_number ≈ je.entry_number (ILIKE).

  Confidence scoring:
  - Amount exact match:   +60
  - Date exact match:     +25 (sliding down to +10 at ±3 days)
  - Reference match:      +15
  Match requires confidence >= 60 (amount match mandatory).
  Only highest-confidence unmatched JE per line is selected.

  Returns jsonb: { matched: N, skipped: N, details: [...] }

  ## `manual_match_bank_transaction(p_bank_line_id, p_journal_entry_id, p_amount)`
  Creates a single manual match.
  Validates both sides exist, not already matched, same branch.
  Returns the new reconciliation_matches.id.

  ## `unmatch_bank_transaction(p_match_id)`
  Soft-deletes a match and resets bsl.is_matched = false.
  Blocked if reconciliation is finalized.
*/

-- ── Helper: get net cash/bank amount from a journal entry ─────────────────────
CREATE OR REPLACE FUNCTION _get_je_net_amount(p_je_id uuid)
RETURNS TABLE(net_debit numeric, net_credit numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    COALESCE(SUM(jl.debit),  0) AS net_debit,
    COALESCE(SUM(jl.credit), 0) AS net_credit
  FROM journal_lines jl
  JOIN chart_of_accounts coa ON coa.id = jl.account_id
  WHERE jl.journal_entry_id = p_je_id
    -- Cash/bank accounts: codes starting with 111 or 112 (asset, cash group)
    AND (coa.account_code LIKE '111%' OR coa.account_code LIKE '112%'
         OR coa.account_type ILIKE '%cash%' OR coa.account_type ILIKE '%bank%');
$$;

-- ── import_bank_statement() ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION import_bank_statement(
  p_bank_account_id uuid,
  p_period_start    date,
  p_period_end      date,
  p_opening_balance numeric DEFAULT 0,
  p_closing_balance numeric DEFAULT 0,
  p_lines           jsonb   DEFAULT '[]'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   uuid;
  v_branch_id uuid;
  v_import_id uuid;
  v_item      jsonb;
  v_count     integer := 0;
BEGIN
  v_user_id := COALESCE(
    auth.uid(),
    (SELECT id FROM users WHERE role IN ('admin','super_admin') ORDER BY created_at LIMIT 1)
  );

  -- Validate bank account
  SELECT branch_id INTO v_branch_id
  FROM bank_accounts WHERE id = p_bank_account_id AND is_deleted = false AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bank account % not found or inactive.', p_bank_account_id;
  END IF;

  IF p_period_end < p_period_start THEN
    RAISE EXCEPTION 'period_end must be >= period_start.';
  END IF;

  -- Create import header
  INSERT INTO bank_statement_imports (
    bank_account_id, period_start, period_end,
    opening_balance, closing_balance, imported_by
  ) VALUES (
    p_bank_account_id, p_period_start, p_period_end,
    p_opening_balance, p_closing_balance, v_user_id
  ) RETURNING id INTO v_import_id;

  -- Insert lines
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    INSERT INTO bank_statement_lines (
      import_id,
      transaction_date,
      description,
      reference_number,
      debit,
      credit,
      balance,
      branch_id
    ) VALUES (
      v_import_id,
      (v_item->>'transaction_date')::date,
      COALESCE(v_item->>'description', ''),
      NULLIF(TRIM(COALESCE(v_item->>'reference_number', '')), ''),
      COALESCE((v_item->>'debit')::numeric, 0),
      COALESCE((v_item->>'credit')::numeric, 0),
      NULLIF(v_item->>'balance', '')::numeric,
      v_branch_id
    );
    v_count := v_count + 1;
  END LOOP;

  -- Update line count
  UPDATE bank_statement_imports SET line_count = v_count WHERE id = v_import_id;

  RETURN jsonb_build_object(
    'import_id',       v_import_id,
    'bank_account_id', p_bank_account_id,
    'period_start',    p_period_start,
    'period_end',      p_period_end,
    'lines_imported',  v_count
  );
END;
$$;

-- ── auto_match_bank_transactions() ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION auto_match_bank_transactions(
  p_bank_account_id uuid,
  p_date_from       date DEFAULT NULL,
  p_date_to         date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_id    uuid;
  v_user_id      uuid;
  v_date_from    date;
  v_date_to      date;
  v_matched      integer := 0;
  v_skipped      integer := 0;
  v_details      jsonb[] := '{}';

  -- Cursor over unmatched lines
  v_line         bank_statement_lines%ROWTYPE;
  v_bsl_amount   numeric;

  -- Candidate journal entry
  v_best_je_id   uuid;
  v_best_score   numeric;
  v_new_match_id uuid;

  -- Per-JE scoring
  v_je_id        uuid;
  v_je_date      date;
  v_je_ref       text;
  v_je_desc      text;
  v_je_nd        numeric;
  v_je_nc        numeric;
  v_score        numeric;
  v_date_diff    integer;
BEGIN
  v_user_id := COALESCE(
    auth.uid(),
    (SELECT id FROM users WHERE role IN ('admin','super_admin') ORDER BY created_at LIMIT 1)
  );

  SELECT branch_id INTO v_branch_id
  FROM bank_accounts WHERE id = p_bank_account_id AND is_deleted = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bank account % not found.', p_bank_account_id;
  END IF;

  v_date_from := COALESCE(p_date_from, CURRENT_DATE - INTERVAL '90 days');
  v_date_to   := COALESCE(p_date_to,   CURRENT_DATE);

  -- Loop over every unmatched bank line in the date/branch window
  FOR v_line IN
    SELECT bsl.*
    FROM bank_statement_lines bsl
    JOIN bank_statement_imports bsi ON bsi.id = bsl.import_id
    WHERE bsi.bank_account_id = p_bank_account_id
      AND bsl.is_matched = false
      AND bsl.is_deleted = false
      AND bsl.transaction_date BETWEEN v_date_from AND v_date_to
    ORDER BY bsl.transaction_date
  LOOP
    v_bsl_amount := GREATEST(v_line.debit, v_line.credit);
    v_best_je_id := NULL;
    v_best_score := -1;

    -- Find best matching posted journal entry in same branch
    FOR v_je_id, v_je_date, v_je_ref, v_je_desc IN
      SELECT je.id, je.date, je.entry_number, je.description
      FROM journal_entries je
      WHERE je.branch_id = v_branch_id
        AND je.status = 'Posted'
        AND je.date BETWEEN v_line.transaction_date - INTERVAL '3 days'
                        AND v_line.transaction_date + INTERVAL '3 days'
        -- Must not already be matched
        AND NOT EXISTS (
          SELECT 1 FROM reconciliation_matches rm
          WHERE rm.journal_entry_id = je.id
            AND rm.is_deleted = false
        )
      ORDER BY ABS(je.date - v_line.transaction_date), je.date
    LOOP
      -- Get net cash/bank movement for this JE
      SELECT net_debit, net_credit INTO v_je_nd, v_je_nc
      FROM _get_je_net_amount(v_je_id);

      -- Amount must match exactly (mandatory for auto-match)
      IF (v_line.credit > 0 AND ABS(v_je_nc - v_line.credit) < 0.005)
      OR (v_line.debit  > 0 AND ABS(v_je_nd - v_line.debit)  < 0.005) THEN

        v_score := 60; -- base: amount match

        -- Date proximity bonus (max +25 for same day, min +10 at ±3)
        v_date_diff := ABS(v_je_date - v_line.transaction_date);
        v_score := v_score + GREATEST(25 - (v_date_diff * 5), 10);

        -- Reference match bonus (+15)
        IF v_line.reference_number IS NOT NULL
           AND v_je_ref ILIKE '%' || v_line.reference_number || '%' THEN
          v_score := v_score + 15;
        END IF;

        IF v_score > v_best_score THEN
          v_best_score := v_score;
          v_best_je_id := v_je_id;
        END IF;
      END IF;
    END LOOP;

    -- If a confident match found, insert it
    IF v_best_je_id IS NOT NULL THEN
      BEGIN
        INSERT INTO reconciliation_matches (
          bank_statement_line_id, journal_entry_id,
          matched_amount, match_type, match_confidence, created_by
        ) VALUES (
          v_line.id, v_best_je_id,
          v_bsl_amount, 'auto', v_best_score, v_user_id
        ) RETURNING id INTO v_new_match_id;

        v_matched := v_matched + 1;
        v_details := array_append(v_details, jsonb_build_object(
          'match_id',            v_new_match_id,
          'bank_line_id',        v_line.id,
          'journal_entry_id',    v_best_je_id,
          'amount',              v_bsl_amount,
          'confidence',          v_best_score,
          'transaction_date',    v_line.transaction_date,
          'description',         v_line.description
        ));
      EXCEPTION WHEN OTHERS THEN
        -- Line may have been matched by concurrent session; skip gracefully
        v_skipped := v_skipped + 1;
      END;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'bank_account_id', p_bank_account_id,
    'date_from',       v_date_from,
    'date_to',         v_date_to,
    'matched',         v_matched,
    'skipped',         v_skipped,
    'matches',         to_jsonb(v_details)
  );
END;
$$;

-- ── manual_match_bank_transaction() ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION manual_match_bank_transaction(
  p_bank_line_id     uuid,
  p_journal_entry_id uuid,
  p_amount           numeric,
  p_reconciliation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid;
  v_bsl        bank_statement_lines%ROWTYPE;
  v_je_branch  uuid;
  v_je_status  text;
  v_match_id   uuid;
  v_bsl_amount numeric;
BEGIN
  v_user_id := COALESCE(
    auth.uid(),
    (SELECT id FROM users WHERE role IN ('admin','super_admin') ORDER BY created_at LIMIT 1)
  );

  -- Validate bank line
  SELECT * INTO v_bsl
  FROM bank_statement_lines
  WHERE id = p_bank_line_id AND is_deleted = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bank statement line % not found or deleted.', p_bank_line_id;
  END IF;

  IF v_bsl.is_matched THEN
    RAISE EXCEPTION 'Bank statement line % is already matched.', p_bank_line_id;
  END IF;

  -- Validate journal entry
  SELECT branch_id, status INTO v_je_branch, v_je_status
  FROM journal_entries WHERE id = p_journal_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journal entry % not found.', p_journal_entry_id;
  END IF;

  IF v_je_status = 'Void' THEN
    RAISE EXCEPTION 'Cannot match a voided journal entry.';
  END IF;

  IF v_bsl.branch_id != v_je_branch THEN
    RAISE EXCEPTION
      'Cross-branch match blocked: bank line branch % != journal entry branch %.',
      v_bsl.branch_id, v_je_branch;
  END IF;

  -- Amount validation
  v_bsl_amount := GREATEST(v_bsl.debit, v_bsl.credit);
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Matched amount must be > 0.';
  END IF;
  IF p_amount > v_bsl_amount THEN
    RAISE EXCEPTION
      'Matched amount % exceeds bank line amount %.', p_amount, v_bsl_amount;
  END IF;

  -- Check not already matched to same JE
  IF EXISTS (
    SELECT 1 FROM reconciliation_matches
    WHERE journal_entry_id = p_journal_entry_id AND is_deleted = false
  ) THEN
    RAISE EXCEPTION
      'Journal entry % is already matched to a bank line.', p_journal_entry_id;
  END IF;

  -- Insert match (guard trigger fires too)
  INSERT INTO reconciliation_matches (
    reconciliation_id, bank_statement_line_id, journal_entry_id,
    matched_amount, match_type, created_by
  ) VALUES (
    p_reconciliation_id, p_bank_line_id, p_journal_entry_id,
    p_amount, 'manual', v_user_id
  ) RETURNING id INTO v_match_id;

  RETURN jsonb_build_object(
    'match_id',          v_match_id,
    'bank_line_id',      p_bank_line_id,
    'journal_entry_id',  p_journal_entry_id,
    'matched_amount',    p_amount,
    'match_type',        'manual'
  );
END;
$$;

-- ── unmatch_bank_transaction() ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION unmatch_bank_transaction(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_recon_status text;
  v_recon_id uuid;
BEGIN
  v_user_id := COALESCE(
    auth.uid(),
    (SELECT id FROM users WHERE role IN ('admin','super_admin') ORDER BY created_at LIMIT 1)
  );

  SELECT reconciliation_id INTO v_recon_id
  FROM reconciliation_matches WHERE id = p_match_id AND is_deleted = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match % not found or already voided.', p_match_id;
  END IF;

  -- Check reconciliation not finalized
  IF v_recon_id IS NOT NULL THEN
    SELECT status INTO v_recon_status
    FROM bank_reconciliations WHERE id = v_recon_id;

    IF v_recon_status = 'finalized' THEN
      RAISE EXCEPTION 'Cannot unmatch in a finalized reconciliation.';
    END IF;
  END IF;

  UPDATE reconciliation_matches
  SET is_deleted = true, voided_at = now(), voided_by = v_user_id
  WHERE id = p_match_id;
END;
$$;
