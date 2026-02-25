/*
  # Add Iqama Fields and Residence Status View

  1. New Columns
    - `employees.iqama_issue_date` (date) - Iqama issue date
    - `employees.iqama_notes` (text) - Optional notes about residence status

  2. New View
    - `v_employee_residence_status`
      - Calculates residence status dynamically (expired / expiring_soon / valid)
      - Includes days to expiry (positive for future, negative for past)
      - Unified logic for UI, alerts, and reports

  3. Status Logic
    - expired: expiry_date < today
    - expiring_soon: expiry_date between today and today + 30 days
    - valid: expiry_date > today + 30 days

  4. Security
    - View inherits RLS from employees table
    - SECURITY INVOKER ensures proper permission checks
*/

-- Add new columns to employees table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'iqama_issue_date'
  ) THEN
    ALTER TABLE public.employees ADD COLUMN iqama_issue_date date;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'iqama_notes'
  ) THEN
    ALTER TABLE public.employees ADD COLUMN iqama_notes text;
  END IF;
END $$;

-- Create residence status view
CREATE OR REPLACE VIEW public.v_employee_residence_status
WITH (security_invoker = true)
AS
SELECT
  e.id AS employee_id,
  e.full_name AS employee_name,
  e.full_name_ar AS employee_name_ar,
  e.iqama_number,
  e.iqama_issue_date,
  e.iqama_expiry_date,
  e.branch_id,
  e.is_active,
  -- Days to expiry (positive = future, negative = past)
  CASE
    WHEN e.iqama_expiry_date IS NOT NULL
    THEN (e.iqama_expiry_date - CURRENT_DATE)
    ELSE NULL
  END AS days_to_expiry,
  -- Residence status
  CASE
    WHEN e.iqama_expiry_date IS NULL THEN 'no_data'
    WHEN e.iqama_expiry_date < CURRENT_DATE THEN 'expired'
    WHEN e.iqama_expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'expiring_soon'
    ELSE 'valid'
  END AS residence_status
FROM public.employees e
WHERE e.is_active = true;

-- Add comment for documentation
COMMENT ON VIEW public.v_employee_residence_status IS 'Dynamic view showing employee residence (iqama) status with calculated days to expiry and status category. Used for alerts, dashboard widgets, and employee management UI.';
