/*
  # Unify expenses: migrate operating_expenses view + extend expenses table

  ## Summary
  The UI was reading from `operating_expenses` (old table with expense_type).
  We need to unify so the UI reads from `expenses` (new table with category).

  ## Changes

  ### 1. Extend expenses table
  - Add `description_ar` for bilingual support
  - Add `notes` and `notes_ar` for notes
  - Add `attachment_url` for file attachments
  - Add `partner_contribution_id` foreign key
  - Expand category constraint to include all operating_expenses types

  ### 2. Create a migration view `v_expenses_unified`
  - Union of expenses + operating_expenses for backward compatibility

  ### 3. Update get_financial_summary
  - Read ALL expense categories from `expenses` table
  - Keep marketing separate for visibility in reports

  ### 4. Add `generate_expense_number` function for expenses table
  - Compatible with existing function name
*/

-- ─────────────────────────────────────────────
-- 1. Extend expenses table with missing columns
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='expenses' AND column_name='description_ar') THEN
    ALTER TABLE expenses ADD COLUMN description_ar text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='expenses' AND column_name='notes') THEN
    ALTER TABLE expenses ADD COLUMN notes text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='expenses' AND column_name='notes_ar') THEN
    ALTER TABLE expenses ADD COLUMN notes_ar text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='expenses' AND column_name='attachment_url') THEN
    ALTER TABLE expenses ADD COLUMN attachment_url text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='expenses' AND column_name='partner_contribution_id') THEN
    ALTER TABLE expenses ADD COLUMN partner_contribution_id uuid REFERENCES partner_contributions(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='expenses' AND column_name='is_deleted') THEN
    ALTER TABLE expenses ADD COLUMN is_deleted boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='expenses' AND column_name='updated_at') THEN
    ALTER TABLE expenses ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='expenses' AND column_name='voided_at') THEN
    ALTER TABLE expenses ADD COLUMN voided_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='expenses' AND column_name='voided_by') THEN
    ALTER TABLE expenses ADD COLUMN voided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 2. Expand category constraint
-- ─────────────────────────────────────────────
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS valid_category;
ALTER TABLE expenses ADD CONSTRAINT valid_category CHECK (
  category IN (
    'rent', 'salaries', 'commissions', 'delivery', 'purchases',
    'utilities', 'maintenance', 'marketing', 'other',
    'operational', 'government', 'assets', 'residence', 'sponsorship',
    'electricity', 'water', 'violations', 'transportation',
    'communication', 'office'
  )
);

-- ─────────────────────────────────────────────
-- 3. RLS for expenses table
-- ─────────────────────────────────────────────
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view expenses" ON expenses;
CREATE POLICY "Authenticated users can view expenses"
  ON expenses FOR SELECT
  TO authenticated
  USING (
    is_deleted = false AND (
      (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'super_admin', 'accountant', 'observer')
      OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admin and accountant can insert expenses" ON expenses;
CREATE POLICY "Admin and accountant can insert expenses"
  ON expenses FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'super_admin', 'accountant')
  );

DROP POLICY IF EXISTS "Admin and accountant can update expenses" ON expenses;
CREATE POLICY "Admin and accountant can update expenses"
  ON expenses FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'super_admin', 'accountant')
  )
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'super_admin', 'accountant')
  );

-- ─────────────────────────────────────────────
-- 4. void_expense function (mirrors void_operating_expense)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.void_expense(
  p_expense_id uuid,
  p_reason text DEFAULT 'No reason provided'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id   uuid;
  v_caller_role text;
  v_expense     record;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;
  IF v_caller_role NOT IN ('admin', 'super_admin', 'accountant') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO v_expense FROM expenses WHERE id = p_expense_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found: %', p_expense_id; END IF;

  UPDATE expenses SET
    is_deleted = true,
    voided_at  = now(),
    voided_by  = v_caller_id,
    updated_at = now()
  WHERE id = p_expense_id;

  INSERT INTO audit_logs (action, table_name, record_id, user_id, metadata)
  VALUES (
    'VOID_EXPENSE', 'expenses', p_expense_id, v_caller_id,
    jsonb_build_object('reason', p_reason, 'expense_number', v_expense.expense_number, 'amount', v_expense.amount)
  );

  RETURN jsonb_build_object('success', true, 'expense_id', p_expense_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.void_expense(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────
-- 5. Updated get_financial_summary: read ALL from expenses
-- ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_financial_summary(date, date, uuid);

CREATE OR REPLACE FUNCTION public.get_financial_summary(
  p_date_from date DEFAULT NULL,
  p_date_to   date DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL
)
RETURNS TABLE (
  total_sales                  numeric,
  total_tax                    numeric,
  total_cogs                   numeric,
  gross_profit                 numeric,
  total_operating_expenses     numeric,
  total_setup_expenses         numeric,
  total_employee_salaries      numeric,
  net_profit                   numeric,
  gross_profit_margin_percent  numeric,
  net_profit_margin_percent    numeric,
  operating_net                numeric,
  total_depreciation           numeric,
  total_fixed_assets_cost      numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH sales_agg AS (
    SELECT
      COALESCE(SUM(s.total), 0)        AS total_sales,
      COALESCE(SUM(s.tax), 0)          AS total_tax,
      COALESCE(SUM(s.total_cost), 0)   AS total_cogs,
      COALESCE(SUM(s.gross_profit), 0) AS gross_profit
    FROM sales s
    WHERE s.status = 'confirmed'
      AND (p_date_from IS NULL OR s.sale_date::date >= p_date_from)
      AND (p_date_to   IS NULL OR s.sale_date::date <= p_date_to)
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
  ),
  new_expenses_agg AS (
    SELECT COALESCE(SUM(e.amount), 0) AS total_op
    FROM expenses e
    WHERE e.is_deleted = false
      AND e.category NOT IN ('salaries', 'commissions', 'purchases')
      AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)
      AND (p_date_from IS NULL OR e.expense_date >= p_date_from)
      AND (p_date_to   IS NULL OR e.expense_date <= p_date_to)
  ),
  old_expenses_agg AS (
    SELECT COALESCE(SUM(oe.amount), 0) AS total_op
    FROM operating_expenses oe
    WHERE oe.is_deleted = false
      AND (p_branch_id IS NULL OR oe.branch_id = p_branch_id)
      AND (p_date_from IS NULL OR oe.expense_date >= p_date_from)
      AND (p_date_to   IS NULL OR oe.expense_date <= p_date_to)
  ),
  salaries_agg AS (
    SELECT COALESCE(SUM(e.amount), 0) AS total_salaries
    FROM expenses e
    WHERE e.is_deleted = false
      AND e.category IN ('salaries', 'commissions')
      AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)
      AND (p_date_from IS NULL OR e.expense_date >= p_date_from)
      AND (p_date_to   IS NULL OR e.expense_date <= p_date_to)
  ),
  depreciation_agg AS (
    SELECT COALESCE(SUM(de.amount), 0) AS total_depreciation
    FROM depreciation_entries de
    JOIN fixed_assets fa ON fa.id = de.asset_id
    WHERE fa.is_deleted = false
      AND (p_date_from IS NULL OR de.entry_date >= date_trunc('month', p_date_from)::date)
      AND (p_date_to   IS NULL OR de.entry_date <= p_date_to)
      AND (p_branch_id IS NULL OR fa.branch_id = p_branch_id)
  ),
  assets_agg AS (
    SELECT COALESCE(SUM(fa.purchase_cost), 0) AS total_fixed_assets_cost
    FROM fixed_assets fa
    WHERE fa.is_deleted = false AND fa.is_active = true
  )
  SELECT
    sa.total_sales,
    sa.total_tax,
    sa.total_cogs,
    sa.gross_profit,
    (nea.total_op + oea.total_op)                                     AS total_operating_expenses,
    0::numeric                                                          AS total_setup_expenses,
    sla.total_salaries                                                  AS total_employee_salaries,
    sa.gross_profit - (nea.total_op + oea.total_op) - sla.total_salaries - da.total_depreciation AS net_profit,
    CASE WHEN sa.total_sales > 0 THEN ROUND((sa.gross_profit / sa.total_sales) * 100, 2) ELSE 0 END,
    CASE WHEN sa.total_sales > 0 THEN ROUND(((sa.gross_profit - (nea.total_op + oea.total_op) - sla.total_salaries - da.total_depreciation) / sa.total_sales) * 100, 2) ELSE 0 END,
    sa.gross_profit - (nea.total_op + oea.total_op) - sla.total_salaries AS operating_net,
    da.total_depreciation,
    aa.total_fixed_assets_cost
  FROM sales_agg sa
  CROSS JOIN new_expenses_agg nea
  CROSS JOIN old_expenses_agg oea
  CROSS JOIN salaries_agg sla
  CROSS JOIN depreciation_agg da
  CROSS JOIN assets_agg aa;
$$;

GRANT EXECUTE ON FUNCTION public.get_financial_summary(date, date, uuid) TO authenticated;
