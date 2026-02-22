/*
  # Fix generate_payroll_run function - use net_pay instead of total_net_amount

  The function was referencing a column `total_net_amount` that does not exist.
  The correct column name is `net_pay`. This migration recreates the function
  using the correct column names that match the actual table schema.
*/

CREATE OR REPLACE FUNCTION public.generate_payroll_run(p_branch_id uuid, p_month integer, p_year integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
total_loan_deductions, net_pay,
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
net_pay               = v_total_net,
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
$function$;
