
/*
  # VAT Engine — Migration 5: Fix get_vat_summary() + Account Tree

  ## Summary
  1. Fixes account 2140 (VAT Recoverable) parent_id → 1100 (Current Assets).
  2. Rewrites get_vat_summary() to:
     - Source all data from vat_transactions ledger (single source of truth).
     - Correctly calculate total_input_vat = input_standard + input_zero_rated.
     - Include all source types: purchases, operating_expenses, setup_expenses,
       partner reimbursements (via vat_transactions).
     - Return breakdown per source_type for transparency.
     - Align column names with vat_returns for direct comparison.

  ## Changes to `accounts`
  - UPDATE accounts SET parent_id = '1100 uuid' WHERE code = '2140'

  ## Changes to `get_vat_summary()`
  - Now reads from vat_transactions (ledger) not source tables directly.
  - total_input_vat = SUM of standard + zero_rated input transactions.
  - Adds: input_breakdown by source_type.
  - Adds: open_transactions_count.
  - Fixes: net_vat_payable = output_vat - total_input_vat (was: - input_standard only).
*/

-- ── 1. Fix account 2140 parent_id ────────────────────────────────────────────
UPDATE accounts
SET parent_id = (SELECT id FROM accounts WHERE code = '1100')
WHERE code = '2140'
  AND parent_id IS NULL;

-- ── 2. Rewrite get_vat_summary() ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_vat_summary(
  p_branch_id uuid    DEFAULT NULL,
  p_month     integer DEFAULT NULL,
  p_year      integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month          integer := COALESCE(p_month, EXTRACT(MONTH FROM CURRENT_DATE)::integer);
  v_year           integer := COALESCE(p_year,  EXTRACT(YEAR  FROM CURRENT_DATE)::integer);
  v_date_from      date;
  v_date_to        date;

  -- Output VAT (from sales)
  v_output_vat     numeric := 0;
  v_taxable_sales  numeric := 0;

  -- Input VAT (from all sources in vat_transactions)
  v_input_standard numeric := 0;
  v_input_zero     numeric := 0;
  v_input_exempt   numeric := 0;
  v_total_input    numeric := 0;
  v_net_payable    numeric := 0;

  -- Breakdown by source
  v_input_purchases       numeric := 0;
  v_input_opex            numeric := 0;
  v_input_setup           numeric := 0;
  v_input_partner         numeric := 0;

  -- Open count
  v_open_count     integer := 0;

  -- Existing vat_return for this period
  v_return_status  text    := NULL;
  v_return_id      uuid    := NULL;
BEGIN
  v_date_from := make_date(v_year, v_month, 1);
  v_date_to   := (v_date_from + interval '1 month - 1 day')::date;

  -- ── Output VAT from vat_transactions (direction='output') ─────────────────
  SELECT
    COALESCE(SUM(vat_amount), 0),
    COALESCE(SUM(taxable_amount), 0)
  INTO v_output_vat, v_taxable_sales
  FROM vat_transactions
  WHERE direction    = 'output'
    AND period_year  = v_year
    AND period_month = v_month
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  -- ── Input VAT: breakdown by vat_category ──────────────────────────────────
  SELECT
    COALESCE(SUM(CASE WHEN vat_category = 'standard'      THEN vat_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN vat_category = 'zero_rated'    THEN vat_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN vat_category IN ('exempt','outside_scope') THEN vat_amount ELSE 0 END), 0)
  INTO v_input_standard, v_input_zero, v_input_exempt
  FROM vat_transactions
  WHERE direction    = 'input'
    AND period_year  = v_year
    AND period_month = v_month
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  -- ── Input VAT: breakdown by source_type ───────────────────────────────────
  SELECT
    COALESCE(SUM(CASE WHEN source_type = 'purchase'             THEN vat_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN source_type = 'operating_expense'    THEN vat_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN source_type = 'setup_expense'        THEN vat_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN source_type = 'partner_contribution' THEN vat_amount ELSE 0 END), 0)
  INTO v_input_purchases, v_input_opex, v_input_setup, v_input_partner
  FROM vat_transactions
  WHERE direction    = 'input'
    AND period_year  = v_year
    AND period_month = v_month
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  -- ── Open transaction count ─────────────────────────────────────────────────
  SELECT COUNT(*) INTO v_open_count
  FROM vat_transactions
  WHERE period_year  = v_year
    AND period_month = v_month
    AND status       = 'open'
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  -- ── total_input_vat per ZATCA: standard + zero_rated are both recoverable ──
  v_total_input := v_input_standard + v_input_zero;

  -- ── Net VAT ───────────────────────────────────────────────────────────────
  v_net_payable := ROUND(v_output_vat - v_total_input, 2);

  -- ── Check if already settled ──────────────────────────────────────────────
  SELECT id, status INTO v_return_id, v_return_status
  FROM vat_returns
  WHERE period_year  = v_year
    AND period_month = v_month
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
  ORDER BY created_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    -- Period
    'period',              TO_CHAR(v_date_from, 'Month YYYY'),
    'month',               v_month,
    'year',                v_year,
    'date_from',           v_date_from,
    'date_to',             v_date_to,

    -- Output
    'output_vat',          v_output_vat,
    'taxable_sales',       v_taxable_sales,

    -- Input (by category)
    'input_vat_standard',  v_input_standard,
    'input_vat_zero',      v_input_zero,
    'input_vat_exempt',    v_input_exempt,
    'total_input_vat',     v_total_input,

    -- Input (by source — for audit transparency)
    'input_breakdown', jsonb_build_object(
      'purchases',            v_input_purchases,
      'operating_expenses',   v_input_opex,
      'setup_expenses',       v_input_setup,
      'partner_contributions',v_input_partner
    ),

    -- Net
    'net_vat_payable',     v_net_payable,
    'is_refund',           (v_net_payable < 0),

    -- Settlement status
    'open_transactions',   v_open_count,
    'return_id',           v_return_id,
    'return_status',       v_return_status
  );
END;
$$;
