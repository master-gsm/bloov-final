
/*
  # VAT Engine — Fix: settle_vat_period() branch_id in journal_entries

  ## Summary
  journal_entries.branch_id is NOT NULL. When settle_vat_period() is called
  with p_branch_id = NULL (all branches), the journal entry must still have
  a valid branch_id. This fix:
  - If p_branch_id IS NULL, resolves to the first/oldest branch in the system.
  - Passes the resolved branch_id to the journal entry INSERT.

  No schema changes — function replacement only.
*/

CREATE OR REPLACE FUNCTION settle_vat_period(
  p_branch_id  uuid    DEFAULT NULL,
  p_month      integer DEFAULT NULL,
  p_year       integer DEFAULT NULL,
  p_notes      text    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month         integer := COALESCE(p_month, EXTRACT(MONTH FROM CURRENT_DATE)::integer);
  v_year          integer := COALESCE(p_year,  EXTRACT(YEAR  FROM CURRENT_DATE)::integer);
  v_date_from     date;
  v_date_to       date;
  v_output_vat    numeric := 0;
  v_input_vat     numeric := 0;
  v_net_payable   numeric := 0;
  v_je_id         uuid;
  v_return_id     uuid;
  v_user_id       uuid;
  v_je_branch_id  uuid;   -- resolved branch for journal entry
  v_acc_2130      uuid;
  v_acc_2140      uuid;
  v_acc_2200      uuid;
  v_line          integer := 0;
  v_period_label  text;
BEGIN
  v_user_id   := auth.uid();
  v_date_from := make_date(v_year, v_month, 1);
  v_date_to   := (v_date_from + interval '1 month - 1 day')::date;
  v_period_label := TO_CHAR(v_date_from, 'Mon YYYY');

  -- Resolve branch_id for journal entry (cannot be NULL)
  IF p_branch_id IS NOT NULL THEN
    v_je_branch_id := p_branch_id;
  ELSE
    SELECT id INTO v_je_branch_id FROM branches ORDER BY created_at LIMIT 1;
  END IF;

  IF v_je_branch_id IS NULL THEN
    RAISE EXCEPTION 'No branch found. Cannot create settlement journal entry.';
  END IF;

  -- Guard: already settled?
  IF EXISTS (
    SELECT 1 FROM vat_returns
    WHERE period_year  = v_year
      AND period_month = v_month
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND status NOT IN ('draft')
  ) THEN
    RAISE EXCEPTION 'VAT period %/% is already settled.', v_month, v_year;
  END IF;

  -- Aggregate open transactions for the period
  SELECT
    COALESCE(SUM(CASE WHEN direction = 'output' THEN vat_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'input' AND vat_category = 'standard' THEN vat_amount ELSE 0 END), 0)
  INTO v_output_vat, v_input_vat
  FROM vat_transactions
  WHERE period_year  = v_year
    AND period_month = v_month
    AND status       = 'open'
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  v_net_payable := ROUND(v_output_vat - v_input_vat, 2);

  IF v_output_vat = 0 AND v_input_vat = 0 THEN
    RAISE NOTICE 'No open VAT transactions for period %/%.', v_month, v_year;
  END IF;

  -- Fetch GL accounts
  SELECT id INTO v_acc_2130 FROM accounts WHERE code = '2130';
  SELECT id INTO v_acc_2140 FROM accounts WHERE code = '2140';
  SELECT id INTO v_acc_2200 FROM accounts WHERE code = '2200';

  IF v_acc_2130 IS NULL OR v_acc_2140 IS NULL OR v_acc_2200 IS NULL THEN
    RAISE EXCEPTION 'Required GL accounts (2130/2140/2200) not found.';
  END IF;

  -- Create journal entry
  INSERT INTO journal_entries (
    entry_number, date, description, status, branch_id,
    currency_code, exchange_rate, reference_type, reference_id,
    created_by, posted_by, posted_at
  ) VALUES (
    NULL,
    v_date_to,
    'VAT Settlement — ' || v_period_label,
    'Posted',
    v_je_branch_id,
    'SAR', 1.0,
    'vat_settlement', NULL,
    v_user_id, v_user_id, now()
  ) RETURNING id INTO v_je_id;

  IF v_net_payable >= 0 THEN
    -- Output >= Input: net amount owed to ZATCA
    --   Dr 2130 VAT Payable      [output_vat]  clear output side
    --   Cr 2140 VAT Recoverable  [input_vat]   clear input side
    --   Cr 2200 Tax Due ZATCA    [net_payable] record obligation

    v_line := v_line + 1;
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, base_debit, base_credit, description, line_number)
    VALUES (v_je_id, v_acc_2130, v_output_vat, 0, v_output_vat, 0,
            'Clear VAT Payable (Output) — ' || v_period_label, v_line);

    IF v_input_vat > 0 THEN
      v_line := v_line + 1;
      INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, base_debit, base_credit, description, line_number)
      VALUES (v_je_id, v_acc_2140, 0, v_input_vat, 0, v_input_vat,
              'Clear VAT Recoverable (Input) — ' || v_period_label, v_line);
    END IF;

    IF v_net_payable > 0 THEN
      v_line := v_line + 1;
      INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, base_debit, base_credit, description, line_number)
      VALUES (v_je_id, v_acc_2200, 0, v_net_payable, 0, v_net_payable,
              'Net VAT Due to ZATCA — ' || v_period_label, v_line);
    END IF;

  ELSE
    -- Input > Output: ZATCA owes company (refund)
    --   Dr 2200 Tax Authority    [|net|]        record ZATCA receivable
    --   Dr 2130 VAT Payable      [output_vat]   clear output side
    --   Cr 2140 VAT Recoverable  [input_vat]    clear input side

    v_line := v_line + 1;
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, base_debit, base_credit, description, line_number)
    VALUES (v_je_id, v_acc_2200, ABS(v_net_payable), 0, ABS(v_net_payable), 0,
            'VAT Refund Receivable from ZATCA — ' || v_period_label, v_line);

    IF v_output_vat > 0 THEN
      v_line := v_line + 1;
      INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, base_debit, base_credit, description, line_number)
      VALUES (v_je_id, v_acc_2130, v_output_vat, 0, v_output_vat, 0,
              'Clear VAT Payable (Output) — ' || v_period_label, v_line);
    END IF;

    v_line := v_line + 1;
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, base_debit, base_credit, description, line_number)
    VALUES (v_je_id, v_acc_2140, 0, v_input_vat, 0, v_input_vat,
            'Clear VAT Recoverable (Input) — ' || v_period_label, v_line);
  END IF;

  -- Create vat_return record
  INSERT INTO vat_returns (
    branch_id, period_month, period_year, date_from, date_to,
    total_output_vat, total_input_vat, net_vat_payable, is_refund,
    status, journal_entry_id, submitted_by, submitted_at, notes
  ) VALUES (
    p_branch_id, v_month, v_year, v_date_from, v_date_to,
    v_output_vat, v_input_vat, v_net_payable, (v_net_payable < 0),
    'submitted', v_je_id, v_user_id, now(), p_notes
  ) RETURNING id INTO v_return_id;

  -- Attach return ID to journal entry
  UPDATE journal_entries SET reference_id = v_return_id WHERE id = v_je_id;

  -- Mark all open transactions as settled
  UPDATE vat_transactions
  SET status        = 'settled',
      vat_return_id = v_return_id
  WHERE period_year  = v_year
    AND period_month = v_month
    AND status       = 'open'
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  RETURN v_return_id;
END;
$$;
