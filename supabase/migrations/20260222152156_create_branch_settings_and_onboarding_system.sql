/*
  # Branch Settings Table & Full Branch Onboarding System

  ## Summary
  This migration introduces a complete "branch onboarding" system. Every time a new
  branch is inserted into the `branches` table, a database trigger fires and atomically:

  1. Creates a `branch_settings` row with default VAT rate, invoice numbering format,
     and other per-branch configuration.
  2. Creates a `cash_register` row in 'closed' status (ready to be opened by staff).
  3. Writes an `audit_logs` entry documenting the creation event.

  If any step fails the entire transaction is rolled back — no partial branch exists.

  ## New Tables
  - `branch_settings`
    - `id` (uuid, PK)
    - `branch_id` (uuid, FK → branches, UNIQUE – one settings row per branch)
    - `tax_rate` (numeric, default 0.15 = 15% VAT)
    - `invoice_prefix` (text, default = branch code, e.g. "MAIN")
    - `invoice_number_format` (text, default '{PREFIX}-{YYYY}-{SEQ}')
    - `invoice_sequence` (integer, default 1 – auto-incremented per branch)
    - `currency` (text, default 'SAR')
    - `allow_credit_sales` (boolean, default true)
    - `credit_limit_default` (numeric, default 0)
    - `require_customer_for_credit` (boolean, default true)
    - `allow_discount` (boolean, default true)
    - `max_discount_percent` (numeric, default 100)
    - `created_at` / `updated_at` timestamps

  ## New Function
  - `initialize_branch_onboarding()` – TRIGGER FUNCTION
    Runs AFTER INSERT ON branches. Performs all onboarding steps atomically.

  ## New Trigger
  - `trg_branch_onboarding` on `branches` AFTER INSERT

  ## Security
  - RLS enabled on `branch_settings`
  - super_admin: full CRUD
  - admin/accountant: SELECT their own branch settings
  - No user can insert/update/delete branch_settings directly (managed by trigger)
*/

-- ============================================================
-- 1. branch_settings table
-- ============================================================
CREATE TABLE IF NOT EXISTS branch_settings (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id                   uuid NOT NULL UNIQUE REFERENCES branches(id) ON DELETE CASCADE,
  tax_rate                    numeric(5,4) NOT NULL DEFAULT 0.1500,
  invoice_prefix              text NOT NULL DEFAULT '',
  invoice_number_format       text NOT NULL DEFAULT '{PREFIX}-{YYYY}-{SEQ}',
  invoice_sequence            integer NOT NULL DEFAULT 1,
  currency                    text NOT NULL DEFAULT 'SAR',
  allow_credit_sales          boolean NOT NULL DEFAULT true,
  credit_limit_default        numeric(12,2) NOT NULL DEFAULT 0,
  require_customer_for_credit boolean NOT NULL DEFAULT true,
  allow_discount              boolean NOT NULL DEFAULT true,
  max_discount_percent        numeric(5,2) NOT NULL DEFAULT 100.00,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE branch_settings ENABLE ROW LEVEL SECURITY;

-- updated_at auto-maintenance
CREATE OR REPLACE FUNCTION update_branch_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_branch_settings_updated_at ON branch_settings;
CREATE TRIGGER trg_branch_settings_updated_at
  BEFORE UPDATE ON branch_settings
  FOR EACH ROW EXECUTE FUNCTION update_branch_settings_updated_at();

-- ============================================================
-- 2. RLS Policies for branch_settings
-- ============================================================

-- super_admin sees all
CREATE POLICY "super_admin can select branch_settings"
  ON branch_settings FOR SELECT
  TO authenticated
  USING ((SELECT role FROM users WHERE id = auth.uid()) = 'super_admin');

-- branch members can view their own branch settings
CREATE POLICY "branch members can view own branch_settings"
  ON branch_settings FOR SELECT
  TO authenticated
  USING (branch_id = (SELECT branch_id FROM users WHERE id = auth.uid()));

-- super_admin can insert (also used by trigger via SECURITY DEFINER function)
CREATE POLICY "super_admin can insert branch_settings"
  ON branch_settings FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT role FROM users WHERE id = auth.uid()) = 'super_admin');

-- super_admin can update
CREATE POLICY "super_admin can update branch_settings"
  ON branch_settings FOR UPDATE
  TO authenticated
  USING ((SELECT role FROM users WHERE id = auth.uid()) = 'super_admin')
  WITH CHECK ((SELECT role FROM users WHERE id = auth.uid()) = 'super_admin');

-- super_admin can delete
CREATE POLICY "super_admin can delete branch_settings"
  ON branch_settings FOR DELETE
  TO authenticated
  USING ((SELECT role FROM users WHERE id = auth.uid()) = 'super_admin');

-- ============================================================
-- 3. initialize_branch_onboarding() trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION initialize_branch_onboarding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_id   uuid;
  v_branch_code text;
  v_branch_name text;
  v_creator_id  uuid;
BEGIN
  v_branch_id   := NEW.id;
  v_branch_code := NEW.code;
  v_branch_name := NEW.name;
  v_creator_id  := auth.uid();

  -- ---- Step 1: branch_settings ----
  INSERT INTO branch_settings (
    branch_id,
    tax_rate,
    invoice_prefix,
    invoice_number_format,
    invoice_sequence,
    currency,
    allow_credit_sales,
    credit_limit_default,
    require_customer_for_credit,
    allow_discount,
    max_discount_percent
  ) VALUES (
    v_branch_id,
    0.1500,                          -- 15% VAT default
    v_branch_code,                   -- prefix = branch code
    '{PREFIX}-{YYYY}-{SEQ}',
    1,
    'SAR',
    true,
    0,
    true,
    true,
    100.00
  );

  -- ---- Step 2: cash_register (closed, balance=0) ----
  INSERT INTO cash_registers (
    branch_id,
    open_date,
    opening_balance,
    status,
    opened_by,
    notes
  ) VALUES (
    v_branch_id,
    CURRENT_DATE,
    0,
    'closed',
    v_creator_id,
    'تم الإنشاء تلقائياً عند تهيئة الفرع / Auto-created during branch onboarding'
  );

  -- ---- Step 3: audit log ----
  INSERT INTO audit_logs (
    user_id,
    action,
    table_name,
    record_id,
    branch_id,
    new_data,
    records_affected,
    metadata,
    created_at
  ) VALUES (
    v_creator_id,
    'BRANCH_ONBOARDING',
    'branches',
    v_branch_id,
    v_branch_id,
    jsonb_build_object(
      'branch_id',   v_branch_id,
      'branch_code', v_branch_code,
      'branch_name', v_branch_name,
      'steps',       ARRAY['branch_settings created', 'cash_register created']
    ),
    1,
    jsonb_build_object('onboarding_version', '1.0', 'triggered_at', now()),
    now()
  );

  RETURN NEW;
END;
$$;

-- ============================================================
-- 4. Attach trigger to branches table
-- ============================================================
DROP TRIGGER IF EXISTS trg_branch_onboarding ON branches;
CREATE TRIGGER trg_branch_onboarding
  AFTER INSERT ON branches
  FOR EACH ROW
  EXECUTE FUNCTION initialize_branch_onboarding();

-- ============================================================
-- 5. Back-fill: ensure existing branches already have settings
--    (idempotent – skip if row already exists)
-- ============================================================
INSERT INTO branch_settings (branch_id, invoice_prefix)
SELECT b.id, b.code
FROM branches b
WHERE NOT EXISTS (
  SELECT 1 FROM branch_settings bs WHERE bs.branch_id = b.id
)
ON CONFLICT (branch_id) DO NOTHING;

-- Back-fill cash_register for branches that have none
INSERT INTO cash_registers (branch_id, open_date, opening_balance, status, notes)
SELECT b.id, CURRENT_DATE, 0, 'closed',
       'Back-fill: auto-created for existing branch'
FROM branches b
WHERE NOT EXISTS (
  SELECT 1 FROM cash_registers cr WHERE cr.branch_id = b.id
)
ON CONFLICT DO NOTHING;
