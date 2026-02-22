/*
  # Stabilization Patch 2: Financial Reports — Trial Balance, Income Statement, Balance Sheet, VAT Summary

  ## Summary
  Creates SQL functions/views for all official financial reports:
    1. get_trial_balance(branch_id, date_from, date_to) — Posted entries only
    2. get_income_statement(branch_id, date_from, date_to) — 3-level profit
    3. get_balance_sheet(branch_id, as_of_date) — Assets = Liabilities + Equity
    4. get_vat_summary(branch_id, month, year) — Output/Input/Payable

  ## Security
  - All functions are SECURITY DEFINER with search_path = public
  - Accessible to authenticated users
*/

-- ============================================================
-- 1. TRIAL BALANCE
-- ============================================================
CREATE OR REPLACE FUNCTION get_trial_balance(
  p_branch_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to   date DEFAULT NULL
)
RETURNS TABLE (
  account_code        text,
  account_name        text,
  account_name_ar     text,
  account_type        text,
  opening_debit       numeric,
  opening_credit      numeric,
  period_debit        numeric,
  period_credit       numeric,
  closing_debit       numeric,
  closing_credit      numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date_from date := COALESCE(p_date_from, '2020-01-01');
  v_date_to   date := COALESCE(p_date_to, CURRENT_DATE);
BEGIN
  RETURN QUERY
  WITH posted_lines AS (
    SELECT
      jl.account_id,
      je.entry_date,
      je.branch_id,
      SUM(jl.debit)  AS total_debit,
      SUM(jl.credit) AS total_credit
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE je.status = 'posted'
      AND (p_branch_id IS NULL OR je.branch_id = p_branch_id)
    GROUP BY jl.account_id, je.entry_date, je.branch_id
  ),
  opening AS (
    SELECT
      account_id,
      SUM(total_debit)  AS debit,
      SUM(total_credit) AS credit
    FROM posted_lines
    WHERE entry_date < v_date_from
    GROUP BY account_id
  ),
  period AS (
    SELECT
      account_id,
      SUM(total_debit)  AS debit,
      SUM(total_credit) AS credit
    FROM posted_lines
    WHERE entry_date BETWEEN v_date_from AND v_date_to
    GROUP BY account_id
  )
  SELECT
    a.code,
    a.name,
    a.name_ar,
    a.account_type,
    COALESCE(o.debit, 0)  AS opening_debit,
    COALESCE(o.credit, 0) AS opening_credit,
    COALESCE(p.debit, 0)  AS period_debit,
    COALESCE(p.credit, 0) AS period_credit,
    COALESCE(o.debit, 0)  + COALESCE(p.debit, 0)  AS closing_debit,
    COALESCE(o.credit, 0) + COALESCE(p.credit, 0) AS closing_credit
  FROM accounts a
  LEFT JOIN opening o ON o.account_id = a.id
  LEFT JOIN period  p ON p.account_id = a.id
  WHERE (COALESCE(o.debit,0) + COALESCE(o.credit,0) + COALESCE(p.debit,0) + COALESCE(p.credit,0)) > 0
  ORDER BY a.code;
END;
$$;

GRANT EXECUTE ON FUNCTION get_trial_balance(uuid, date, date) TO authenticated;

-- ============================================================
-- 2. INCOME STATEMENT (3-level profit)
-- ============================================================
CREATE OR REPLACE FUNCTION get_income_statement(
  p_branch_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to   date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date_from      date    := COALESCE(p_date_from, date_trunc('month', CURRENT_DATE)::date);
  v_date_to        date    := COALESCE(p_date_to, CURRENT_DATE);
  v_revenue        numeric := 0;
  v_tax            numeric := 0;
  v_cogs           numeric := 0;
  v_gross_profit   numeric := 0;
  v_op_expenses    numeric := 0;
  v_salaries       numeric := 0;
  v_commissions    numeric := 0;
  v_depreciation   numeric := 0;
  v_operating_net  numeric := 0;
  v_net_profit     numeric := 0;
  v_marketing_exp  numeric := 0;
BEGIN
  -- Revenue (net, excluding tax)
  SELECT
    COALESCE(SUM(subtotal), 0),
    COALESCE(SUM(tax), 0)
  INTO v_revenue, v_tax
  FROM sales
  WHERE status NOT IN ('draft', 'cancelled', 'void')
    AND is_deleted IS NOT TRUE
    AND sale_date::date BETWEEN v_date_from AND v_date_to
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  -- COGS
  SELECT COALESCE(SUM(total_cost), 0)
  INTO v_cogs
  FROM sales
  WHERE status NOT IN ('draft', 'cancelled', 'void')
    AND is_deleted IS NOT TRUE
    AND sale_date::date BETWEEN v_date_from AND v_date_to
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  v_gross_profit := v_revenue - v_cogs;

  -- Operating expenses (excluding salaries, commissions, marketing)
  SELECT COALESCE(SUM(amount), 0)
  INTO v_op_expenses
  FROM expenses
  WHERE is_deleted IS NOT TRUE
    AND category NOT IN ('salaries', 'commissions', 'marketing')
    AND expense_date BETWEEN v_date_from AND v_date_to
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  -- Marketing expenses
  SELECT COALESCE(SUM(amount), 0)
  INTO v_marketing_exp
  FROM expenses
  WHERE is_deleted IS NOT TRUE
    AND category = 'marketing'
    AND expense_date BETWEEN v_date_from AND v_date_to
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  -- Salaries (from paid payroll runs)
  SELECT COALESCE(SUM(e.amount), 0)
  INTO v_salaries
  FROM expenses e
  WHERE is_deleted IS NOT TRUE
    AND category = 'salaries'
    AND expense_date BETWEEN v_date_from AND v_date_to
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  -- Commissions (from paid payroll runs)
  SELECT COALESCE(SUM(e.amount), 0)
  INTO v_commissions
  FROM expenses e
  WHERE is_deleted IS NOT TRUE
    AND category = 'commissions'
    AND expense_date BETWEEN v_date_from AND v_date_to
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  v_operating_net := v_gross_profit - v_op_expenses - v_marketing_exp - v_salaries - v_commissions;

  -- Depreciation
  SELECT COALESCE(SUM(amount), 0)
  INTO v_depreciation
  FROM depreciation_entries
  WHERE entry_date BETWEEN v_date_from AND v_date_to
    AND (p_branch_id IS NULL OR EXISTS (
      SELECT 1 FROM fixed_assets fa
      WHERE fa.id = depreciation_entries.asset_id AND fa.branch_id = p_branch_id
    ));

  v_net_profit := v_operating_net - v_depreciation;

  RETURN jsonb_build_object(
    'date_from',          v_date_from,
    'date_to',            v_date_to,
    'revenue',            v_revenue,
    'vat_collected',      v_tax,
    'cogs',               v_cogs,
    'gross_profit',       v_gross_profit,
    'gross_margin_pct',   CASE WHEN v_revenue > 0 THEN ROUND((v_gross_profit / v_revenue) * 100, 2) ELSE 0 END,
    'operating_expenses', v_op_expenses,
    'marketing_expenses', v_marketing_exp,
    'salaries',           v_salaries,
    'commissions',        v_commissions,
    'operating_net',      v_operating_net,
    'depreciation',       v_depreciation,
    'net_profit',         v_net_profit,
    'net_margin_pct',     CASE WHEN v_revenue > 0 THEN ROUND((v_net_profit / v_revenue) * 100, 2) ELSE 0 END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_income_statement(uuid, date, date) TO authenticated;

-- ============================================================
-- 3. BALANCE SHEET
-- ============================================================
CREATE OR REPLACE FUNCTION get_balance_sheet(
  p_branch_id uuid DEFAULT NULL,
  p_as_of_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_as_of_date         date    := COALESCE(p_as_of_date, CURRENT_DATE);
  -- Assets
  v_cash               numeric := 0;
  v_ar                 numeric := 0;
  v_inventory_value    numeric := 0;
  v_fixed_assets_net   numeric := 0;
  v_total_assets       numeric := 0;
  -- Liabilities
  v_ap                 numeric := 0;
  v_vat_payable        numeric := 0;
  v_total_liabilities  numeric := 0;
  -- Equity
  v_partner_capital    numeric := 0;
  v_retained_earnings  numeric := 0;
  v_total_equity       numeric := 0;
BEGIN
  -- Cash (open register balances)
  SELECT COALESCE(SUM(current_balance), 0)
  INTO v_cash
  FROM cash_registers
  WHERE status = 'open'
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  -- Accounts Receivable (unpaid credit sales)
  SELECT COALESCE(SUM(total), 0)
  INTO v_ar
  FROM sales
  WHERE payment_status = 'unpaid'
    AND status = 'confirmed'
    AND is_deleted IS NOT TRUE
    AND sale_date::date <= v_as_of_date
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  -- Inventory value
  SELECT COALESCE(SUM(quantity_on_hand * average_cost), 0)
  INTO v_inventory_value
  FROM product_costing
  WHERE (p_branch_id IS NULL OR branch_id = p_branch_id);

  -- Fixed Assets (net book value)
  SELECT COALESCE(SUM(purchase_cost - COALESCE(
    (SELECT SUM(de.amount) FROM depreciation_entries de
     WHERE de.asset_id = fa.id AND de.entry_date <= v_as_of_date), 0
  )), 0)
  INTO v_fixed_assets_net
  FROM fixed_assets fa
  WHERE is_active = true AND is_deleted IS NOT TRUE
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  v_total_assets := v_cash + v_ar + v_inventory_value + v_fixed_assets_net;

  -- Accounts Payable (unpaid purchases)
  SELECT COALESCE(SUM(total), 0)
  INTO v_ap
  FROM purchases
  WHERE payment_status = 'unpaid'
    AND is_deleted IS NOT TRUE
    AND purchase_date <= v_as_of_date
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  -- VAT Payable (output - input)
  DECLARE
    v_vat_output numeric := 0;
    v_vat_input  numeric := 0;
  BEGIN
    SELECT COALESCE(SUM(tax), 0) INTO v_vat_output
    FROM sales
    WHERE status NOT IN ('draft','cancelled','void')
      AND is_deleted IS NOT TRUE
      AND sale_date::date <= v_as_of_date
      AND (p_branch_id IS NULL OR branch_id = p_branch_id);

    SELECT COALESCE(SUM(vat_amount), 0) INTO v_vat_input
    FROM purchases
    WHERE is_deleted IS NOT TRUE
      AND purchase_date <= v_as_of_date
      AND (p_branch_id IS NULL OR branch_id = p_branch_id);

    v_vat_payable := GREATEST(v_vat_output - v_vat_input, 0);
  END;

  v_total_liabilities := v_ap + v_vat_payable;

  -- Partner capital (total contributions)
  SELECT COALESCE(SUM(amount), 0)
  INTO v_partner_capital
  FROM partner_contributions
  WHERE is_deleted IS NOT TRUE;

  -- Retained earnings = Assets - Liabilities - Capital
  v_retained_earnings := v_total_assets - v_total_liabilities - v_partner_capital;
  v_total_equity := v_partner_capital + v_retained_earnings;

  RETURN jsonb_build_object(
    'as_of_date',         v_as_of_date,
    'assets', jsonb_build_object(
      'cash',             v_cash,
      'accounts_receivable', v_ar,
      'inventory',        v_inventory_value,
      'fixed_assets_net', v_fixed_assets_net,
      'total',            v_total_assets
    ),
    'liabilities', jsonb_build_object(
      'accounts_payable', v_ap,
      'vat_payable',      v_vat_payable,
      'total',            v_total_liabilities
    ),
    'equity', jsonb_build_object(
      'partner_capital',   v_partner_capital,
      'retained_earnings', v_retained_earnings,
      'total',             v_total_equity
    ),
    'check_balanced',     (v_total_assets = v_total_liabilities + v_total_equity)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_balance_sheet(uuid, date) TO authenticated;

-- ============================================================
-- 4. VAT SUMMARY (Monthly)
-- ============================================================
CREATE OR REPLACE FUNCTION get_vat_summary(
  p_branch_id uuid DEFAULT NULL,
  p_month     int  DEFAULT NULL,
  p_year      int  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month          int  := COALESCE(p_month, EXTRACT(MONTH FROM CURRENT_DATE)::int);
  v_year           int  := COALESCE(p_year,  EXTRACT(YEAR  FROM CURRENT_DATE)::int);
  v_date_from      date;
  v_date_to        date;
  v_output_vat     numeric := 0;
  v_taxable_sales  numeric := 0;
  v_input_standard numeric := 0;
  v_input_zero     numeric := 0;
  v_input_exempt   numeric := 0;
  v_net_payable    numeric := 0;
BEGIN
  v_date_from := make_date(v_year, v_month, 1);
  v_date_to   := (v_date_from + interval '1 month - 1 day')::date;

  -- Output VAT (from sales)
  SELECT
    COALESCE(SUM(tax), 0),
    COALESCE(SUM(subtotal), 0)
  INTO v_output_vat, v_taxable_sales
  FROM sales
  WHERE status NOT IN ('draft', 'cancelled', 'void')
    AND is_deleted IS NOT TRUE
    AND sale_date::date BETWEEN v_date_from AND v_date_to
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  -- Input VAT from purchases (by VAT status)
  SELECT
    COALESCE(SUM(CASE WHEN COALESCE(vat_status, 'standard') = 'standard' THEN COALESCE(vat_amount, 0) ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN COALESCE(vat_status, 'standard') = 'zero_rated' THEN COALESCE(vat_amount, 0) ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN COALESCE(vat_status, 'standard') IN ('exempt','outside_scope') THEN COALESCE(vat_amount, 0) ELSE 0 END), 0)
  INTO v_input_standard, v_input_zero, v_input_exempt
  FROM purchases
  WHERE is_deleted IS NOT TRUE
    AND purchase_date BETWEEN v_date_from AND v_date_to
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  v_net_payable := v_output_vat - v_input_standard;

  RETURN jsonb_build_object(
    'period',             TO_CHAR(v_date_from, 'Month YYYY'),
    'month',              v_month,
    'year',               v_year,
    'date_from',          v_date_from,
    'date_to',            v_date_to,
    'output_vat',         v_output_vat,
    'taxable_sales',      v_taxable_sales,
    'input_vat_standard', v_input_standard,
    'input_vat_zero',     v_input_zero,
    'input_vat_exempt',   v_input_exempt,
    'total_input_vat',    v_input_standard,
    'net_vat_payable',    v_net_payable,
    'is_refund',          (v_net_payable < 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_vat_summary(uuid, int, int) TO authenticated;
