
/*
  # Bank Reconciliation Engine — Migration 5: Fix GL Account References

  ## Summary
  journal_lines.account_id references the `accounts` table (not `chart_of_accounts`).
  This migration:
  1. Drops the incorrect FK on bank_accounts.gl_account_id (was → chart_of_accounts).
  2. Adds correct FK → accounts.
  3. Recreates matching helpers and views using `accounts` table for cash/bank lookups.
  4. Recreates get_bank_reconciliation_summary() with corrected GL balance query.

  No existing data is changed.
*/

-- ── 1. Fix bank_accounts.gl_account_id FK ────────────────────────────────────
ALTER TABLE bank_accounts
  DROP CONSTRAINT IF EXISTS bank_accounts_gl_account_id_fkey;

ALTER TABLE bank_accounts
  ADD CONSTRAINT bank_accounts_gl_account_id_fkey
  FOREIGN KEY (gl_account_id) REFERENCES accounts(id);

-- ── 2. Fix _get_je_net_amount helper ─────────────────────────────────────────
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
  JOIN accounts a ON a.id = jl.account_id
  WHERE jl.journal_entry_id = p_je_id
    AND (a.code LIKE '111%' OR a.code LIKE '112%'
         OR a.type ILIKE '%cash%' OR a.type ILIKE '%bank%'
         OR a.name ILIKE '%cash%' OR a.name ILIKE '%bank%');
$$;

-- ── 3. Fix v_unmatched_journal_entries view ───────────────────────────────────
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
JOIN accounts a ON a.id = jl.account_id
WHERE je.status = 'Posted'
  AND (a.code LIKE '111%' OR a.code LIKE '112%'
       OR a.type ILIKE '%cash%' OR a.type ILIKE '%bank%'
       OR a.name ILIKE '%cash%' OR a.name ILIKE '%bank%')
  AND NOT EXISTS (
    SELECT 1 FROM reconciliation_matches rm
    WHERE rm.journal_entry_id = je.id AND rm.is_deleted = false
  )
GROUP BY je.id, je.entry_number, je.date, je.description, je.branch_id, je.status
ORDER BY je.date DESC;

-- ── 4. Fix get_bank_reconciliation_summary ────────────────────────────────────
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
BEGIN
  SELECT * INTO v_ba FROM bank_accounts WHERE id = p_bank_account_id AND is_deleted = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bank account % not found.', p_bank_account_id;
  END IF;

  -- Book balance from GL (accounts table via journal_lines)
  IF v_ba.gl_account_id IS NOT NULL THEN
    SELECT COALESCE(SUM(jl.debit) - SUM(jl.credit), 0)
    INTO v_book_balance
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.account_id = v_ba.gl_account_id
      AND je.status = 'Posted'
      AND je.date <= p_date
      AND je.branch_id = v_ba.branch_id;
  END IF;

  -- Bank balance from latest statement import closing balance
  SELECT COALESCE(closing_balance, 0) INTO v_bank_balance
  FROM bank_statement_imports
  WHERE bank_account_id = p_bank_account_id
    AND period_end <= p_date
    AND is_deleted = false
  ORDER BY period_end DESC, imported_at DESC
  LIMIT 1;

  -- Match counts
  SELECT
    COUNT(*) FILTER (WHERE bsl.is_matched = true),
    COUNT(*) FILTER (WHERE bsl.is_matched = false)
  INTO v_matched_count, v_unmatched_count
  FROM bank_statement_lines bsl
  JOIN bank_statement_imports bsi ON bsi.id = bsl.import_id
  WHERE bsi.bank_account_id = p_bank_account_id
    AND bsl.is_deleted = false AND bsi.is_deleted = false
    AND bsl.transaction_date <= p_date;

  -- Outstanding deposits (unmatched credits = bank received but not in GL yet)
  SELECT COALESCE(SUM(bsl.credit), 0) INTO v_out_deposits
  FROM bank_statement_lines bsl
  JOIN bank_statement_imports bsi ON bsi.id = bsl.import_id
  WHERE bsi.bank_account_id = p_bank_account_id
    AND bsl.is_matched = false AND bsl.is_deleted = false
    AND bsl.credit > 0 AND bsl.transaction_date <= p_date;

  -- Outstanding checks (unmatched debits)
  SELECT COALESCE(SUM(bsl.debit), 0) INTO v_out_checks
  FROM bank_statement_lines bsl
  JOIN bank_statement_imports bsi ON bsi.id = bsl.import_id
  WHERE bsi.bank_account_id = p_bank_account_id
    AND bsl.is_matched = false AND bsl.is_deleted = false
    AND bsl.debit > 0 AND bsl.transaction_date <= p_date;

  v_difference := v_bank_balance - v_book_balance;

  SELECT id, status INTO v_recon_id, v_recon_status
  FROM bank_reconciliations
  WHERE bank_account_id = p_bank_account_id AND is_deleted = false
  ORDER BY reconciliation_date DESC, created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'bank_account_id',       p_bank_account_id,
    'account_name',          v_ba.account_name,
    'branch_id',             v_ba.branch_id,
    'as_of_date',            p_date,
    'book_balance',          v_book_balance,
    'bank_balance',          v_bank_balance,
    'difference',            v_difference,
    'is_reconciled',         ABS(v_difference) < 0.01,
    'matched_count',         v_matched_count,
    'unmatched_count',       v_unmatched_count,
    'outstanding_deposits',  v_out_deposits,
    'outstanding_checks',    v_out_checks,
    'reconciliation_id',     v_recon_id,
    'reconciliation_status', v_recon_status,
    'reconciliation_note',   CASE
      WHEN ABS(v_difference) < 0.01 THEN 'Fully reconciled'
      WHEN v_difference > 0         THEN 'Bank balance exceeds book — check for unrecorded deposits'
      ELSE 'Book balance exceeds bank — check for outstanding checks or bank charges'
    END
  );
END;
$$;
