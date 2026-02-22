/*
  # HR Functions & Triggers

  ## Summary
  Business logic for the HR module:

  1. `calculate_end_of_service(employee_id, last_working_day)`
     - Computes gratuity per Saudi Labor Law (Article 84)
     - First 5 years: ½ month salary per year
     - After 5 years: 1 full month salary per year
     - Resignation < 2 years: no gratuity
     - Resignation 2–10 years: 1/3 → 2/3 of entitlement
     - Termination by employer: 100% of entitlement
     - Returns: years_of_service, end_of_service, unused_vacation_compensation,
       pending_commissions, and suggested final_amount

  2. `apply_leave_approval()` trigger
     - Fires AFTER UPDATE on employee_leaves
     - When status changes to 'approved':
       • annual/sick → deduct `days` from vacation_balance_days (floor at 0)
       • unpaid → sets payroll_deducted = false (payroll will handle deduction)
     - When status changes to 'rejected': no balance change

  3. `prevent_terminated_employee_salary()` trigger
     - Fires BEFORE INSERT on salary_payments
     - Blocks inserting salary for an employee whose termination_date IS NOT NULL
       and is on or before the payment period_start

  4. `update_hr_updated_at()` trigger
     - Keeps updated_at current on employee_leaves and employee_settlements
*/

-- ─────────────────────────────────────────────
-- Helper: keep updated_at current
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_hr_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employee_leaves_updated_at ON employee_leaves;
CREATE TRIGGER trg_employee_leaves_updated_at
  BEFORE UPDATE ON employee_leaves
  FOR EACH ROW EXECUTE FUNCTION update_hr_updated_at();

DROP TRIGGER IF EXISTS trg_employee_settlements_updated_at ON employee_settlements;
CREATE TRIGGER trg_employee_settlements_updated_at
  BEFORE UPDATE ON employee_settlements
  FOR EACH ROW EXECUTE FUNCTION update_hr_updated_at();

-- ─────────────────────────────────────────────
-- Trigger: apply leave approval effects
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_leave_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    IF NEW.leave_type IN ('annual', 'sick') THEN
      UPDATE employees
      SET vacation_balance_days = GREATEST(0, vacation_balance_days - NEW.days),
          updated_at = now()
      WHERE id = NEW.employee_id;
    END IF;

    IF NEW.leave_type = 'unpaid' THEN
      NEW.payroll_deducted = false;
    END IF;

    NEW.approved_at = now();
  END IF;

  IF NEW.status = 'rejected' AND OLD.status = 'approved'
     AND NEW.leave_type IN ('annual', 'sick') THEN
    UPDATE employees
    SET vacation_balance_days = vacation_balance_days + NEW.days,
        updated_at = now()
    WHERE id = NEW.employee_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_leave_approval ON employee_leaves;
CREATE TRIGGER trg_apply_leave_approval
  BEFORE UPDATE ON employee_leaves
  FOR EACH ROW EXECUTE FUNCTION apply_leave_approval();

-- ─────────────────────────────────────────────
-- Trigger: block terminated employee in payroll
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_terminated_employee_salary()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_termination_date date;
BEGIN
  SELECT termination_date INTO v_termination_date
  FROM employees
  WHERE id = NEW.employee_id;

  IF v_termination_date IS NOT NULL AND v_termination_date <= NEW.period_start THEN
    RAISE EXCEPTION
      'Cannot create salary payment: employee was terminated on %',
      v_termination_date
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_terminated_salary ON salary_payments;
CREATE TRIGGER trg_prevent_terminated_salary
  BEFORE INSERT ON salary_payments
  FOR EACH ROW EXECUTE FUNCTION prevent_terminated_employee_salary();

-- ─────────────────────────────────────────────
-- Function: calculate end-of-service settlement
-- Saudi Labor Law – Article 84
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.calculate_end_of_service(
  p_employee_id    uuid,
  p_last_day       date,
  p_termination_by text DEFAULT 'employer'  -- 'employer' | 'resignation'
)
RETURNS TABLE (
  years_of_service             numeric,
  monthly_salary               numeric,
  gratuity_entitlement         numeric,
  end_of_service               numeric,
  unused_vacation_days         numeric,
  unused_vacation_compensation numeric,
  pending_commissions          numeric,
  suggested_final_amount       numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hire_date          date;
  v_basic_salary       numeric;
  v_vacation_balance   numeric;
  v_years              numeric;
  v_first_5_years      numeric;
  v_beyond_5_years     numeric;
  v_gratuity           numeric;
  v_factor             numeric;
  v_vacation_comp      numeric;
  v_commissions        numeric;
BEGIN
  SELECT e.hire_date, e.basic_salary, COALESCE(e.vacation_balance_days, 0)
  INTO v_hire_date, v_basic_salary, v_vacation_balance
  FROM employees e
  WHERE e.id = p_employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found: %', p_employee_id;
  END IF;

  v_years := EXTRACT(EPOCH FROM (p_last_day - v_hire_date)) / (365.25 * 24 * 3600);

  IF v_years <= 0 THEN
    v_gratuity := 0;
  ELSE
    v_first_5_years  := LEAST(v_years, 5);
    v_beyond_5_years := GREATEST(0, v_years - 5);
    v_gratuity := (v_first_5_years * v_basic_salary * 0.5)
                + (v_beyond_5_years * v_basic_salary);
  END IF;

  IF p_termination_by = 'resignation' THEN
    IF v_years < 2 THEN
      v_factor := 0;
    ELSIF v_years < 5 THEN
      v_factor := 1.0 / 3.0;
    ELSIF v_years < 10 THEN
      v_factor := 2.0 / 3.0;
    ELSE
      v_factor := 1.0;
    END IF;
    v_gratuity := v_gratuity * v_factor;
  END IF;

  v_vacation_comp := (v_vacation_balance / 30.0) * v_basic_salary;

  SELECT COALESCE(SUM(ec.commission_amount), 0)
  INTO v_commissions
  FROM employee_commissions ec
  WHERE ec.employee_id = p_employee_id
    AND (ec.status = 'pending' OR ec.is_paid = false)
    AND ec.status <> 'void';

  RETURN QUERY SELECT
    ROUND(v_years, 4)::numeric,
    v_basic_salary,
    ROUND(v_gratuity, 2)::numeric,
    ROUND(v_gratuity, 2)::numeric,
    v_vacation_balance,
    ROUND(v_vacation_comp, 2)::numeric,
    ROUND(v_commissions, 2)::numeric,
    ROUND(v_gratuity + v_vacation_comp + v_commissions, 2)::numeric;
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_end_of_service(uuid, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_leave_approval() TO authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_terminated_employee_salary() TO authenticated;
