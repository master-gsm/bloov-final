/*
  # Fix pay_payroll_run: use generate_expense_number instead of missing sequence
*/

CREATE OR REPLACE FUNCTION public.pay_payroll_run(
  p_run_id         uuid,
  p_payment_method text DEFAULT 'bank_transfer'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id    uuid;
  v_caller_role  text;
  v_run          record;
  v_period_start date;
  v_period_end   date;
  v_sal_expense_id uuid;
  v_com_expense_id uuid;
  v_exp_number   text;
  v_item         record;
  v_loan         record;
BEGIN
  v_caller_id := auth.uid();
  SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;
  IF v_caller_role NOT IN ('admin','super_admin','accountant') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO v_run FROM payroll_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run not found: %', p_run_id; END IF;
  IF v_run.status <> 'approved' THEN
    RAISE EXCEPTION 'Payroll run must be approved before payment (current: %)', v_run.status;
  END IF;

  v_period_start := make_date(v_run.period_year, v_run.period_month, 1);
  v_period_end   := (v_period_start + interval '1 month - 1 day')::date;

  IF v_run.total_base_salary > 0 THEN
    v_exp_number := generate_expense_number();
    INSERT INTO expenses (
      expense_number, category, amount, description, expense_date,
      payment_method, branch_id, created_by
    ) VALUES (
      v_exp_number,
      'salaries',
      v_run.total_base_salary,
      'Payroll run ' || v_run.run_number || ' — base salaries (' || v_run.period_month || '/' || v_run.period_year || ')',
      v_period_end,
      p_payment_method,
      v_run.branch_id,
      v_caller_id
    )
    RETURNING id INTO v_sal_expense_id;
  END IF;

  IF v_run.total_commissions > 0 THEN
    v_exp_number := generate_expense_number();
    INSERT INTO expenses (
      expense_number, category, amount, description, expense_date,
      payment_method, branch_id, created_by
    ) VALUES (
      v_exp_number,
      'commissions',
      v_run.total_commissions,
      'Payroll run ' || v_run.run_number || ' — commissions (' || v_run.period_month || '/' || v_run.period_year || ')',
      v_period_end,
      p_payment_method,
      v_run.branch_id,
      v_caller_id
    )
    RETURNING id INTO v_com_expense_id;
  END IF;

  FOR v_item IN
    SELECT pi.employee_id, pi.commission_amount, pi.loan_deduction, pi.unpaid_leave_deduction
    FROM payroll_items pi
    WHERE pi.payroll_run_id = p_run_id
  LOOP
    IF v_item.commission_amount > 0 THEN
      UPDATE employee_commissions SET
        is_paid = true,
        status  = 'approved'
      WHERE employee_id = v_item.employee_id
        AND is_paid = false
        AND (status IS NULL OR status NOT IN ('void','paid'))
        AND created_at::date BETWEEN v_period_start AND v_period_end;
    END IF;

    IF v_item.loan_deduction > 0 THEN
      SELECT * INTO v_loan
      FROM employee_loans
      WHERE employee_id = v_item.employee_id AND status = 'active'
      ORDER BY created_at
      LIMIT 1;

      IF FOUND THEN
        IF v_loan.remaining_balance - v_item.loan_deduction <= 0 THEN
          UPDATE employee_loans SET
            remaining_balance = 0,
            status = 'completed',
            updated_at = now()
          WHERE id = v_loan.id;
        ELSE
          UPDATE employee_loans SET
            remaining_balance = remaining_balance - v_item.loan_deduction,
            updated_at = now()
          WHERE id = v_loan.id;
        END IF;
      END IF;
    END IF;

    IF v_item.unpaid_leave_deduction > 0 THEN
      UPDATE employee_leaves SET
        payroll_deducted = true
      WHERE employee_id = v_item.employee_id
        AND leave_type = 'unpaid'
        AND status = 'approved'
        AND payroll_deducted = false
        AND start_date BETWEEN v_period_start AND v_period_end;
    END IF;
  END LOOP;

  UPDATE payroll_runs SET
    status         = 'paid',
    payment_method = p_payment_method,
    paid_at        = now(),
    expense_id     = v_sal_expense_id,
    updated_at     = now()
  WHERE id = p_run_id;

  RETURN jsonb_build_object(
    'success',               true,
    'run_id',                p_run_id,
    'status',                'paid',
    'salary_expense_id',     v_sal_expense_id,
    'commission_expense_id', v_com_expense_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pay_payroll_run(uuid, text) TO authenticated;
