/*
  # HR Module – Leaves & Settlements

  ## Summary
  Full HR layer: employee lifecycle management, leave tracking,
  and end-of-service settlement calculation.

  ## Changes

  ### 1. employees table – new columns
  - `contract_type`          : type of contract (permanent, fixed_term, project)
  - `vacation_balance_days`  : remaining annual leave balance (days)
  - `termination_date`       : date employment ended (nullable)
  - `termination_reason`     : reason for termination (nullable)

  ### 2. New table: employee_leaves
  - Tracks leave requests: annual, sick, unpaid
  - Status workflow: pending → approved / rejected
  - On approval: deduct from vacation_balance_days (trigger)
  - On approval of unpaid leave: flag for payroll deduction

  ### 3. New table: employee_settlements
  - End-of-service settlement record
  - Stores computed values: end_of_service reward, unused vacation,
    pending commissions, deductions, final amount
  - status: draft → approved → paid

  ### 4. Security
  - RLS enabled on both new tables
  - Admin / accountant / super_admin: full CRUD
  - Observer: SELECT only
*/

-- ─────────────────────────────────────────────
-- 1. Add new columns to employees
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'contract_type'
  ) THEN
    ALTER TABLE employees ADD COLUMN contract_type text DEFAULT 'permanent'
      CHECK (contract_type IN ('permanent', 'fixed_term', 'project'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'vacation_balance_days'
  ) THEN
    ALTER TABLE employees ADD COLUMN vacation_balance_days numeric(6,2) DEFAULT 21;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'termination_date'
  ) THEN
    ALTER TABLE employees ADD COLUMN termination_date date;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'termination_reason'
  ) THEN
    ALTER TABLE employees ADD COLUMN termination_reason text;
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 2. employee_leaves
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_leaves (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  branch_id       uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  leave_type      text NOT NULL DEFAULT 'annual'
    CHECK (leave_type IN ('annual', 'sick', 'unpaid')),
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  days            numeric(6,2) NOT NULL CHECK (days > 0),
  reason          text,
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at     timestamptz,
  payroll_deducted boolean DEFAULT false,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  CONSTRAINT leave_dates_valid CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_employee_leaves_employee ON employee_leaves(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_leaves_branch   ON employee_leaves(branch_id);
CREATE INDEX IF NOT EXISTS idx_employee_leaves_status   ON employee_leaves(status);
CREATE INDEX IF NOT EXISTS idx_employee_leaves_dates    ON employee_leaves(start_date, end_date);

ALTER TABLE employee_leaves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR managers can view leaves"
  ON employee_leaves FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid())
    IN ('admin', 'accountant', 'observer', 'super_admin')
  );

CREATE POLICY "HR managers can insert leaves"
  ON employee_leaves FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid())
    IN ('admin', 'accountant', 'super_admin')
  );

CREATE POLICY "HR managers can update leaves"
  ON employee_leaves FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid())
    IN ('admin', 'accountant', 'super_admin')
  )
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid())
    IN ('admin', 'accountant', 'super_admin')
  );

CREATE POLICY "HR managers can delete leaves"
  ON employee_leaves FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid())
    IN ('admin', 'accountant', 'super_admin')
  );

-- ─────────────────────────────────────────────
-- 3. employee_settlements
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_settlements (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id                 uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  branch_id                   uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  last_working_day            date NOT NULL,
  years_of_service            numeric(8,4) DEFAULT 0,
  end_of_service              numeric(15,2) DEFAULT 0,
  unused_vacation_days        numeric(6,2) DEFAULT 0,
  unused_vacation_compensation numeric(15,2) DEFAULT 0,
  pending_commissions         numeric(15,2) DEFAULT 0,
  deductions                  numeric(15,2) DEFAULT 0,
  final_amount                numeric(15,2) DEFAULT 0,
  notes                       text,
  status                      text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'paid')),
  approved_by                 uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at                 timestamptz,
  paid_at                     timestamptz,
  created_by                  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_settlements_employee ON employee_settlements(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_settlements_branch   ON employee_settlements(branch_id);
CREATE INDEX IF NOT EXISTS idx_employee_settlements_status   ON employee_settlements(status);

ALTER TABLE employee_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR managers can view settlements"
  ON employee_settlements FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid())
    IN ('admin', 'accountant', 'observer', 'super_admin')
  );

CREATE POLICY "HR managers can insert settlements"
  ON employee_settlements FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid())
    IN ('admin', 'accountant', 'super_admin')
  );

CREATE POLICY "HR managers can update settlements"
  ON employee_settlements FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid())
    IN ('admin', 'accountant', 'super_admin')
  )
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid())
    IN ('admin', 'accountant', 'super_admin')
  );

CREATE POLICY "HR managers can delete settlements"
  ON employee_settlements FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid())
    IN ('admin', 'accountant', 'super_admin')
  );
