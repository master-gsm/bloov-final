/*
  # Users ↔ Employees Bidirectional Sync

  ## Summary
  Establishes ERP-grade integration between the users and employees tables.

  ## Changes

  ### 1. Unique index on employees.user_id
  Enforces one-to-one relationship between users and employees.

  ### 2. Trigger: After UPDATE on users
  - full_name change → syncs to employees.full_name
  - branch_id change → syncs to employees.branch_id
  - is_active = false → deactivates employee + sets deactivated_at
  - is_active = true  → reactivates employee + clears deactivated_at

  ### 3. Trigger: After INSERT on users
  Defensive fallback: if no employee record exists for a new user, creates one automatically.

  ### 4. Backfill
  Creates employee records for any existing users that have none.

  ### 5. View: v_users_employees
  Convenience view joining users, employees, and branches for admin queries.

  ## Security
  - Trigger functions are SECURITY DEFINER to bypass RLS during automated sync
  - All functions use SET search_path = public, pg_catalog
*/

-- ============================================================
-- 1. UNIQUE CONSTRAINT: one employee per user
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'employees' AND indexname = 'employees_user_id_unique'
  ) THEN
    CREATE UNIQUE INDEX employees_user_id_unique
      ON employees(user_id)
      WHERE user_id IS NOT NULL;
  END IF;
END $$;

-- ============================================================
-- 2. TRIGGER FUNCTION: sync user changes → employee
-- ============================================================
CREATE OR REPLACE FUNCTION fn_sync_user_changes_to_employee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM employees WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  UPDATE employees
  SET
    full_name      = COALESCE(NEW.full_name, full_name),
    branch_id      = CASE WHEN NEW.branch_id IS NOT NULL THEN NEW.branch_id ELSE branch_id END,
    is_active      = NEW.is_active,
    deactivated_at = CASE
                       WHEN NEW.is_active = false AND OLD.is_active = true THEN now()
                       WHEN NEW.is_active = true THEN NULL
                       ELSE deactivated_at
                     END,
    updated_at     = now()
  WHERE user_id = NEW.id;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 3. TRIGGER: fire after update on users
-- ============================================================
DROP TRIGGER IF EXISTS trg_sync_user_to_employee ON users;

CREATE TRIGGER trg_sync_user_to_employee
  AFTER UPDATE OF full_name, branch_id, is_active
  ON users
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_user_changes_to_employee();

-- ============================================================
-- 4. TRIGGER FUNCTION: auto-create employee on user insert (fallback)
-- ============================================================
CREATE OR REPLACE FUNCTION fn_auto_create_employee_for_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM employees WHERE user_id = NEW.id) THEN
    INSERT INTO employees (
      user_id,
      employee_code,
      full_name,
      position,
      is_active,
      branch_id,
      hire_date
    ) VALUES (
      NEW.id,
      'EMP-' || UPPER(SUBSTRING(NEW.id::text, 1, 6)),
      COALESCE(NEW.full_name, 'موظف جديد'),
      COALESCE(NEW.role, 'viewer'),
      NEW.is_active,
      NEW.branch_id,
      CURRENT_DATE
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 5. TRIGGER: fire after insert on users
-- ============================================================
DROP TRIGGER IF EXISTS trg_auto_create_employee_for_user ON users;

CREATE TRIGGER trg_auto_create_employee_for_user
  AFTER INSERT
  ON users
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_create_employee_for_user();

-- ============================================================
-- 6. BACKFILL: create employees for any users missing one
-- ============================================================
INSERT INTO employees (user_id, employee_code, full_name, position, is_active, branch_id, hire_date)
SELECT
  u.id,
  'EMP-' || UPPER(SUBSTRING(u.id::text, 1, 6)),
  COALESCE(u.full_name, 'موظف'),
  COALESCE(u.role, 'viewer'),
  u.is_active,
  u.branch_id,
  CURRENT_DATE
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM employees e WHERE e.user_id = u.id)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 7. CONVENIENCE VIEW: users with their employee record
-- ============================================================
CREATE OR REPLACE VIEW v_users_employees
WITH (security_invoker = true)
AS
SELECT
  u.id                  AS user_id,
  u.full_name           AS user_full_name,
  u.role,
  u.is_active           AS user_is_active,
  u.branch_id,
  b.name                AS branch_name,
  e.id                  AS employee_id,
  e.employee_code,
  e.full_name           AS employee_full_name,
  e.position,
  e.basic_salary,
  e.employment_type,
  e.commission_rate,
  e.is_active           AS employee_is_active,
  e.hire_date,
  e.phone,
  u.created_at          AS user_created_at
FROM users u
LEFT JOIN employees e ON e.user_id = u.id
LEFT JOIN branches b ON b.id = u.branch_id;
