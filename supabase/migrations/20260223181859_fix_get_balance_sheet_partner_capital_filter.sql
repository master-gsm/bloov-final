/*
  # Fix get_balance_sheet — remove wrong contribution_type filter

  Partner capital must include ALL contribution types (cash, operational, asset, etc.).
  The previous version filtered to contribution_type = 'cash' only, which returned 0
  when contributions are typed differently (e.g. 'operational').

  This patch removes the type filter so all non-deleted contributions count toward capital.
*/

CREATE OR REPLACE FUNCTION public.get_balance_sheet(
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
  v_cash               numeric := 0;
  v_ar                 numeric := 0;
  v_inventory_value    numeric := 0;
  v_fixed_assets_net   numeric := 0;
  v_total_assets       numeric := 0;
  v_ap                 numeric := 0;
  v_vat_output         numeric := 0;
  v_vat_input          numeric := 0;
  v_vat_payable        numeric := 0;
  v_total_liabilities  numeric := 0;
  v_partner_capital    numeric := 0;
  v_revenue            numeric := 0;
  v_cogs               numeric := 0;
  v_opex               numeric := 0;
  v_net_income         numeric := 0;
  v_retained_earnings  numeric := 0;
  v_total_equity       numeric := 0;
BEGIN
  -- =========================================================================
  -- ASSETS
  -- =========================================================================

  SELECT COALESCE(SUM(expected_balance), 0)
  INTO v_cash
  FROM cash_registers
  WHERE status = 'open'
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  SELECT COALESCE(SUM(total), 0)
  INTO v_ar
  FROM sales
  WHERE payment_status = 'unpaid'
    AND status = 'confirmed'
    AND is_deleted IS NOT TRUE
    AND sale_date::date <= v_as_of_date
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  SELECT COALESCE(SUM(quantity_on_hand * average_cost), 0)
  INTO v_inventory_value
  FROM product_costing
  WHERE (p_branch_id IS NULL OR branch_id = p_branch_id);

  SELECT COALESCE(SUM(
    fa.purchase_cost - COALESCE((
      SELECT SUM(de.amount)
      FROM depreciation_entries de
      WHERE de.asset_id = fa.id
        AND de.entry_date <= v_as_of_date
    ), 0)
  ), 0)
  INTO v_fixed_assets_net
  FROM fixed_assets fa
  WHERE fa.is_active = true
    AND fa.is_deleted IS NOT TRUE
    AND (p_branch_id IS NULL OR fa.branch_id = p_branch_id);

  v_total_assets := v_cash + v_ar + v_inventory_value + v_fixed_assets_net;

  -- =========================================================================
  -- LIABILITIES
  -- =========================================================================

  SELECT COALESCE(SUM(total), 0)
  INTO v_ap
  FROM purchases
  WHERE payment_status = 'unpaid'
    AND is_deleted IS NOT TRUE
    AND purchase_date::date <= v_as_of_date
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  SELECT COALESCE(SUM(tax), 0)
  INTO v_vat_output
  FROM sales
  WHERE status NOT IN ('draft', 'cancelled', 'void')
    AND is_deleted IS NOT TRUE
    AND sale_date::date <= v_as_of_date
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  SELECT COALESCE(SUM(vat_amount), 0)
  INTO v_vat_input
  FROM purchases
  WHERE is_deleted IS NOT TRUE
    AND purchase_date::date <= v_as_of_date
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  v_vat_payable       := GREATEST(v_vat_output - v_vat_input, 0);
  v_total_liabilities := v_ap + v_vat_payable;

  -- =========================================================================
  -- EQUITY
  -- =========================================================================

  -- Partner capital = ALL non-deleted contributions regardless of type
  SELECT COALESCE(SUM(amount), 0)
  INTO v_partner_capital
  FROM partner_contributions
  WHERE is_deleted IS NOT TRUE;

  -- Revenue net of VAT/tax
  SELECT COALESCE(SUM(total - COALESCE(tax, 0)), 0)
  INTO v_revenue
  FROM sales
  WHERE status NOT IN ('draft', 'cancelled', 'void')
    AND is_deleted IS NOT TRUE
    AND sale_date::date <= v_as_of_date
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  -- COGS via sale_items.purchase_price (moving-avg cost at time of sale)
  SELECT COALESCE(SUM(si.quantity * COALESCE(si.purchase_price, 0)), 0)
  INTO v_cogs
  FROM sale_items si
  JOIN sales s ON s.id = si.sale_id
  WHERE s.status NOT IN ('draft', 'cancelled', 'void')
    AND s.is_deleted IS NOT TRUE
    AND si.is_deleted IS NOT TRUE
    AND s.sale_date::date <= v_as_of_date
    AND (p_branch_id IS NULL OR s.branch_id = p_branch_id);

  -- Operating expenses
  SELECT COALESCE(SUM(amount), 0)
  INTO v_opex
  FROM operating_expenses
  WHERE is_deleted IS NOT TRUE
    AND voided_at IS NULL
    AND expense_date <= v_as_of_date
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  v_net_income        := v_revenue - v_cogs - v_opex;
  v_retained_earnings := v_net_income;
  v_total_equity      := v_partner_capital + v_retained_earnings;

  RETURN jsonb_build_object(
    'as_of_date',  v_as_of_date,
    'assets', jsonb_build_object(
      'cash',                v_cash,
      'accounts_receivable', v_ar,
      'inventory',           v_inventory_value,
      'fixed_assets_net',    v_fixed_assets_net,
      'total',               v_total_assets
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
    'check_balanced', (ABS(v_total_assets - (v_total_liabilities + v_total_equity)) < 0.01)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_balance_sheet(uuid, date) TO authenticated;
