/*
  # Fix iqama renewal function - remove company_id reference

  1. Changes
    - Remove reference to `company_id` column which doesn't exist on employees table
    - Keep all other functionality intact (audit logging, permission checks, date calculation)
*/

CREATE OR REPLACE FUNCTION public.fn_renew_iqama(
  p_employee_id UUID,
  p_duration_months INTEGER DEFAULT NULL,
  p_custom_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee RECORD;
  v_user_role TEXT;
  v_user_id UUID;
  v_old_expiry DATE;
  v_new_expiry DATE;
  v_days_remaining INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT role INTO v_user_role
  FROM users
  WHERE id = v_user_id;

  IF v_user_role NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Insufficient permissions: only super_admin or admin can renew iqama';
  END IF;

  SELECT id, full_name, full_name_ar, iqama_number, iqama_expiry_date, branch_id
  INTO v_employee
  FROM employees
  WHERE id = p_employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  v_old_expiry := v_employee.iqama_expiry_date;

  IF p_custom_date IS NOT NULL THEN
    v_new_expiry := p_custom_date;
  ELSIF p_duration_months IS NOT NULL AND p_duration_months > 0 THEN
    IF v_old_expiry IS NOT NULL THEN
      v_new_expiry := v_old_expiry + (p_duration_months || ' months')::INTERVAL;
    ELSE
      v_new_expiry := CURRENT_DATE + (p_duration_months || ' months')::INTERVAL;
    END IF;
  ELSE
    RAISE EXCEPTION 'Either duration_months or custom_date must be provided';
  END IF;

  IF v_new_expiry <= CURRENT_DATE THEN
    RAISE EXCEPTION 'New expiry date must be in the future';
  END IF;

  UPDATE employees
  SET iqama_expiry_date = v_new_expiry,
      iqama_notes = COALESCE(iqama_notes, '') ||
        CASE WHEN COALESCE(iqama_notes, '') = '' THEN '' ELSE E'\n' END ||
        '[' || TO_CHAR(now(), 'YYYY-MM-DD HH24:MI') || '] ' ||
        CASE WHEN p_duration_months IS NOT NULL
          THEN 'Renewed +' || p_duration_months || 'mo'
          ELSE 'Renewed to ' || TO_CHAR(v_new_expiry, 'YYYY-MM-DD')
        END ||
        ' (from ' || COALESCE(TO_CHAR(v_old_expiry, 'YYYY-MM-DD'), 'N/A') || ')',
      updated_at = now()
  WHERE id = p_employee_id;

  v_days_remaining := v_new_expiry - CURRENT_DATE;

  INSERT INTO audit_logs (
    id, user_id, action, table_name, record_id,
    metadata, created_at
  ) VALUES (
    gen_random_uuid(),
    v_user_id,
    'IQAMA_RENEWAL',
    'employees',
    p_employee_id,
    jsonb_build_object(
      'employee_name', v_employee.full_name,
      'employee_name_ar', v_employee.full_name_ar,
      'iqama_number', v_employee.iqama_number,
      'old_expiry_date', v_old_expiry,
      'new_expiry_date', v_new_expiry,
      'duration_months', p_duration_months,
      'custom_date', p_custom_date,
      'days_remaining', v_days_remaining,
      'branch_id', v_employee.branch_id,
      'renewed_at', now()
    ),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'employee_id', p_employee_id,
    'employee_name', v_employee.full_name,
    'old_expiry_date', v_old_expiry,
    'new_expiry_date', v_new_expiry,
    'days_remaining', v_days_remaining,
    'message', 'Iqama renewed successfully'
  );
END;
$$;
