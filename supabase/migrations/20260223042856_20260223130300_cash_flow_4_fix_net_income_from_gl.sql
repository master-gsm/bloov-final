
/*
  # Cash Flow Statement Engine — Migration 4: Net Income from GL

  ## Summary
  The existing `get_income_statement()` reads from the `sales` and `expenses`
  application tables, which are correct for a P&L report but introduce a
  mismatch when used inside the Cash Flow Statement (Indirect Method).

  The Indirect Method **must** start from the same net income figure that is
  already encoded in the GL (journal_lines), otherwise the equation:

      opening_cash + operating + investing + financing = closing_cash

  can never balance — any sale recorded only in `sales` (without a matching
  Posted journal entry) would create a phantom difference.

  ## Fix
  `get_cash_flow_statement()` now computes net income directly from
  journal_lines using account types:
    Revenue credit > debit → income
    COGS + Expense debit > credit → expense

  This is 100% consistent with the GL trial balance and the bank reconciliation
  engine that also reads only from journal_lines.

  ## Also Fixes
  - sign_convention consolidated to +1 for ALL activity types.
    Formula: cash_impact = -(net_debit_minus_credit) * sign_convention
    With sign_convention = +1:
      Asset ↑ (DR>CR, net>0) → -net = negative = cash used ✓
      Asset ↓ (CR>DR, net<0) → -net = positive = cash freed ✓
      Liability ↑ (CR>DR, net<0) → -net = positive = cash source ✓
      Liability ↓ (DR>CR, net>0) → -net = negative = cash paid ✓
      Equity ↑ (CR>DR, net<0) → -net = positive = financing inflow ✓
    sign_convention = -1 was only needed if we wanted to INVERT the above,
    which no account in our chart requires.

  ## No table changes. Function recreated only.
*/

-- Ensure all mapping rows have sign_convention = 1
UPDATE cash_flow_mapping SET sign_convention = 1;

-- Recreate the function with GL-based net income
CREATE OR REPLACE FUNCTION get_cash_flow_statement(
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
  v_date_from          date    := COALESCE(p_date_from, date_trunc('month', CURRENT_DATE)::date);
  v_date_to            date    := COALESCE(p_date_to,   CURRENT_DATE);

  -- Operating
  v_net_income         numeric := 0;
  v_depreciation       numeric := 0;
  v_op_items           jsonb[] := '{}';
  v_op_wc_total        numeric := 0;
  v_op_total           numeric := 0;

  -- Investing
  v_inv_items          jsonb[] := '{}';
  v_inv_total          numeric := 0;
  v_asset_purchases    numeric := 0;

  -- Financing
  v_fin_items          jsonb[] := '{}';
  v_fin_total          numeric := 0;
  v_partner_contrib    numeric := 0;
  v_partner_withdraw   numeric := 0;

  -- Cash balances
  v_opening_cash       numeric := 0;
  v_closing_cash       numeric := 0;
  v_net_gl_change      numeric := 0;
  v_computed_net       numeric := 0;
  v_unclassified       numeric := 0;

  v_rec                RECORD;
  v_net_movement       numeric;
  v_cash_acct_codes    text[]  := ARRAY['1110','1111','1112'];
BEGIN

  -- ── STEP 1: Net Income from GL ────────────────────────────────────────────
  -- Revenue accounts: income = credit - debit
  -- COGS + Expense accounts: cost   = debit - credit
  -- Net income = total_revenue - total_costs
  SELECT
    COALESCE(SUM(
      CASE WHEN a.type = 'Revenue'
           THEN jl.credit - jl.debit
           ELSE 0
      END
    ), 0)
    -
    COALESCE(SUM(
      CASE WHEN a.type IN ('COGS','Expense')
           THEN jl.debit - jl.credit
           ELSE 0
      END
    ), 0)
  INTO v_net_income
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.journal_entry_id
  JOIN accounts a          ON a.id  = jl.account_id
  WHERE je.status = 'Posted'
    AND je.date   BETWEEN v_date_from AND v_date_to
    AND (p_branch_id IS NULL OR je.branch_id = p_branch_id)
    AND a.type IN ('Revenue','COGS','Expense');

  -- ── STEP 2a: Depreciation add-back (non-cash expense) ────────────────────
  SELECT COALESCE(SUM(de.amount), 0)
  INTO   v_depreciation
  FROM   depreciation_entries de
  JOIN   fixed_assets fa ON fa.id = de.asset_id
  WHERE  de.entry_date BETWEEN v_date_from AND v_date_to
    AND  (p_branch_id IS NULL OR fa.branch_id = p_branch_id);

  IF v_depreciation > 0 THEN
    v_op_items := array_append(v_op_items, jsonb_build_object(
      'label',        'Depreciation (add back)',
      'amount',       ROUND(v_depreciation, 2),
      'account_code', '1200',
      'type',         'non_cash_adjustment'
    ));
  END IF;

  -- ── STEP 2b: Working-capital changes from cash_flow_mapping ──────────────
  FOR v_rec IN
    SELECT cfm.account_id, cfm.line_label, cfm.sort_order, a.code AS account_code
    FROM   cash_flow_mapping cfm
    JOIN   accounts a ON a.id = cfm.account_id
    WHERE  cfm.activity_type = 'operating' AND cfm.is_adjustment = true
    ORDER BY cfm.sort_order
  LOOP
    SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
    INTO   v_net_movement
    FROM   journal_lines jl
    JOIN   journal_entries je ON je.id = jl.journal_entry_id
    WHERE  jl.account_id = v_rec.account_id
      AND  je.status     = 'Posted'
      AND  je.date       BETWEEN v_date_from AND v_date_to
      AND  (p_branch_id IS NULL OR je.branch_id = p_branch_id);

    -- cash_impact = -(debit - credit)
    --   Asset ↑  (DR>CR, net>0) → -(+) = negative = cash used     ✓
    --   Asset ↓  (CR>DR, net<0) → -(-) = positive = cash freed    ✓
    --   Liab ↑   (CR>DR, net<0) → -(-) = positive = cash deferred ✓
    --   Liab ↓   (DR>CR, net>0) → -(+) = negative = cash paid     ✓
    v_net_movement := -v_net_movement;

    IF ABS(v_net_movement) >= 0.005 THEN
      v_op_wc_total := v_op_wc_total + v_net_movement;
      v_op_items    := array_append(v_op_items, jsonb_build_object(
        'label',        v_rec.line_label,
        'amount',       ROUND(v_net_movement, 2),
        'account_code', v_rec.account_code,
        'type',         'working_capital_change'
      ));
    END IF;
  END LOOP;

  v_op_total := v_net_income + v_depreciation + v_op_wc_total;

  -- ── STEP 3: Investing Activities ──────────────────────────────────────────
  FOR v_rec IN
    SELECT cfm.account_id, cfm.line_label, cfm.sort_order, a.code AS account_code
    FROM   cash_flow_mapping cfm
    JOIN   accounts a ON a.id = cfm.account_id
    WHERE  cfm.activity_type = 'investing'
    ORDER BY cfm.sort_order
  LOOP
    SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
    INTO   v_net_movement
    FROM   journal_lines jl
    JOIN   journal_entries je ON je.id = jl.journal_entry_id
    WHERE  jl.account_id = v_rec.account_id
      AND  je.status     = 'Posted'
      AND  je.date       BETWEEN v_date_from AND v_date_to
      AND  (p_branch_id IS NULL OR je.branch_id = p_branch_id);

    v_net_movement := -v_net_movement;

    IF ABS(v_net_movement) >= 0.005 THEN
      v_inv_total := v_inv_total + v_net_movement;
      v_inv_items := array_append(v_inv_items, jsonb_build_object(
        'label',        v_rec.line_label,
        'amount',       ROUND(v_net_movement, 2),
        'account_code', v_rec.account_code,
        'type',         'investing'
      ));
    END IF;
  END LOOP;

  -- Named disclosure from fixed_assets table
  SELECT COALESCE(SUM(fa.purchase_cost), 0)
  INTO   v_asset_purchases
  FROM   fixed_assets fa
  WHERE  fa.purchase_date BETWEEN v_date_from AND v_date_to
    AND  fa.is_deleted IS NOT TRUE
    AND  (p_branch_id IS NULL OR fa.branch_id = p_branch_id);

  -- ── STEP 4: Financing Activities ──────────────────────────────────────────
  FOR v_rec IN
    SELECT cfm.account_id, cfm.line_label, cfm.sort_order, a.code AS account_code
    FROM   cash_flow_mapping cfm
    JOIN   accounts a ON a.id = cfm.account_id
    WHERE  cfm.activity_type = 'financing'
      AND  a.code NOT IN ('3200','3300')
    ORDER BY cfm.sort_order
  LOOP
    SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
    INTO   v_net_movement
    FROM   journal_lines jl
    JOIN   journal_entries je ON je.id = jl.journal_entry_id
    WHERE  jl.account_id = v_rec.account_id
      AND  je.status     = 'Posted'
      AND  je.date       BETWEEN v_date_from AND v_date_to
      AND  (p_branch_id IS NULL OR je.branch_id = p_branch_id);

    v_net_movement := -v_net_movement;

    IF ABS(v_net_movement) >= 0.005 THEN
      v_fin_total := v_fin_total + v_net_movement;
      v_fin_items := array_append(v_fin_items, jsonb_build_object(
        'label',        v_rec.line_label,
        'amount',       ROUND(v_net_movement, 2),
        'account_code', v_rec.account_code,
        'type',         'financing'
      ));
    END IF;
  END LOOP;

  -- Named partner contribution disclosures
  SELECT COALESCE(SUM(pc.amount), 0)
  INTO   v_partner_contrib
  FROM   partner_contributions pc
  WHERE  pc.contribution_date BETWEEN v_date_from AND v_date_to
    AND  pc.is_deleted IS NOT TRUE
    AND  pc.voided_at  IS NULL
    AND  COALESCE(pc.contribution_type, '') != 'withdrawal';

  SELECT COALESCE(SUM(pc.amount), 0)
  INTO   v_partner_withdraw
  FROM   partner_contributions pc
  WHERE  pc.contribution_date BETWEEN v_date_from AND v_date_to
    AND  pc.is_deleted IS NOT TRUE
    AND  pc.voided_at  IS NULL
    AND  pc.contribution_type = 'withdrawal';

  -- ── STEP 5: Cash Balance Verification ────────────────────────────────────
  -- Opening: cumulative GL balance of cash accounts BEFORE period start
  SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
  INTO   v_opening_cash
  FROM   journal_lines jl
  JOIN   journal_entries je ON je.id = jl.journal_entry_id
  JOIN   accounts a         ON a.id  = jl.account_id
  WHERE  a.code  = ANY(v_cash_acct_codes)
    AND  je.status = 'Posted'
    AND  je.date   < v_date_from
    AND  (p_branch_id IS NULL OR je.branch_id = p_branch_id);

  -- Closing: cumulative GL balance through period end
  SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
  INTO   v_closing_cash
  FROM   journal_lines jl
  JOIN   journal_entries je ON je.id = jl.journal_entry_id
  JOIN   accounts a         ON a.id  = jl.account_id
  WHERE  a.code  = ANY(v_cash_acct_codes)
    AND  je.status = 'Posted'
    AND  je.date  <= v_date_to
    AND  (p_branch_id IS NULL OR je.branch_id = p_branch_id);

  v_net_gl_change := ROUND(v_closing_cash - v_opening_cash, 2);
  v_computed_net  := ROUND(v_op_total + v_inv_total + v_fin_total, 2);
  -- Any residual = GL cash movements through accounts NOT in cash_flow_mapping
  v_unclassified  := ROUND(v_net_gl_change - v_computed_net, 2);

  RETURN jsonb_build_object(

    'period', jsonb_build_object(
      'date_from', v_date_from,
      'date_to',   v_date_to,
      'branch_id', p_branch_id
    ),

    'operating', jsonb_build_object(
      'net_income',  ROUND(v_net_income, 2),
      'adjustments', jsonb_build_object(
        'depreciation',          ROUND(v_depreciation, 2),
        'working_capital_total', ROUND(v_op_wc_total,  2),
        'items',                 to_jsonb(v_op_items)
      ),
      'total', ROUND(v_op_total, 2)
    ),

    'investing', jsonb_build_object(
      'asset_purchases_named', ROUND(-v_asset_purchases, 2),
      'items',                 to_jsonb(v_inv_items),
      'total',                 ROUND(v_inv_total, 2)
    ),

    'financing', jsonb_build_object(
      'partner_contributions_named', ROUND(v_partner_contrib,  2),
      'partner_withdrawals_named',   ROUND(-v_partner_withdraw, 2),
      'items',                       to_jsonb(v_fin_items),
      'total',                       ROUND(v_fin_total, 2)
    ),

    'net_change',               v_computed_net,
    'opening_cash',             ROUND(v_opening_cash, 2),
    'closing_cash',             ROUND(v_closing_cash, 2),
    'net_gl_change',            v_net_gl_change,
    'equation_balanced',        ABS(v_unclassified) < 0.02,
    'unclassified_gl_movement', v_unclassified,

    'verification', jsonb_build_object(
      'formula',  'opening_cash + net_change = closing_cash',
      'lhs',      ROUND(v_opening_cash + v_computed_net, 2),
      'rhs',      ROUND(v_closing_cash, 2),
      'balanced', ABS((v_opening_cash + v_computed_net) - v_closing_cash) < 0.02
    )
  );
END;
$$;
