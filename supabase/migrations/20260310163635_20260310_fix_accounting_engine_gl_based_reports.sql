/*
  # Fix Accounting Engine - GL-Based Financial Reports
  
  ## Summary
  This migration fixes the accounting engine to read all financial reports 
  from the General Ledger (journal_entries + journal_lines) only, instead of 
  mixing data from multiple source tables.
  
  ## Problems Fixed
  1. Trial Balance was showing debit/credit separately instead of net balance
  2. Balance Sheet was reading from multiple tables instead of GL
  3. Income Statement was not GL-based
  4. Reports were inconsistent with each other
  
  ## Changes
  1. New `get_trial_balance_v2` - Returns proper net balances by account type
  2. New `get_balance_sheet_v2` - Reads 100% from GL accounts
  3. New `get_income_statement_v2` - Reads 100% from GL accounts
  4. All reports now use consistent GL data source
  
  ## Accounting Principles Applied
  - Assets: Debit increases, Credit decreases → Net = Debit - Credit
  - Liabilities: Credit increases, Debit decreases → Net = Credit - Debit
  - Equity: Credit increases, Debit decreases → Net = Credit - Debit
  - Revenue: Credit increases → Net = Credit - Debit
  - Expenses: Debit increases → Net = Debit - Credit
*/

-- ============================================
-- 1. HELPER: Get account balance based on type
-- ============================================

CREATE OR REPLACE FUNCTION public.calculate_account_balance(
  p_account_type text,
  p_total_debit numeric,
  p_total_credit numeric
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Assets and Expenses have normal debit balances
  IF p_account_type IN ('asset', 'expense') THEN
    RETURN COALESCE(p_total_debit, 0) - COALESCE(p_total_credit, 0);
  -- Liabilities, Equity, and Revenue have normal credit balances
  ELSIF p_account_type IN ('liability', 'equity', 'revenue') THEN
    RETURN COALESCE(p_total_credit, 0) - COALESCE(p_total_debit, 0);
  ELSE
    -- Default: treat as debit-normal
    RETURN COALESCE(p_total_debit, 0) - COALESCE(p_total_credit, 0);
  END IF;
END;
$$;

-- ============================================
-- 2. NEW: Trial Balance V2 (Correct Formula)
-- ============================================

CREATE OR REPLACE FUNCTION public.get_trial_balance_v2(
  p_branch_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS TABLE(
  account_code text,
  account_name text,
  account_name_ar text,
  account_type text,
  opening_balance numeric,
  period_debit numeric,
  period_credit numeric,
  closing_balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date_from date := COALESCE(p_date_from, '2020-01-01');
  v_date_to date := COALESCE(p_date_to, CURRENT_DATE);
BEGIN
  IF v_date_from > v_date_to THEN
    v_date_from := COALESCE(p_date_to, CURRENT_DATE);
    v_date_to := COALESCE(p_date_from, CURRENT_DATE);
  END IF;

  RETURN QUERY
  WITH all_posted_lines AS (
    SELECT
      jl.account_id,
      je.date AS entry_date,
      jl.debit,
      jl.credit,
      a.type AS acct_type
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.journal_entry_id
    JOIN accounts a ON a.id = jl.account_id
    WHERE je.status = 'Posted'
      AND (p_branch_id IS NULL OR je.branch_id = p_branch_id)
  ),
  opening_totals AS (
    SELECT
      account_id,
      acct_type,
      SUM(debit) AS total_debit,
      SUM(credit) AS total_credit
    FROM all_posted_lines
    WHERE entry_date < v_date_from
    GROUP BY account_id, acct_type
  ),
  period_totals AS (
    SELECT
      account_id,
      SUM(debit) AS total_debit,
      SUM(credit) AS total_credit
    FROM all_posted_lines
    WHERE entry_date BETWEEN v_date_from AND v_date_to
    GROUP BY account_id
  ),
  account_balances AS (
    SELECT
      a.id AS account_id,
      a.code,
      a.name,
      a.name_ar,
      a.type,
      calculate_account_balance(a.type, ot.total_debit, ot.total_credit) AS opening_bal,
      COALESCE(pt.total_debit, 0) AS period_dr,
      COALESCE(pt.total_credit, 0) AS period_cr
    FROM accounts a
    LEFT JOIN opening_totals ot ON ot.account_id = a.id
    LEFT JOIN period_totals pt ON pt.account_id = a.id
    WHERE a.is_active = true
  )
  SELECT
    ab.code::text,
    ab.name::text,
    ab.name_ar::text,
    ab.type::text,
    COALESCE(ab.opening_bal, 0) AS opening_balance,
    ab.period_dr AS period_debit,
    ab.period_cr AS period_credit,
    COALESCE(ab.opening_bal, 0) + calculate_account_balance(ab.type, ab.period_dr, ab.period_cr) AS closing_balance
  FROM account_balances ab
  WHERE COALESCE(ab.opening_bal, 0) != 0 
     OR ab.period_dr > 0 
     OR ab.period_cr > 0
  ORDER BY ab.code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_trial_balance_v2(uuid, date, date) TO authenticated;

-- ============================================
-- 3. NEW: Balance Sheet V2 (100% GL-Based)
-- ============================================

CREATE OR REPLACE FUNCTION public.get_balance_sheet_v2(
  p_branch_id uuid DEFAULT NULL,
  p_as_of_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_as_of_date date := COALESCE(p_as_of_date, CURRENT_DATE);
  
  -- Assets (account codes starting with 1)
  v_cash numeric := 0;               -- 1100 Cash
  v_accounts_receivable numeric := 0; -- 1200 AR
  v_inventory numeric := 0;           -- 1300 Inventory
  v_fixed_assets numeric := 0;        -- 1500 Fixed Assets
  v_accumulated_depreciation numeric := 0; -- 1600 Accumulated Depreciation
  v_other_assets numeric := 0;        -- Other 1xxx
  v_total_assets numeric := 0;
  
  -- Liabilities (account codes starting with 2)
  v_accounts_payable numeric := 0;    -- 2100 AP
  v_vat_payable numeric := 0;         -- 2130 VAT
  v_accrued_expenses numeric := 0;    -- 2200 Accrued
  v_other_liabilities numeric := 0;   -- Other 2xxx
  v_total_liabilities numeric := 0;
  
  -- Equity (account codes starting with 3)
  v_capital numeric := 0;             -- 3100 Capital
  v_retained_earnings numeric := 0;   -- 3200 Retained Earnings
  v_current_year_earnings numeric := 0;
  v_total_equity numeric := 0;
  
  -- For calculating current year earnings
  v_revenue numeric := 0;
  v_expenses numeric := 0;
BEGIN
  -- =========================================================================
  -- Calculate balances from GL for each account category
  -- =========================================================================
  
  WITH posted_balances AS (
    SELECT
      a.code,
      a.type,
      SUM(jl.debit) AS total_debit,
      SUM(jl.credit) AS total_credit
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.journal_entry_id
    JOIN accounts a ON a.id = jl.account_id
    WHERE je.status = 'Posted'
      AND je.date <= v_as_of_date
      AND (p_branch_id IS NULL OR je.branch_id = p_branch_id)
    GROUP BY a.code, a.type
  )
  SELECT
    -- Assets (Debit normal: Debit - Credit)
    COALESCE(SUM(CASE WHEN code LIKE '1100%' OR code LIKE '1110%' 
      THEN total_debit - total_credit ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN code LIKE '1200%' OR code LIKE '1210%' 
      THEN total_debit - total_credit ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN code LIKE '1300%' OR code LIKE '1310%' 
      THEN total_debit - total_credit ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN code LIKE '1500%' OR code LIKE '1510%' 
      THEN total_debit - total_credit ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN code LIKE '1600%' OR code LIKE '1610%' 
      THEN total_credit - total_debit ELSE 0 END), 0), -- Contra asset
    COALESCE(SUM(CASE WHEN code LIKE '1%' 
      AND code NOT LIKE '1100%' AND code NOT LIKE '1110%'
      AND code NOT LIKE '1200%' AND code NOT LIKE '1210%'
      AND code NOT LIKE '1300%' AND code NOT LIKE '1310%'
      AND code NOT LIKE '1500%' AND code NOT LIKE '1510%'
      AND code NOT LIKE '1600%' AND code NOT LIKE '1610%'
      THEN total_debit - total_credit ELSE 0 END), 0),
    
    -- Liabilities (Credit normal: Credit - Debit)
    COALESCE(SUM(CASE WHEN code LIKE '2100%' OR code LIKE '2110%' 
      THEN total_credit - total_debit ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN code LIKE '2130%' 
      THEN total_credit - total_debit ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN code LIKE '2200%' 
      THEN total_credit - total_debit ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN code LIKE '2%' 
      AND code NOT LIKE '2100%' AND code NOT LIKE '2110%'
      AND code NOT LIKE '2130%' AND code NOT LIKE '2200%'
      THEN total_credit - total_debit ELSE 0 END), 0),
    
    -- Equity (Credit normal: Credit - Debit)
    COALESCE(SUM(CASE WHEN code LIKE '3100%' OR code LIKE '3110%' 
      THEN total_credit - total_debit ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN code LIKE '3200%' 
      THEN total_credit - total_debit ELSE 0 END), 0),
    
    -- Revenue (Credit normal: Credit - Debit)
    COALESCE(SUM(CASE WHEN code LIKE '4%' 
      THEN total_credit - total_debit ELSE 0 END), 0),
    
    -- Expenses (Debit normal: Debit - Credit)
    COALESCE(SUM(CASE WHEN code LIKE '5%' OR code LIKE '6%' OR code LIKE '7%'
      THEN total_debit - total_credit ELSE 0 END), 0)
      
  INTO 
    v_cash, v_accounts_receivable, v_inventory, v_fixed_assets, 
    v_accumulated_depreciation, v_other_assets,
    v_accounts_payable, v_vat_payable, v_accrued_expenses, v_other_liabilities,
    v_capital, v_retained_earnings, v_revenue, v_expenses
  FROM posted_balances;
  
  -- Calculate totals
  v_total_assets := v_cash + v_accounts_receivable + v_inventory 
                  + v_fixed_assets - v_accumulated_depreciation + v_other_assets;
  
  v_total_liabilities := v_accounts_payable + v_vat_payable 
                       + v_accrued_expenses + v_other_liabilities;
  
  -- Current year earnings = Revenue - Expenses
  v_current_year_earnings := v_revenue - v_expenses;
  
  v_total_equity := v_capital + v_retained_earnings + v_current_year_earnings;
  
  RETURN jsonb_build_object(
    'as_of_date', v_as_of_date,
    'source', 'general_ledger',
    'assets', jsonb_build_object(
      'cash', v_cash,
      'accounts_receivable', v_accounts_receivable,
      'inventory', v_inventory,
      'fixed_assets_gross', v_fixed_assets,
      'accumulated_depreciation', v_accumulated_depreciation,
      'fixed_assets_net', v_fixed_assets - v_accumulated_depreciation,
      'other_assets', v_other_assets,
      'total', v_total_assets
    ),
    'liabilities', jsonb_build_object(
      'accounts_payable', v_accounts_payable,
      'vat_payable', v_vat_payable,
      'accrued_expenses', v_accrued_expenses,
      'other_liabilities', v_other_liabilities,
      'total', v_total_liabilities
    ),
    'equity', jsonb_build_object(
      'capital', v_capital,
      'retained_earnings', v_retained_earnings,
      'current_year_earnings', v_current_year_earnings,
      'total', v_total_equity
    ),
    'check_balanced', (ABS(v_total_assets - (v_total_liabilities + v_total_equity)) < 0.01),
    'balance_difference', v_total_assets - (v_total_liabilities + v_total_equity)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_balance_sheet_v2(uuid, date) TO authenticated;

-- ============================================
-- 4. NEW: Income Statement V2 (100% GL-Based)
-- ============================================

CREATE OR REPLACE FUNCTION public.get_income_statement_v2(
  p_branch_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date_from date := COALESCE(p_date_from, date_trunc('year', CURRENT_DATE)::date);
  v_date_to date := COALESCE(p_date_to, CURRENT_DATE);
  
  -- Revenue (4xxx accounts)
  v_sales_revenue numeric := 0;       -- 4100 Sales
  v_other_revenue numeric := 0;       -- 4200+ Other revenue
  v_total_revenue numeric := 0;
  
  -- Cost of Goods Sold (5xxx accounts)
  v_cogs numeric := 0;                -- 5100 COGS
  v_gross_profit numeric := 0;
  
  -- Operating Expenses (6xxx accounts)
  v_salaries_expense numeric := 0;    -- 6100 Salaries
  v_rent_expense numeric := 0;        -- 6200 Rent
  v_utilities_expense numeric := 0;   -- 6300 Utilities
  v_marketing_expense numeric := 0;   -- 6400 Marketing
  v_depreciation_expense numeric := 0; -- 6500 Depreciation
  v_other_operating_expense numeric := 0;
  v_total_operating_expenses numeric := 0;
  v_operating_income numeric := 0;
  
  -- Other Income/Expenses (7xxx accounts)
  v_interest_expense numeric := 0;    -- 7100 Interest
  v_other_expense numeric := 0;       -- 7xxx Other
  v_total_other_expenses numeric := 0;
  
  v_net_income numeric := 0;
BEGIN
  WITH posted_period AS (
    SELECT
      a.code,
      SUM(jl.debit) AS total_debit,
      SUM(jl.credit) AS total_credit
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.journal_entry_id
    JOIN accounts a ON a.id = jl.account_id
    WHERE je.status = 'Posted'
      AND je.date BETWEEN v_date_from AND v_date_to
      AND (p_branch_id IS NULL OR je.branch_id = p_branch_id)
    GROUP BY a.code
  )
  SELECT
    -- Revenue (Credit normal)
    COALESCE(SUM(CASE WHEN code LIKE '4100%' 
      THEN total_credit - total_debit ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN code LIKE '4%' AND code NOT LIKE '4100%'
      THEN total_credit - total_debit ELSE 0 END), 0),
    
    -- COGS (Debit normal)
    COALESCE(SUM(CASE WHEN code LIKE '5%' 
      THEN total_debit - total_credit ELSE 0 END), 0),
    
    -- Operating Expenses (Debit normal)
    COALESCE(SUM(CASE WHEN code LIKE '6100%' 
      THEN total_debit - total_credit ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN code LIKE '6200%' 
      THEN total_debit - total_credit ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN code LIKE '6300%' 
      THEN total_debit - total_credit ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN code LIKE '6400%' 
      THEN total_debit - total_credit ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN code LIKE '6500%' 
      THEN total_debit - total_credit ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN code LIKE '6%' 
      AND code NOT LIKE '6100%' AND code NOT LIKE '6200%'
      AND code NOT LIKE '6300%' AND code NOT LIKE '6400%'
      AND code NOT LIKE '6500%'
      THEN total_debit - total_credit ELSE 0 END), 0),
    
    -- Other Expenses (Debit normal)
    COALESCE(SUM(CASE WHEN code LIKE '7100%' 
      THEN total_debit - total_credit ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN code LIKE '7%' AND code NOT LIKE '7100%'
      THEN total_debit - total_credit ELSE 0 END), 0)
      
  INTO 
    v_sales_revenue, v_other_revenue,
    v_cogs,
    v_salaries_expense, v_rent_expense, v_utilities_expense,
    v_marketing_expense, v_depreciation_expense, v_other_operating_expense,
    v_interest_expense, v_other_expense
  FROM posted_period;
  
  -- Calculate totals
  v_total_revenue := v_sales_revenue + v_other_revenue;
  v_gross_profit := v_total_revenue - v_cogs;
  
  v_total_operating_expenses := v_salaries_expense + v_rent_expense 
                              + v_utilities_expense + v_marketing_expense 
                              + v_depreciation_expense + v_other_operating_expense;
  
  v_operating_income := v_gross_profit - v_total_operating_expenses;
  
  v_total_other_expenses := v_interest_expense + v_other_expense;
  
  v_net_income := v_operating_income - v_total_other_expenses;
  
  RETURN jsonb_build_object(
    'period', jsonb_build_object(
      'from', v_date_from,
      'to', v_date_to
    ),
    'source', 'general_ledger',
    'revenue', jsonb_build_object(
      'sales', v_sales_revenue,
      'other', v_other_revenue,
      'total', v_total_revenue
    ),
    'cost_of_goods_sold', v_cogs,
    'gross_profit', v_gross_profit,
    'gross_profit_margin', CASE WHEN v_total_revenue > 0 
      THEN ROUND((v_gross_profit / v_total_revenue) * 100, 2) ELSE 0 END,
    'operating_expenses', jsonb_build_object(
      'salaries', v_salaries_expense,
      'rent', v_rent_expense,
      'utilities', v_utilities_expense,
      'marketing', v_marketing_expense,
      'depreciation', v_depreciation_expense,
      'other', v_other_operating_expense,
      'total', v_total_operating_expenses
    ),
    'operating_income', v_operating_income,
    'other_expenses', jsonb_build_object(
      'interest', v_interest_expense,
      'other', v_other_expense,
      'total', v_total_other_expenses
    ),
    'net_income', v_net_income,
    'net_profit_margin', CASE WHEN v_total_revenue > 0 
      THEN ROUND((v_net_income / v_total_revenue) * 100, 2) ELSE 0 END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_income_statement_v2(uuid, date, date) TO authenticated;

-- ============================================
-- 5. Verify GL Balance (Debug Helper)
-- ============================================

CREATE OR REPLACE FUNCTION public.verify_gl_balance(
  p_branch_id uuid DEFAULT NULL,
  p_as_of_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_as_of_date date := COALESCE(p_as_of_date, CURRENT_DATE);
  v_total_debits numeric;
  v_total_credits numeric;
  v_entry_count bigint;
BEGIN
  SELECT 
    COALESCE(SUM(jl.debit), 0),
    COALESCE(SUM(jl.credit), 0),
    COUNT(DISTINCT je.id)
  INTO v_total_debits, v_total_credits, v_entry_count
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.journal_entry_id
  WHERE je.status = 'Posted'
    AND je.date <= v_as_of_date
    AND (p_branch_id IS NULL OR je.branch_id = p_branch_id);
    
  RETURN jsonb_build_object(
    'as_of_date', v_as_of_date,
    'total_debits', v_total_debits,
    'total_credits', v_total_credits,
    'difference', v_total_debits - v_total_credits,
    'is_balanced', ABS(v_total_debits - v_total_credits) < 0.01,
    'posted_entries_count', v_entry_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_gl_balance(uuid, date) TO authenticated;
