/*
  # Phase 2 — Partner Operation Router (Atomic GL + VAT + Domain)

  ## Purpose
  Any partner operation must route through ONE atomic function that:
    1. Routes to the correct domain (inventory / asset / expense / capital)
    2. Posts a balanced GL journal entry
    3. Records VAT Input in vat_transactions (if applicable)
    4. Prevents deletion — reversal only via void function

  ## Operation Types & GL Routing

  | type        | Dr account       | Cr account              | VAT? |
  |-------------|------------------|-------------------------|------|
  | capital     | 1110 Cash        | 3100 Capital            | No   |
  | inventory   | 1132 Inventory   | 3100 Capital / 2110 AP  | Yes? |
  | asset       | 1213 Equipment   | 3100 Capital / 2110 AP  | Yes? |
  | operational | 6000 Op Expense  | 3100 Capital / 1110 Cash| Yes? |
  | settlement  | 3100 (payer)     | 3100 (receiver)         | No   |

  ## New Functions
  - `post_partner_operation_atomic(p_payload jsonb)` — main router
  - `void_partner_operation_atomic(p_expense_id uuid, p_reason text)` — reversal only
  - `test_partner_operation_integrity(p_expense_id uuid)` — verification

  ## Idempotency
  - Checks for existing journal_entry with reference_type='setup_expense'
    and reference_id=expense_id before creating a new one.

  ## Void (Reversal)
  - Creates a reverse journal entry (all debits/credits flipped)
  - Marks setup_expense.is_deleted = true (soft delete)
  - Never hard-deletes financial records
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- Ensure accounts for assets (1213) and general expense (6000) exist
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '1213') THEN
    INSERT INTO accounts (id, code, name, type, created_at)
    VALUES (gen_random_uuid(), '1213', 'Equipment', 'Asset', now());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '3100') THEN
    INSERT INTO accounts (id, code, name, type, created_at)
    VALUES (gen_random_uuid(), '3100', 'Capital', 'Equity', now());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '6000') THEN
    INSERT INTO accounts (id, code, name, type, created_at)
    VALUES (gen_random_uuid(), '6000', 'Operating Expenses', 'Expense', now());
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- MAIN ROUTER FUNCTION
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_partner_operation_atomic(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_expense_id     uuid;
  v_partner_id     uuid;
  v_op_type        text;   -- capital | inventory | asset | operational
  v_amount         numeric;
  v_vat_amount     numeric := 0;
  v_net_amount     numeric;
  v_total_amount   numeric;
  v_vat_category   text;
  v_has_vat        boolean := false;
  v_expense_date   date;
  v_description    text;
  v_branch_id      uuid;
  v_user_id        uuid;
  v_payment_method text;

  -- GL accounts
  v_dr_account_id  uuid;
  v_cr_account_id  uuid;
  v_vat_account_id uuid;

  -- JE
  v_je_id          uuid;
  v_je_number      text;
  v_line_no        int := 0;

  -- Setup expense record
  v_expense        setup_expenses%ROWTYPE;
BEGIN
  PERFORM set_config('app.bypass_immutable', 'true', true);

  v_expense_id     := NULLIF(p_payload->>'expense_id', '')::uuid;
  v_partner_id     := NULLIF(p_payload->>'partner_id', '')::uuid;
  v_op_type        := COALESCE(p_payload->>'operation_type', 'operational');
  v_amount         := COALESCE((p_payload->>'amount')::numeric, 0);
  v_vat_amount     := COALESCE((p_payload->>'vat_amount')::numeric, 0);
  v_vat_category   := COALESCE(p_payload->>'vat_category', 'standard');
  v_expense_date   := COALESCE((p_payload->>'expense_date')::date, CURRENT_DATE);
  v_description    := COALESCE(p_payload->>'description', 'Partner Operation');
  v_payment_method := COALESCE(p_payload->>'payment_method', 'cash');
  v_user_id        := COALESCE(auth.uid(), NULLIF(p_payload->>'created_by','')::uuid);

  -- Get branch from expense record or payload
  IF v_expense_id IS NOT NULL THEN
    SELECT * INTO v_expense FROM setup_expenses WHERE id = v_expense_id;
    IF FOUND THEN
      v_branch_id := v_expense.branch_id;
    END IF;
  END IF;

  IF v_branch_id IS NULL THEN
    v_branch_id := NULLIF(p_payload->>'branch_id', '')::uuid;
  END IF;

  IF v_branch_id IS NULL THEN
    SELECT branch_id INTO v_branch_id FROM users WHERE id = v_user_id LIMIT 1;
  END IF;

  IF v_branch_id IS NULL THEN
    SELECT id INTO v_branch_id FROM branches LIMIT 1;
  END IF;

  -- Validation
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than 0';
  END IF;

  -- Idempotency: if GL already posted for this expense, skip
  IF v_expense_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM journal_entries
    WHERE reference_type = 'setup_expense'
      AND reference_id = v_expense_id
      AND status IN ('Draft','Posted')
  ) THEN
    PERFORM set_config('app.bypass_immutable', 'false', true);
    RETURN jsonb_build_object(
      'success', true, 'duplicate', true,
      'message', 'GL entry already exists for this expense'
    );
  END IF;

  -- Period lock check
  IF EXISTS (
    SELECT 1 FROM accounting_periods
    WHERE is_closed = true
      AND start_date <= v_expense_date
      AND end_date   >= v_expense_date
  ) THEN
    PERFORM set_config('app.bypass_immutable', 'false', true);
    RAISE EXCEPTION 'Accounting period is locked for date %', v_expense_date;
  END IF;

  -- VAT determination
  v_has_vat := v_vat_category = 'standard' AND v_vat_amount > 0;
  v_vat_amount   := CASE WHEN v_has_vat THEN ROUND(v_vat_amount, 2) ELSE 0 END;
  v_total_amount := ROUND(v_amount, 2);
  v_net_amount   := ROUND(v_total_amount - v_vat_amount, 2);

  -- Load fixed accounts
  SELECT id INTO v_vat_account_id FROM accounts WHERE code = '2140' LIMIT 1;

  -- ── ROUTE BY OPERATION TYPE ───────────────────────────────────────────────

  IF v_op_type = 'capital' OR v_op_type = 'cash' THEN
    -- Cash injected by partner → Dr Cash / Cr Capital
    SELECT id INTO v_dr_account_id FROM accounts WHERE code = '1110' LIMIT 1;
    SELECT id INTO v_cr_account_id FROM accounts WHERE code = '3100' LIMIT 1;

  ELSIF v_op_type = 'inventory' THEN
    -- Partner contributes stock → Dr Inventory / Cr Capital
    SELECT id INTO v_dr_account_id FROM accounts WHERE code = '1132' LIMIT 1;
    SELECT id INTO v_cr_account_id FROM accounts WHERE code = '3100' LIMIT 1;

  ELSIF v_op_type = 'asset' THEN
    -- Partner contributes fixed asset → Dr Equipment / Cr Capital
    SELECT id INTO v_dr_account_id FROM accounts WHERE code = '1213' LIMIT 1;
    SELECT id INTO v_cr_account_id FROM accounts WHERE code = '3100' LIMIT 1;

  ELSIF v_op_type = 'operational' OR v_op_type = 'expense' THEN
    -- Partner pays operating expense → Dr OpExpense / Cr Cash or Capital
    SELECT id INTO v_dr_account_id FROM accounts WHERE code = '6000' LIMIT 1;
    IF v_payment_method = 'cash' THEN
      SELECT id INTO v_cr_account_id FROM accounts WHERE code = '1110' LIMIT 1;
    ELSE
      SELECT id INTO v_cr_account_id FROM accounts WHERE code = '3100' LIMIT 1;
    END IF;

  ELSE
    RAISE EXCEPTION 'Unknown operation type: %. Use: capital, inventory, asset, operational', v_op_type;
  END IF;

  IF v_dr_account_id IS NULL THEN
    RAISE EXCEPTION 'Debit account not found for operation type: %', v_op_type;
  END IF;
  IF v_cr_account_id IS NULL THEN
    RAISE EXCEPTION 'Credit account (Capital/Cash) not found';
  END IF;

  -- ── VAT TRANSACTION ────────────────────────────────────────────────────────
  IF v_has_vat AND v_expense_id IS NOT NULL THEN
    INSERT INTO vat_transactions (
      id, source_type, source_id,
      taxable_amount, vat_amount, vat_category, tax_code, tax_rate,
      direction, period_month, period_year,
      transaction_date, branch_id, status,
      reference_type, reference_id, description,
      created_at
    ) VALUES (
      gen_random_uuid(), 'setup_expense', v_expense_id,
      v_net_amount, v_vat_amount, v_vat_category, 'S', 15,
      'input',
      EXTRACT(MONTH FROM v_expense_date)::int,
      EXTRACT(YEAR  FROM v_expense_date)::int,
      v_expense_date, v_branch_id, 'open',
      'setup_expense', v_expense_id,
      'VAT Input — ' || v_description,
      now()
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- ── JOURNAL ENTRY ──────────────────────────────────────────────────────────
  v_je_id := gen_random_uuid();
  v_je_number := 'JE-PARTNER-' || upper(v_op_type) || '-' ||
                 TO_CHAR(v_expense_date, 'YYYYMMDD') || '-' ||
                 SUBSTRING(COALESCE(v_expense_id::text, gen_random_uuid()::text), 1, 8);

  -- Insert Draft
  INSERT INTO journal_entries (
    id, entry_number, date, description,
    branch_id, reference_type, reference_id,
    status, created_by, created_at, updated_at
  ) VALUES (
    v_je_id, v_je_number, v_expense_date,
    v_op_type || ' — ' || v_description,
    v_branch_id,
    CASE WHEN v_expense_id IS NOT NULL THEN 'setup_expense' ELSE 'partner_operation' END,
    COALESCE(v_expense_id, v_je_id),
    'Draft', v_user_id, now(), now()
  );

  -- Line 1: Dr (net of VAT)
  v_line_no := 1;
  INSERT INTO journal_lines (
    id, journal_entry_id, account_id,
    debit, credit, base_debit, base_credit,
    description, line_number, created_at
  ) VALUES (
    gen_random_uuid(), v_je_id, v_dr_account_id,
    v_net_amount, 0, v_net_amount, 0,
    v_op_type || ' — ' || v_description,
    v_line_no, now()
  );

  -- Line 2: Dr VAT Input (if applicable)
  IF v_has_vat AND v_vat_account_id IS NOT NULL THEN
    v_line_no := 2;
    INSERT INTO journal_lines (
      id, journal_entry_id, account_id,
      debit, credit, base_debit, base_credit,
      description, line_number, created_at
    ) VALUES (
      gen_random_uuid(), v_je_id, v_vat_account_id,
      v_vat_amount, 0, v_vat_amount, 0,
      'VAT Input (2140) — ' || v_description,
      v_line_no, now()
    );
    v_line_no := 3;
  ELSE
    v_line_no := 2;
  END IF;

  -- Last Line: Cr Capital/Cash (full total)
  INSERT INTO journal_lines (
    id, journal_entry_id, account_id,
    debit, credit, base_debit, base_credit,
    description, line_number, created_at
  ) VALUES (
    gen_random_uuid(), v_je_id, v_cr_account_id,
    0, v_total_amount, 0, v_total_amount,
    CASE v_op_type
      WHEN 'capital'     THEN 'Partner Capital Injection — '
      WHEN 'inventory'   THEN 'Partner Inventory Contribution — '
      WHEN 'asset'       THEN 'Partner Asset Contribution — '
      ELSE                    'Partner Expense Payment — '
    END || v_description,
    v_line_no, now()
  );

  -- Post
  UPDATE journal_entries
  SET status = 'Posted', posted_by = v_user_id, posted_at = now(), updated_at = now()
  WHERE id = v_je_id;

  PERFORM set_config('app.bypass_immutable', 'false', true);

  RETURN jsonb_build_object(
    'success',          true,
    'duplicate',        false,
    'journal_entry_id', v_je_id,
    'operation_type',   v_op_type,
    'net_amount',       v_net_amount,
    'vat_amount',       v_vat_amount,
    'total_amount',     v_total_amount,
    'vat_recorded',     v_has_vat,
    'message',          'Partner operation posted to GL successfully'
  );

EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.bypass_immutable', 'false', true);
  RAISE;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.post_partner_operation_atomic(jsonb) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- VOID / REVERSAL FUNCTION
-- Creates reverse journal entry (never hard-deletes)
-- ─────────────────────────────────────────────────────────────────────────────
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

  v_user_id := auth.uid();

  -- Find original GL entry
  SELECT * INTO v_orig_je
  FROM journal_entries
  WHERE reference_type = 'setup_expense'
    AND reference_id = p_expense_id
    AND status = 'Posted'
  ORDER BY created_at DESC
  LIMIT 1;

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

  -- Also reverse VAT transaction
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

-- ─────────────────────────────────────────────────────────────────────────────
-- SETTLEMENT ATOMIC FUNCTION
-- partner_settlement: Dr Capital(payer) / Cr Capital(receiver)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_partner_settlement_atomic(
  p_settlement_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $settle_fn$
DECLARE
  v_s           partner_settlements%ROWTYPE;
  v_from        partners%ROWTYPE;
  v_to          partners%ROWTYPE;
  v_branch_id   uuid;
  v_user_id     uuid;
  v_capital_id  uuid;
  v_je_id       uuid;
  v_je_number   text;
BEGIN
  PERFORM set_config('app.bypass_immutable', 'true', true);

  SELECT * INTO v_s FROM partner_settlements WHERE id = p_settlement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement not found'; END IF;

  -- Idempotency
  IF EXISTS (
    SELECT 1 FROM journal_entries
    WHERE reference_type = 'partner_settlement'
      AND reference_id = p_settlement_id
      AND status IN ('Draft','Posted')
  ) THEN
    PERFORM set_config('app.bypass_immutable', 'false', true);
    RETURN jsonb_build_object('success', true, 'duplicate', true,
      'message', 'GL entry already exists for this settlement');
  END IF;

  SELECT * INTO v_from FROM partners WHERE id = v_s.from_partner_id;
  SELECT * INTO v_to   FROM partners WHERE id = v_s.to_partner_id;

  v_user_id := COALESCE(auth.uid(), v_s.created_by);

  -- Get branch from context or first available
  SELECT branch_id INTO v_branch_id FROM users WHERE id = v_user_id LIMIT 1;
  IF v_branch_id IS NULL THEN SELECT id INTO v_branch_id FROM branches LIMIT 1; END IF;

  SELECT id INTO v_capital_id FROM accounts WHERE code = '3100' LIMIT 1;
  IF v_capital_id IS NULL THEN RAISE EXCEPTION 'Account 3100 (Capital) not found'; END IF;

  v_je_id := gen_random_uuid();
  v_je_number := 'JE-SETTLE-' || TO_CHAR(v_s.settlement_date, 'YYYYMMDD') || '-'
                 || SUBSTRING(p_settlement_id::text, 1, 8);

  INSERT INTO journal_entries (
    id, entry_number, date, description,
    branch_id, reference_type, reference_id,
    status, created_by, created_at, updated_at
  ) VALUES (
    v_je_id, v_je_number, v_s.settlement_date,
    'Settlement: ' || COALESCE(v_from.name, '?') || ' → ' || COALESCE(v_to.name, '?'),
    v_branch_id, 'partner_settlement', p_settlement_id,
    'Draft', v_user_id, now(), now()
  );

  -- Dr Capital (payer reduces their equity)
  INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, base_debit, base_credit, description, line_number, created_at)
  VALUES (gen_random_uuid(), v_je_id, v_capital_id, v_s.amount, 0, v_s.amount, 0,
    'Settlement paid by ' || COALESCE(v_from.name, '?'), 1, now());

  -- Cr Capital (receiver increases their equity)
  INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, base_debit, base_credit, description, line_number, created_at)
  VALUES (gen_random_uuid(), v_je_id, v_capital_id, 0, v_s.amount, 0, v_s.amount,
    'Settlement received by ' || COALESCE(v_to.name, '?'), 2, now());

  UPDATE journal_entries
  SET status = 'Posted', posted_by = v_user_id, posted_at = now(), updated_at = now()
  WHERE id = v_je_id;

  PERFORM set_config('app.bypass_immutable', 'false', true);

  RETURN jsonb_build_object(
    'success',          true,
    'duplicate',        false,
    'journal_entry_id', v_je_id,
    'amount',           v_s.amount,
    'message',          'Settlement posted to GL successfully'
  );

EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.bypass_immutable', 'false', true);
  RAISE;
END;
$settle_fn$;

GRANT EXECUTE ON FUNCTION public.post_partner_settlement_atomic(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- TEST INTEGRITY FUNCTION
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.test_partner_operation_integrity(p_expense_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $test_fn$
DECLARE
  v_gl_count    int;
  v_gl_balance  numeric;
  v_vat_count   int;
  v_op_type     text;
BEGIN
  SELECT COUNT(*) INTO v_gl_count
  FROM journal_entries
  WHERE reference_type IN ('setup_expense','setup_expense_reversal')
    AND reference_id = p_expense_id AND status = 'Posted';

  SELECT COALESCE(SUM(debit) - SUM(credit), 0) INTO v_gl_balance
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.journal_entry_id
  WHERE je.reference_id = p_expense_id
    AND je.reference_type IN ('setup_expense','setup_expense_reversal');

  SELECT COUNT(*) INTO v_vat_count
  FROM vat_transactions
  WHERE reference_type = 'setup_expense' AND reference_id = p_expense_id;

  RETURN jsonb_build_object(
    'gl_entries_posted', v_gl_count,
    'gl_balanced',       ABS(v_gl_balance) < 0.01,
    'gl_balance_diff',   v_gl_balance,
    'vat_records',       v_vat_count,
    'all_checks_passed', v_gl_count >= 1 AND ABS(v_gl_balance) < 0.01
  );
END;
$test_fn$;

GRANT EXECUTE ON FUNCTION public.test_partner_operation_integrity(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGER: auto-post GL when a new setup_expense is inserted
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_setup_expense_post_gl()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $trg$
DECLARE
  v_result jsonb;
BEGIN
  -- Skip if soft-deleted or already voided
  IF NEW.is_deleted = true THEN RETURN NEW; END IF;

  -- Skip if session flag is set (called from within the atomic function itself)
  IF current_setting('app.skip_setup_expense_gl', true) = 'true' THEN RETURN NEW; END IF;

  SELECT public.post_partner_operation_atomic(
    jsonb_build_object(
      'expense_id',      NEW.id,
      'partner_id',      NEW.partner_id,
      'operation_type',  COALESCE(NEW.expense_type, 'operational'),
      'amount',          COALESCE(NEW.amount, 0),
      'vat_amount',      COALESCE(NEW.vat_amount, 0),
      'vat_category',    COALESCE(NEW.vat_category::text, 'standard'),
      'expense_date',    NEW.expense_date::text,
      'description',     COALESCE(NEW.description, 'Partner Expense'),
      'branch_id',       NEW.branch_id::text,
      'payment_method',  COALESCE(NEW.payment_method, 'cash'),
      'created_by',      NEW.created_by::text
    )
  ) INTO v_result;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'GL posting failed for setup_expense %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$trg$;

DROP TRIGGER IF EXISTS trg_setup_expense_post_gl ON setup_expenses;
CREATE TRIGGER trg_setup_expense_post_gl
  AFTER INSERT ON setup_expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_setup_expense_post_gl();

-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGER: auto-post GL when a new partner_settlement is inserted
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_partner_settlement_post_gl()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $trg2$
DECLARE
  v_result jsonb;
BEGIN
  IF NEW.status = 'voided' THEN RETURN NEW; END IF;

  SELECT public.post_partner_settlement_atomic(NEW.id) INTO v_result;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'GL posting failed for partner_settlement %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$trg2$;

DROP TRIGGER IF EXISTS trg_partner_settlement_post_gl ON partner_settlements;
CREATE TRIGGER trg_partner_settlement_post_gl
  AFTER INSERT ON partner_settlements
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_partner_settlement_post_gl();

-- ─────────────────────────────────────────────────────────────────────────────
-- Update void_setup_expense to use the new atomic void
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.void_setup_expense(
  p_expense_id uuid,
  p_reason     text DEFAULT 'Voided'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $void_se$
BEGIN
  RETURN public.void_partner_operation_atomic(p_expense_id, p_reason);
END;
$void_se$;

GRANT EXECUTE ON FUNCTION public.void_setup_expense(uuid, text) TO authenticated;
