
/*
  # Cash Flow Statement Engine — Migration 5: Pure GL Final

  ## Summary
  Removes the `depreciation_entries` subsidiary-table scan from
  `get_cash_flow_statement()`. Depreciation add-back now comes exclusively
  from the GL (journal_lines), exactly like every other adjustment.

  ### Why this is correct
  The Indirect Method equation:

      Opening Cash + Operating + Investing + Financing = Closing Cash

  can only balance if EVERY number is derived from the same source: the
  General Ledger (Posted journal entries). Mixing GL with subsidiary
  tables (depreciation_entries, fixed_assets, partner_contributions) for
  the core calculation introduces phantom differences.

  ### Depreciation handling going forward
  When a depreciation journal entry is posted:
    DR  Depreciation Expense   (Expense account)
    CR  Accumulated Depreciation (Asset contra account, code ~1214/1215)

  The Expense debit is already deducted in v_net_income.
  The add-back is automatically captured if the Accumulated Depreciation
  account is added to cash_flow_mapping with activity_type='operating'
  and is_adjustment=true.

  Until those contra accounts are seeded, add-back = 0 (correct because
  no cash left the business for depreciation in that period).

  ### Named disclosures (asset_purchases, partner_contributions)
  These are INFORMATIONAL fields sourced from subsidiary tables.
  They appear in the JSON output for analyst reference but are NOT
  included in the totals used for the equation. The totals are
  always GL-only.

  ## No table structure changes. Function recreated only.
*/

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
  v_op_items           jsonb[] := '{}';
  v_op_wc_total        numeric := 0;
  v_op_total           numeric := 0;

  -- Investing
  v_inv_items          jsonb[] := '{}';
  v_inv_total          numeric := 0;
  v_asset_purchases    numeric := 0;   -- informational only

  -- Financing
  v_fin_items          jsonb[] := '{}';
  v_fin_total          numeric := 0;
  v_partner_contrib    numeric := 0;   -- informational only
  v_partner_withdraw   numeric := 0;   -- informational only

  -- Verification
  v_opening_cash       numeric := 0;
  v_closing_cash       numeric := 0;
  v_net_gl_change      numeric := 0;
  v_computed_net       numeric := 0;
  v_unclassified       numeric := 0;

  v_rec                RECORD;
  v_net_movement       numeric;
  v_cash_acct_codes    text[]  := ARRAY['1110','1111','1112'];
BEGIN

  -- ── STEP 1: Net Income — pure GL ─────────────────────────────────────────
  -- Revenue credit-side minus COGS+Expense debit-side from Posted JEs.
  SELECT
    COALESCE(SUM(CASE WHEN a.type = 'Revenue'
                      THEN jl.credit - jl.debit ELSE 0 END), 0)
    -
    COALESCE(SUM(CASE WHEN a.type IN ('COGS','Expense')
                      THEN jl.debit - jl.credit ELSE 0 END), 0)
  INTO v_net_income
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.journal_entry_id
  JOIN accounts a          ON a.id  = jl.account_id
  WHERE je.status = 'Posted'
    AND je.date   BETWEEN v_date_from AND v_date_to
    AND (p_branch_id IS NULL OR je.branch_id = p_branch_id)
    AND a.type IN ('Revenue','COGS','Expense');

  -- ── STEP 2: Operating Adjustments — GL scan of cash_flow_mapping ─────────
  -- Includes: working-capital changes (AR, AP, inventory, VAT)
  --           AND non-cash add-backs (accumulated depreciation if mapped).
  -- Formula: cash_impact = -(debit - credit)
  --   Asset ↑  → net > 0 → -(+) = negative  (cash used)     ✓
  --   Asset ↓  → net < 0 → -(-) = positive  (cash freed)    ✓
  --   Liability ↑ → net < 0 → -(-) = positive (deferred)    ✓
  --   Liability ↓ → net > 0 → -(+) = negative (cash paid)   ✓
  FOR v_rec IN
    SELECT cfm.account_id, cfm.line_label, cfm.sort_order, a.code AS account_code
    FROM   cash_flow_mapping cfm
    JOIN   accounts a ON a.id = cfm.account_id
    WHERE  cfm.activity_type = 'operating'
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
      v_op_wc_total := v_op_wc_total + v_net_movement;
      v_op_items    := array_append(v_op_items, jsonb_build_object(
        'label',        v_rec.line_label,
        'amount',       ROUND(v_net_movement, 2),
        'account_code', v_rec.account_code,
        'type',         'operating_adjustment'
      ));
    END IF;
  END LOOP;

  v_op_total := v_net_income + v_op_wc_total;

  -- ── STEP 3: Investing Activities — GL scan ────────────────────────────────
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

  -- Informational: named asset purchases from fixed_assets subsidiary table
  SELECT COALESCE(SUM(fa.purchase_cost), 0)
  INTO   v_asset_purchases
  FROM   fixed_assets fa
  WHERE  fa.purchase_date BETWEEN v_date_from AND v_date_to
    AND  fa.is_deleted IS NOT TRUE
    AND  (p_branch_id IS NULL OR fa.branch_id = p_branch_id);

  -- ── STEP 4: Financing Activities — GL scan ────────────────────────────────
  FOR v_rec IN
    SELECT cfm.account_id, cfm.line_label, cfm.sort_order, a.code AS account_code
    FROM   cash_flow_mapping cfm
    JOIN   accounts a ON a.id = cfm.account_id
    WHERE  cfm.activity_type = 'financing'
      AND  a.code NOT IN ('3200','3300')   -- P&L retained earnings not a cash flow line
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

  -- Informational: partner contributions from subsidiary table
  SELECT COALESCE(SUM(pc.amount), 0) INTO v_partner_contrib
  FROM partner_contributions pc
  WHERE pc.contribution_date BETWEEN v_date_from AND v_date_to
    AND pc.is_deleted IS NOT TRUE AND pc.voided_at IS NULL
    AND COALESCE(pc.contribution_type,'') != 'withdrawal';

  SELECT COALESCE(SUM(pc.amount), 0) INTO v_partner_withdraw
  FROM partner_contributions pc
  WHERE pc.contribution_date BETWEEN v_date_from AND v_date_to
    AND pc.is_deleted IS NOT TRUE AND pc.voided_at IS NULL
    AND pc.contribution_type = 'withdrawal';

  -- ── STEP 5: Cash Balance Verification — GL only ───────────────────────────
  SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
  INTO   v_opening_cash
  FROM   journal_lines jl
  JOIN   journal_entries je ON je.id = jl.journal_entry_id
  JOIN   accounts a         ON a.id  = jl.account_id
  WHERE  a.code  = ANY(v_cash_acct_codes)
    AND  je.status = 'Posted'
    AND  je.date   < v_date_from
    AND  (p_branch_id IS NULL OR je.branch_id = p_branch_id);

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
  -- Residual = GL cash movements via accounts not yet in cash_flow_mapping
  v_unclassified  := ROUND(v_net_gl_change - v_computed_net, 2);

  RETURN jsonb_build_object(

    'period', jsonb_build_object(
      'date_from', v_date_from,
      'date_to',   v_date_to,
      'branch_id', p_branch_id
    ),

    'operating', jsonb_build_object(
      'net_income',              ROUND(v_net_income,    2),
      'adjustments_total',       ROUND(v_op_wc_total,   2),
      'adjustment_items',        to_jsonb(v_op_items),
      'total',                   ROUND(v_op_total,      2)
    ),

    'investing', jsonb_build_object(
      'items',                   to_jsonb(v_inv_items),
      'total',                   ROUND(v_inv_total,     2),
      'asset_purchases_info',    ROUND(-v_asset_purchases, 2)
    ),

    'financing', jsonb_build_object(
      'items',                           to_jsonb(v_fin_items),
      'total',                           ROUND(v_fin_total,          2),
      'partner_contributions_info',      ROUND(v_partner_contrib,    2),
      'partner_withdrawals_info',        ROUND(-v_partner_withdraw,   2)
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
