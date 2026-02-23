
/*
  # Bank Reconciliation Engine — Migration 4: Summary & Views

  ## Summary
  Reporting function and supporting views for the bank reconciliation module.

  ## `get_bank_reconciliation_summary(p_bank_account_id, p_date)`
  Returns a comprehensive reconciliation report:
  - book_balance:         GL balance of the linked cash/bank account as of p_date
  - bank_balance:         Closing balance from the latest statement import on/before p_date
  - difference:           bank_balance - book_balance
  - matched_count:        Active reconciliation_matches for lines in this account
  - unmatched_count:      Unmatched bank lines in all imports for this account
  - outstanding_deposits: Unmatched credits (payments from customers not yet in GL)
  - outstanding_checks:   Unmatched debits (payments to suppliers not yet in GL)
  - reconciliation_id:    ID of most recent reconciliation session (if any)
  - status:               Reconciliation status

  ## Views

  ### `v_bank_reconciliation_status`
  Per bank account live summary of matched vs unmatched lines.

  ### `v_unmatched_bank_lines`
  All unmatched bank statement lines with import metadata.

  ### `v_unmatched_journal_entries`
  Journal entries with cash/bank movements that have no reconciliation match.
*/

-- ── v_bank_reconciliation_status ──────────────────────────────────────────────
CREATE OR REPLACE VIEW v_bank_reconciliation_status AS
SELECT
  ba.id                                                       AS bank_account_id,
  ba.account_name,
  ba.branch_id,
  COUNT(bsl.id)                                               AS total_lines,
  COUNT(bsl.id) FILTER (WHERE bsl.is_matched = true)          AS matched_count,
  COUNT(bsl.id) FILTER (WHERE bsl.is_matched = false)         AS unmatched_count,
  COALESCE(SUM(bsl.credit) FILTER (WHERE bsl.is_matched = false), 0) AS unmatched_credits,
  COALESCE(SUM(bsl.debit)  FILTER (WHERE bsl.is_matched = false), 0) AS unmatched_debits,
  MAX(bsi.period_end)                                         AS latest_statement_date
FROM bank_accounts ba
LEFT JOIN bank_statement_imports bsi ON bsi.bank_account_id = ba.id AND bsi.is_deleted = false
LEFT JOIN bank_statement_lines bsl   ON bsl.import_id = bsi.id      AND bsl.is_deleted = false
WHERE ba.is_deleted = false
GROUP BY ba.id, ba.account_name, ba.branch_id;

-- ── v_unmatched_bank_lines ────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_unmatched_bank_lines AS
SELECT
  bsl.id              AS line_id,
  bsl.transaction_date,
  bsl.description,
  bsl.reference_number,
  bsl.debit,
  bsl.credit,
  bsl.balance,
  bsl.branch_id,
  bsi.bank_account_id,
  ba.account_name,
  bsi.period_start,
  bsi.period_end,
  bsl.created_at
FROM bank_statement_lines bsl
JOIN bank_statement_imports bsi ON bsi.id = bsl.import_id
JOIN bank_accounts          ba  ON ba.id  = bsi.bank_account_id
WHERE bsl.is_matched = false
  AND bsl.is_deleted = false
  AND bsi.is_deleted = false
  AND ba.is_deleted  = false
ORDER BY bsl.transaction_date DESC;

-- ── v_unmatched_journal_entries ───────────────────────────────────────────────
CREATE OR REPLACE VIEW v_unmatched_journal_entries AS
SELECT
  je.id             AS journal_entry_id,
  je.entry_number,
  je.date,
  je.description,
  je.branch_id,
  je.status,
  SUM(jl.debit)     AS total_debit,
  SUM(jl.credit)    AS total_credit
FROM journal_entries je
JOIN journal_lines jl ON jl.journal_entry_id = je.id
JOIN chart_of_accounts coa ON coa.id = jl.account_id
WHERE je.status = 'Posted'
  AND (coa.account_code LIKE '111%' OR coa.account_code LIKE '112%'
       OR coa.account_type ILIKE '%cash%' OR coa.account_type ILIKE '%bank%')
  AND NOT EXISTS (
    SELECT 1 FROM reconciliation_matches rm
    WHERE rm.journal_entry_id = je.id AND rm.is_deleted = false
  )
GROUP BY je.id, je.entry_number, je.date, je.description, je.branch_id, je.status
ORDER BY je.date DESC;

-- ── get_bank_reconciliation_summary() ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_bank_reconciliation_summary(
  p_bank_account_id uuid,
  p_date            date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ba              bank_accounts%ROWTYPE;
  v_recon_id        uuid;
  v_recon_status    text;
  v_book_balance    numeric := 0;
  v_bank_balance    numeric := 0;
  v_matched_count   integer := 0;
  v_unmatched_count integer := 0;
  v_out_deposits    numeric := 0;
  v_out_checks      numeric := 0;
  v_difference      numeric := 0;
  v_latest_import   uuid;
BEGIN
  -- Validate bank account
  SELECT * INTO v_ba FROM bank_accounts WHERE id = p_bank_account_id AND is_deleted = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bank account % not found.', p_bank_account_id;
  END IF;

  -- Book balance: GL net balance of linked account as of p_date
  IF v_ba.gl_account_id IS NOT NULL THEN
    SELECT
      COALESCE(SUM(jl.debit) - SUM(jl.credit), 0)
    INTO v_book_balance
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.account_id = v_ba.gl_account_id
      AND je.status = 'Posted'
      AND je.date <= p_date
      AND je.branch_id = v_ba.branch_id;
  END IF;

  -- Bank balance: closing_balance from latest import on/before p_date
  SELECT id, closing_balance INTO v_latest_import, v_bank_balance
  FROM bank_statement_imports
  WHERE bank_account_id = p_bank_account_id
    AND period_end <= p_date
    AND is_deleted = false
  ORDER BY period_end DESC, imported_at DESC
  LIMIT 1;

  -- Match counts for this account
  SELECT
    COUNT(*) FILTER (WHERE bsl.is_matched = true),
    COUNT(*) FILTER (WHERE bsl.is_matched = false)
  INTO v_matched_count, v_unmatched_count
  FROM bank_statement_lines bsl
  JOIN bank_statement_imports bsi ON bsi.id = bsl.import_id
  WHERE bsi.bank_account_id = p_bank_account_id
    AND bsl.is_deleted = false
    AND bsi.is_deleted = false
    AND bsl.transaction_date <= p_date;

  -- Outstanding deposits (unmatched credits = bank received but not in GL yet)
  SELECT COALESCE(SUM(bsl.credit), 0)
  INTO v_out_deposits
  FROM bank_statement_lines bsl
  JOIN bank_statement_imports bsi ON bsi.id = bsl.import_id
  WHERE bsi.bank_account_id = p_bank_account_id
    AND bsl.is_matched = false
    AND bsl.is_deleted = false
    AND bsl.credit > 0
    AND bsl.transaction_date <= p_date;

  -- Outstanding checks (unmatched debits = payments cleared at bank but not in GL)
  SELECT COALESCE(SUM(bsl.debit), 0)
  INTO v_out_checks
  FROM bank_statement_lines bsl
  JOIN bank_statement_imports bsi ON bsi.id = bsl.import_id
  WHERE bsi.bank_account_id = p_bank_account_id
    AND bsl.is_matched = false
    AND bsl.is_deleted = false
    AND bsl.debit > 0
    AND bsl.transaction_date <= p_date;

  v_difference := v_bank_balance - v_book_balance;

  -- Latest reconciliation for this account
  SELECT id, status INTO v_recon_id, v_recon_status
  FROM bank_reconciliations
  WHERE bank_account_id = p_bank_account_id
    AND is_deleted = false
  ORDER BY reconciliation_date DESC, created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'bank_account_id',      p_bank_account_id,
    'account_name',         v_ba.account_name,
    'branch_id',            v_ba.branch_id,
    'as_of_date',           p_date,
    'book_balance',         v_book_balance,
    'bank_balance',         v_bank_balance,
    'difference',           v_difference,
    'is_reconciled',        ABS(v_difference) < 0.01,
    'matched_count',        v_matched_count,
    'unmatched_count',      v_unmatched_count,
    'outstanding_deposits', v_out_deposits,
    'outstanding_checks',   v_out_checks,
    'reconciliation_id',    v_recon_id,
    'reconciliation_status',v_recon_status,
    'reconciliation_note',  CASE
      WHEN ABS(v_difference) < 0.01 THEN 'Fully reconciled'
      WHEN v_difference > 0         THEN 'Bank balance exceeds book — check for unrecorded deposits'
      ELSE 'Book balance exceeds bank — check for outstanding checks or bank charges'
    END
  );
END;
$$;

-- ── finalize_bank_reconciliation() ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION finalize_bank_reconciliation(
  p_reconciliation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recon    bank_reconciliations%ROWTYPE;
  v_summary  jsonb;
BEGIN
  SELECT * INTO v_recon FROM bank_reconciliations WHERE id = p_reconciliation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reconciliation % not found.', p_reconciliation_id;
  END IF;
  IF v_recon.status = 'finalized' THEN
    RAISE EXCEPTION 'Reconciliation is already finalized.';
  END IF;

  -- Get current summary
  v_summary := get_bank_reconciliation_summary(
    v_recon.bank_account_id,
    v_recon.reconciliation_date
  );

  -- Stamp balances onto the reconciliation record
  UPDATE bank_reconciliations
  SET
    book_balance = (v_summary->>'book_balance')::numeric,
    bank_balance = (v_summary->>'bank_balance')::numeric,
    status       = 'finalized'
  WHERE id = p_reconciliation_id;

  RETURN jsonb_build_object(
    'reconciliation_id', p_reconciliation_id,
    'status',            'finalized',
    'summary',           v_summary
  );
END;
$$;
