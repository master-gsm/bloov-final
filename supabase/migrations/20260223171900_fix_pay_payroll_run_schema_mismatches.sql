/*
  # Fix pay_payroll_run — Schema Mismatch Corrections

  ## Problems Fixed
  1. journal_entries status inserted as 'posted' (lowercase) — CHECK constraint requires 'Posted'
     Same pattern as BUG-01. Fixed: Draft → Insert Lines → UPDATE to Posted.
  2. cash_transactions uses shift_id (not register_id) and has no transaction_number column.
     Fixed: use shift_id from cash_shifts table, remove transaction_number.
  3. cash_registers has no current_balance column.
     Fixed: update cash_shifts.expected_balance instead (correct column on cash_shifts).
  4. cash_registers looked up by wrong table — actual open shift is in cash_shifts with status='open'.
     Fixed: query cash_shifts for open shift, use its id as shift_id.

  ## No logic changes — only schema alignment fixes.
*/

CREATE OR REPLACE FUNCTION public.pay_payroll_run(
  p_run_id        uuid,
  p_payment_method text DEFAULT 'cash'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_run                   payroll_runs%ROWTYPE;
  v_item                  payroll_items%ROWTYPE;
  v_expense_number        text;
  v_salary_total          numeric := 0;
  v_commission_total      numeric := 0;
  v_net_total             numeric := 0;
  v_shift_id              uuid;
  v_loan_id               uuid;
  v_je_id                 uuid;
  v_je_number             text;
  v_cash_account_id       uuid;
  v_salary_account_id     uuid;
  v_commission_account_id uuid;
  v_expense_seq           int;
  v_expense_seq_base      int;
BEGIN
  SELECT * INTO v_run FROM payroll_runs WHERE id = p_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run not found: %', p_run_id;
  END IF;
  IF v_run.status != 'approved' THEN
    RAISE EXCEPTION 'Payroll run must be approved before payment (current: %)', v_run.status;
  END IF;

  PERFORM set_config('app.bypass_immutable', 'true', true);

  SELECT id INTO v_cash_account_id       FROM accounts WHERE code = '1110' AND is_active = true LIMIT 1;
  SELECT id INTO v_salary_account_id     FROM accounts WHERE code = '6100' AND is_active = true LIMIT 1;
  SELECT id INTO v_commission_account_id FROM accounts WHERE code = '6110' AND is_active = true LIMIT 1;

  -- Base expense sequence offset to avoid collisions with existing records
  SELECT COALESCE(MAX(NULLIF(regexp_replace(expense_number, '[^0-9]', '', 'g'), '')::int), 0)
  INTO v_expense_seq_base
  FROM expenses
  WHERE expense_number LIKE 'EXP-' || TO_CHAR(now(), 'YYYYMMDD') || '-%';
  v_expense_seq := v_expense_seq_base + 1;

  FOR v_item IN
    SELECT * FROM payroll_items WHERE payroll_run_id = p_run_id
  LOOP
    v_expense_number := 'EXP-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD(v_expense_seq::text, 4, '0');
    v_expense_seq := v_expense_seq + 1;

    IF COALESCE(v_item.net_salary, v_item.net_pay, 0) > 0 THEN
      INSERT INTO expenses (
        id, expense_number, category, description, description_ar,
        amount, expense_date, payment_method, branch_id,
        created_by, created_at
      ) VALUES (
        gen_random_uuid(), v_expense_number, 'salaries',
        'Payroll: ' || TO_CHAR(make_date(v_run.period_year, v_run.period_month, 1), 'Month YYYY'),
        'رواتب: '   || TO_CHAR(make_date(v_run.period_year, v_run.period_month, 1), 'Month YYYY'),
        COALESCE(v_item.net_salary, v_item.net_pay, 0),
        CURRENT_DATE, p_payment_method, v_run.branch_id,
        v_run.created_by, now()
      );
      v_salary_total := v_salary_total + COALESCE(v_item.net_salary, v_item.net_pay, 0);
    END IF;

    IF COALESCE(v_item.commission_amount, v_item.commission_total, 0) > 0 THEN
      v_expense_number := 'EXP-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD(v_expense_seq::text, 4, '0');
      v_expense_seq := v_expense_seq + 1;

      INSERT INTO expenses (
        id, expense_number, category, description, description_ar,
        amount, expense_date, payment_method, branch_id,
        created_by, created_at
      ) VALUES (
        gen_random_uuid(), v_expense_number, 'commissions',
        'Commissions: ' || TO_CHAR(make_date(v_run.period_year, v_run.period_month, 1), 'Month YYYY'),
        'عمولات: '      || TO_CHAR(make_date(v_run.period_year, v_run.period_month, 1), 'Month YYYY'),
        COALESCE(v_item.commission_amount, v_item.commission_total, 0),
        CURRENT_DATE, p_payment_method, v_run.branch_id,
        v_run.created_by, now()
      );
      v_commission_total := v_commission_total + COALESCE(v_item.commission_amount, v_item.commission_total, 0);
    END IF;

    -- Mark commissions as paid
    UPDATE employee_commissions
    SET is_paid    = true,
        status     = 'approved',
        updated_at = now()
    WHERE employee_id  = v_item.employee_id
      AND period_month = v_run.period_month
      AND period_year  = v_run.period_year
      AND is_paid = false;

    -- Reduce active loan balance
    IF COALESCE(v_item.loan_deduction, 0) > 0 THEN
      SELECT id INTO v_loan_id
      FROM employee_loans
      WHERE employee_id = v_item.employee_id
        AND status      = 'active'
        AND branch_id   = v_run.branch_id
      LIMIT 1;

      IF v_loan_id IS NOT NULL THEN
        UPDATE employee_loans
        SET remaining_balance = GREATEST(remaining_balance - v_item.loan_deduction, 0),
            status = CASE
              WHEN remaining_balance - v_item.loan_deduction <= 0 THEN 'completed'
              ELSE status
            END,
            updated_at = now()
        WHERE id = v_loan_id;
      END IF;
    END IF;

    -- Mark unpaid leaves as deducted
    UPDATE employee_leaves
    SET payroll_deducted = true,
        updated_at       = now()
    WHERE employee_id      = v_item.employee_id
      AND leave_type       = 'unpaid'
      AND status           = 'approved'
      AND payroll_deducted = false
      AND EXTRACT(MONTH FROM start_date) = v_run.period_month
      AND EXTRACT(YEAR  FROM start_date) = v_run.period_year;
  END LOOP;

  v_net_total := v_salary_total + v_commission_total;

  -- Record cash movement if payment via cash/bank and an open shift exists
  IF p_payment_method IN ('cash', 'bank_transfer') THEN
    -- cash_shifts is the correct table; shift_id is the FK on cash_transactions
    SELECT id INTO v_shift_id
    FROM cash_shifts
    WHERE branch_id = v_run.branch_id
      AND status    = 'open'
    ORDER BY opened_at DESC
    LIMIT 1;

    IF v_shift_id IS NOT NULL THEN
      INSERT INTO cash_transactions (
        id, shift_id, branch_id, transaction_type,
        amount, description, reference_id, reference_type,
        created_by, created_at
      ) VALUES (
        gen_random_uuid(), v_shift_id, v_run.branch_id, 'expense_out',
        v_net_total,
        'Payroll: ' || TO_CHAR(make_date(v_run.period_year, v_run.period_month, 1), 'Month YYYY'),
        p_run_id, 'payroll_run',
        v_run.created_by, now()
      );

      -- Update expected_balance on the shift (cash_shifts has expected_balance, no current_balance)
      UPDATE cash_shifts
      SET expected_balance = expected_balance - v_net_total,
          updated_at       = now()
      WHERE id = v_shift_id;
    END IF;
  END IF;

  -- Post GL journal entry using Draft → Lines → Posted pattern
  IF v_cash_account_id IS NOT NULL AND v_net_total > 0 THEN
    v_je_id     := gen_random_uuid();
    v_je_number := 'JE-PAY-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || SUBSTRING(p_run_id::text, 1, 8);

    -- Step 1: Create as Draft (so protect_posted_entry_lines allows line inserts)
    INSERT INTO journal_entries (
      id, entry_number, date, description,
      branch_id, reference_id, reference_type,
      status, created_by, created_at, updated_at
    ) VALUES (
      v_je_id, v_je_number, CURRENT_DATE,
      'Payroll payment: ' || TO_CHAR(make_date(v_run.period_year, v_run.period_month, 1), 'Month YYYY'),
      v_run.branch_id, p_run_id, 'payroll_run',
      'Draft', v_run.created_by, now(), now()
    );

    -- Step 2: Insert lines (allowed while Draft)
    IF v_salary_total > 0 AND v_salary_account_id IS NOT NULL THEN
      INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, description, created_at)
      VALUES (gen_random_uuid(), v_je_id, v_salary_account_id, v_salary_total, 0, 'Salaries paid', now());
    END IF;

    IF v_commission_total > 0 THEN
      INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, description, created_at)
      VALUES (gen_random_uuid(), v_je_id, COALESCE(v_commission_account_id, v_salary_account_id), v_commission_total, 0, 'Commissions paid', now());
    END IF;

    INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, description, created_at)
    VALUES (gen_random_uuid(), v_je_id, v_cash_account_id, 0, v_net_total, 'Cash out: payroll', now());

    -- Step 3: Mark as Posted
    UPDATE journal_entries
    SET status     = 'Posted',
        posted_by  = v_run.created_by,
        posted_at  = now(),
        updated_at = now()
    WHERE id = v_je_id;
  END IF;

  -- Mark payroll run as paid
  UPDATE payroll_runs
  SET status         = 'paid',
      payment_method = p_payment_method,
      paid_at        = now(),
      approved_at    = COALESCE(approved_at, now()),
      updated_at     = now()
  WHERE id = p_run_id;

  PERFORM set_config('app.bypass_immutable', 'false', true);

  RETURN jsonb_build_object(
    'success',          true,
    'salary_total',     v_salary_total,
    'commission_total', v_commission_total,
    'net_total',        v_net_total,
    'shift_registered', (v_shift_id IS NOT NULL)
  );

EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.bypass_immutable', 'false', true);
  RAISE;
END;
$function$;
