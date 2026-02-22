/*
  # Payroll SQL Functions

  ## Summary
  All payroll math happens in SQL — zero computation in React.

  ## Functions

  ### generate_payroll_run(p_branch_id, p_month, p_year)
  - Prevents duplicate run for same month/branch
  - Pulls all active non-terminated employees
  - Pulls pending commissions for the period
  - Applies active loans as monthly deductions
  - Applies approved unpaid leave for the month as salary deductions
  - Calculates net_salary per employee
  - Stores totals on payroll_runs header

  ### approve_payroll_run(p_run_id)
  - Validates run is in draft status
  - Sets status = 'approved'

  ### pay_payroll_run(p_run_id, p_payment_method)
  - Validates run is in approved status
  - Creates expense category='salaries'
  - Creates expense category='commissions'
  - Marks employee_commissions.is_paid = true for included commissions
  - Reduces employee_loans.remaining_balance; closes if 0
  - Sets status = 'paid', paid_at = now()
*/

-- ─────────────────────────────────────────────
-- generate_payroll_run
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_payroll_run(
  p_branch_id uuid,
  p_month     integer,
  p_year      integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id    uuid;
  v_caller_role  text;
  v_run_id       uuid;
  v_period_start date;
  v_period_end   date;
  v_run_number   text;

  v_emp          record;
  v_commission   numeric;
  v_loan_ded     numeric;
  v_leave_ded    numeric;
  v_net          numeric;

  v_total_base   numeric := 0;
  v_total_comm   numeric := 0;
  v_total_loan   numeric := 0;
  v_total_net    numeric := 0;
BEGIN
  v_caller_id := auth.uid();
  SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;
  IF v_caller_role NOT IN ('admin','super_admin','accountant') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  IF p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'Invalid month: %', p_month;
  END IF;

  v_period_start := make_date(p_year, p_month, 1);
  v_period_end   := (v_period_start + interval '1 month - 1 day')::date;

  v_run_number := 'PAY-' || LPAD(p_year::text, 4, '0') || '-' || LPAD(p_month::text, 2, '0') || '-' || UPPER(LEFT(p_branch_id::text, 8));

  INSERT INTO payroll_runs (
    branch_id, period_month, period_year, status,
    run_number, total_base_salary, total_commissions,
    total_loan_deductions, total_net_amount,
    created_by
  )
  VALUES (
    p_branch_id, p_month, p_year, 'draft',
    v_run_number, 0, 0, 0, 0,
    v_caller_id
  )
  RETURNING id INTO v_run_id;

  FOR v_emp IN
    SELECT e.id, e.basic_salary
    FROM employees e
    WHERE e.branch_id = p_branch_id
      AND e.is_active = true
      AND (e.termination_date IS NULL OR e.termination_date > v_period_end)
  LOOP
    SELECT COALESCE(SUM(ec.commission_amount), 0)
    INTO v_commission
    FROM employee_commissions ec
    WHERE ec.employee_id = v_emp.id
      AND ec.is_paid = false
      AND (ec.status IS NULL OR ec.status NOT IN ('void','paid'))
      AND ec.created_at::date BETWEEN v_period_start AND v_period_end;

    SELECT COALESCE(LEAST(el.monthly_deduction, el.remaining_balance), 0)
    INTO v_loan_ded
    FROM employee_loans el
    WHERE el.employee_id = v_emp.id
      AND el.status = 'active'
    ORDER BY el.created_at
    LIMIT 1;

    IF v_loan_ded IS NULL THEN v_loan_ded := 0; END IF;

    SELECT COALESCE(
      SUM((el2.days / 30.0) * v_emp.basic_salary), 0
    )
    INTO v_leave_ded
    FROM employee_leaves el2
    WHERE el2.employee_id = v_emp.id
      AND el2.leave_type = 'unpaid'
      AND el2.status = 'approved'
      AND el2.payroll_deducted = false
      AND el2.start_date BETWEEN v_period_start AND v_period_end;

    IF v_leave_ded IS NULL THEN v_leave_ded := 0; END IF;

    v_net := v_emp.basic_salary + v_commission - v_loan_ded - v_leave_ded;
    IF v_net < 0 THEN v_net := 0; END IF;

    INSERT INTO payroll_items (
      payroll_run_id, employee_id,
      base_salary, commission_amount,
      loan_deduction, unpaid_leave_deduction,
      net_salary
    ) VALUES (
      v_run_id, v_emp.id,
      v_emp.basic_salary, v_commission,
      v_loan_ded, v_leave_ded,
      v_net
    )
    ON CONFLICT (payroll_run_id, employee_id) DO NOTHING;

    v_total_base := v_total_base + v_emp.basic_salary;
    v_total_comm := v_total_comm + v_commission;
    v_total_loan := v_total_loan + v_loan_ded;
    v_total_net  := v_total_net  + v_net;
  END LOOP;

  UPDATE payroll_runs SET
    total_base_salary     = v_total_base,
    total_commissions     = v_total_comm,
    total_loan_deductions = v_total_loan,
    total_net_amount      = v_total_net,
    updated_at            = now()
  WHERE id = v_run_id;

  RETURN jsonb_build_object(
    'success',         true,
    'run_id',          v_run_id,
    'run_number',      v_run_number,
    'total_employees', (SELECT COUNT(*) FROM payroll_items WHERE payroll_run_id = v_run_id),
    'total_net',       v_total_net
  );

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'A payroll run already exists for branch % month %/% — delete the existing draft first.', p_branch_id, p_month, p_year;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_payroll_run(uuid, integer, integer) TO authenticated;

-- ─────────────────────────────────────────────
-- approve_payroll_run
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_payroll_run(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id   uuid;
  v_caller_role text;
  v_run         record;
BEGIN
  v_caller_id := auth.uid();
  SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;
  IF v_caller_role NOT IN ('admin','super_admin','accountant') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO v_run FROM payroll_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run not found: %', p_run_id; END IF;
  IF v_run.status <> 'draft' THEN
    RAISE EXCEPTION 'Payroll run is not in draft status (current: %)', v_run.status;
  END IF;

  UPDATE payroll_runs SET
    status      = 'approved',
    approved_by = v_caller_id,
    approved_at = now(),
    updated_at  = now()
  WHERE id = p_run_id;

  RETURN jsonb_build_object('success', true, 'run_id', p_run_id, 'status', 'approved');
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_payroll_run(uuid) TO authenticated;

-- ─────────────────────────────────────────────
-- pay_payroll_run
-- ─────────────────────────────────────────────
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
    SELECT 'EXP-SAL-' || nextval('expense_number_seq')::text INTO v_exp_number;
    INSERT INTO expenses (
      expense_number, category, amount, description, expense_date,
      payment_method, branch_id, created_by
    ) VALUES (
      v_exp_number,
      'salaries',
      v_run.total_base_salary,
      'Payroll run ' || v_run.run_number || ' — base salaries',
      v_period_end,
      p_payment_method,
      v_run.branch_id,
      v_caller_id
    )
    RETURNING id INTO v_sal_expense_id;
  END IF;

  IF v_run.total_commissions > 0 THEN
    SELECT 'EXP-COM-' || nextval('expense_number_seq')::text INTO v_exp_number;
    INSERT INTO expenses (
      expense_number, category, amount, description, expense_date,
      payment_method, branch_id, created_by
    ) VALUES (
      v_exp_number,
      'commissions',
      v_run.total_commissions,
      'Payroll run ' || v_run.run_number || ' — commissions',
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
        is_paid    = true,
        status     = 'approved',
        payment_id = NULL
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
    'success',          true,
    'run_id',           p_run_id,
    'status',           'paid',
    'salary_expense_id', v_sal_expense_id,
    'commission_expense_id', v_com_expense_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pay_payroll_run(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────
-- delete_draft_payroll_run
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_draft_payroll_run(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_status text;
BEGIN
  SELECT role INTO v_caller_role FROM users WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin','super_admin','accountant') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT status INTO v_status FROM payroll_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run not found'; END IF;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft payroll runs can be deleted';
  END IF;

  DELETE FROM payroll_items WHERE payroll_run_id = p_run_id;
  DELETE FROM payroll_runs WHERE id = p_run_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_draft_payroll_run(uuid) TO authenticated;
