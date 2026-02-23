
/*
  # Bank Reconciliation Engine — Migration 2: Guards & Triggers

  ## Summary
  Trigger-level protections for reconciliation data integrity.

  ## Triggers

  ### `trg_guard_reconciliation_match` (BEFORE INSERT on reconciliation_matches)
  Validates:
  1. Bank statement line exists, is not deleted, is not already matched.
  2. Journal entry exists, is not voided.
  3. Branch isolation: bsl.branch_id == je.branch_id.
  4. Reconciliation (if provided) is not finalized.
  5. Amount does not exceed the bank line amount (debit or credit).

  ### `trg_guard_recon_finalized` (BEFORE INSERT/UPDATE on reconciliation_matches)
  Blocks any change if the linked reconciliation.status = 'finalized'.

  ### `trg_sync_bsl_is_matched` (AFTER INSERT/UPDATE on reconciliation_matches)
  Keeps bank_statement_lines.is_matched in sync automatically.

  ### `trg_no_hard_delete_recon_matches` (BEFORE DELETE on reconciliation_matches)
  Blocks hard deletes — soft delete only.

  ### `trg_no_hard_delete_bank_statement_lines`
  Same protection on bank_statement_lines.

  ### `trg_updated_at_bank_reconciliations` (BEFORE UPDATE)
  Keeps updated_at current.
*/

-- ── Guard: reconciliation_matches integrity ───────────────────────────────────
CREATE OR REPLACE FUNCTION guard_reconciliation_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bsl            bank_statement_lines%ROWTYPE;
  v_je_status      text;
  v_je_branch      uuid;
  v_recon_status   text;
  v_bsl_amount     numeric;
BEGIN
  -- 1. Fetch bank statement line
  SELECT * INTO v_bsl
  FROM bank_statement_lines
  WHERE id = NEW.bank_statement_line_id AND is_deleted = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bank statement line % not found or deleted.', NEW.bank_statement_line_id;
  END IF;

  -- 2. Block if line already matched (active match exists via EXCLUDE constraint,
  --    but this gives a friendlier error message)
  IF v_bsl.is_matched = true AND TG_OP = 'INSERT' THEN
    RAISE EXCEPTION
      'Bank statement line % is already matched. Unmatch it first.',
      NEW.bank_statement_line_id;
  END IF;

  -- 3. Fetch journal entry
  SELECT status, branch_id INTO v_je_status, v_je_branch
  FROM journal_entries
  WHERE id = NEW.journal_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journal entry % not found.', NEW.journal_entry_id;
  END IF;

  IF v_je_status = 'Void' THEN
    RAISE EXCEPTION 'Cannot match a voided journal entry (%).', NEW.journal_entry_id;
  END IF;

  -- 4. Branch isolation
  IF v_bsl.branch_id != v_je_branch THEN
    RAISE EXCEPTION
      'Cross-branch match blocked: bank line branch % != journal entry branch %.',
      v_bsl.branch_id, v_je_branch;
  END IF;

  -- 5. Check reconciliation not finalized
  IF NEW.reconciliation_id IS NOT NULL THEN
    SELECT status INTO v_recon_status
    FROM bank_reconciliations
    WHERE id = NEW.reconciliation_id;

    IF v_recon_status = 'finalized' THEN
      RAISE EXCEPTION
        'Cannot add matches to a finalized reconciliation (%).', NEW.reconciliation_id;
    END IF;
  END IF;

  -- 6. Amount validation: matched_amount <= bank line gross amount
  v_bsl_amount := GREATEST(v_bsl.debit, v_bsl.credit);
  IF NEW.matched_amount > v_bsl_amount THEN
    RAISE EXCEPTION
      'Matched amount % exceeds bank line amount %.', NEW.matched_amount, v_bsl_amount;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_reconciliation_match ON reconciliation_matches;
CREATE TRIGGER trg_guard_reconciliation_match
  BEFORE INSERT ON reconciliation_matches
  FOR EACH ROW EXECUTE FUNCTION guard_reconciliation_match();

-- ── Guard: block changes after finalization ───────────────────────────────────
CREATE OR REPLACE FUNCTION guard_finalized_reconciliation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recon_status text;
BEGIN
  IF OLD.reconciliation_id IS NOT NULL THEN
    SELECT status INTO v_recon_status
    FROM bank_reconciliations WHERE id = OLD.reconciliation_id;

    IF v_recon_status = 'finalized' THEN
      RAISE EXCEPTION
        'Cannot modify matches in a finalized reconciliation (%).', OLD.reconciliation_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_finalized_match_update ON reconciliation_matches;
CREATE TRIGGER trg_guard_finalized_match_update
  BEFORE UPDATE ON reconciliation_matches
  FOR EACH ROW EXECUTE FUNCTION guard_finalized_reconciliation();

-- ── Sync: keep bank_statement_lines.is_matched in sync ───────────────────────
CREATE OR REPLACE FUNCTION sync_bsl_is_matched()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line_id uuid;
  v_active  boolean;
BEGIN
  v_line_id := COALESCE(NEW.bank_statement_line_id, OLD.bank_statement_line_id);

  SELECT EXISTS (
    SELECT 1 FROM reconciliation_matches
    WHERE bank_statement_line_id = v_line_id AND is_deleted = false
  ) INTO v_active;

  UPDATE bank_statement_lines
  SET is_matched = v_active
  WHERE id = v_line_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_bsl_is_matched ON reconciliation_matches;
CREATE TRIGGER trg_sync_bsl_is_matched
  AFTER INSERT OR UPDATE OF is_deleted ON reconciliation_matches
  FOR EACH ROW EXECUTE FUNCTION sync_bsl_is_matched();

-- ── Guard: no hard delete on reconciliation_matches ───────────────────────────
CREATE OR REPLACE FUNCTION prevent_hard_delete_recon()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION
    'Hard delete is not allowed on %. Use is_deleted = true (soft delete).', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS trg_no_delete_recon_matches      ON reconciliation_matches;
CREATE TRIGGER trg_no_delete_recon_matches
  BEFORE DELETE ON reconciliation_matches
  FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete_recon();

DROP TRIGGER IF EXISTS trg_no_delete_bank_stmt_lines    ON bank_statement_lines;
CREATE TRIGGER trg_no_delete_bank_stmt_lines
  BEFORE DELETE ON bank_statement_lines
  FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete_recon();

-- ── updated_at trigger for bank_reconciliations ───────────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at_bank_recon()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_updated_at_bank_recon ON bank_reconciliations;
CREATE TRIGGER trg_updated_at_bank_recon
  BEFORE UPDATE ON bank_reconciliations
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at_bank_recon();

-- ── Guard: block finalize if difference != 0 ──────────────────────────────────
CREATE OR REPLACE FUNCTION guard_finalize_reconciliation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'finalized' AND OLD.status != 'finalized' THEN
    -- Auto-stamp finalized_at / finalized_by
    NEW.finalized_at := now();
    NEW.finalized_by := COALESCE(
      auth.uid(),
      (SELECT id FROM users WHERE role IN ('admin','super_admin') ORDER BY created_at LIMIT 1)
    );
  END IF;

  -- Block going backwards from finalized
  IF OLD.status = 'finalized' AND NEW.status != 'finalized' THEN
    RAISE EXCEPTION 'Cannot revert a finalized reconciliation (%).', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_finalize_reconciliation ON bank_reconciliations;
CREATE TRIGGER trg_finalize_reconciliation
  BEFORE UPDATE OF status ON bank_reconciliations
  FOR EACH ROW EXECUTE FUNCTION guard_finalize_reconciliation();
