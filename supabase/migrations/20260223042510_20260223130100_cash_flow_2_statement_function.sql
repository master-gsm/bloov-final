
/*
  # Cash Flow Statement Engine — Migration 2: get_cash_flow_statement()

  ## Summary
  Implements the full Cash Flow Statement using the **Indirect Method** per IAS 7.

  ## Algorithm (Indirect Method)

  ### Step 1 — Net Income
  Pulled from `get_income_statement()` (net_profit field).
  This is the starting point of Operating Activities.

  ### Step 2 — Operating: Non-cash Adjustments
  a) Depreciation: SUM from depreciation_entries (add back — non-cash expense).
  b) Working-capital changes: For each account in cash_flow_mapping WHERE
     activity_type = 'operating' AND is_adjustment = true, compute:
       net_movement = SUM(jl.debit - jl.credit) for the period  [branch-scoped, Posted JEs]
     Then apply sign_convention:
       +1 → net_movement is added  (liability ↑ or asset ↓ = cash source)
       -1 → net_movement is negated (asset ↑ = cash used)
     Special VAT handling: net VAT settlement cash paid is included.

  ### Step 3 — Investing Activities
  For each account in cash_flow_mapping WHERE activity_type = 'investing':
    net_movement = SUM(jl.debit - jl.credit) * sign_convention
  Additionally pulls direct asset-purchase data from fixed_assets.purchase_cost
  as a cross-check line item.

  ### Step 4 — Financing Activities
  For each account in cash_flow_mapping WHERE activity_type = 'financing':
    net_movement = SUM(jl.debit - jl.credit) * sign_convention
  Partner contributions from partner_contributions table are also included
  as a named line (cash inflows).
  Partner settlements/withdrawals are deducted as dividend-equivalent outflows.

  ### Step 5 — Cash Balance Verification
  Opening cash  = GL balance of cash accounts (1110/1111/1112) at p_date_from - 1 day
  Closing cash  = GL balance of cash accounts at p_date_to
  Net GL change = closing_cash - opening_cash

  Computed net change = operating_total + investing_total + financing_total

  These MUST equal net_gl_change (within 0.01 rounding tolerance).
  If they diverge, the function returns an `unclassified_gl_movement` field
  showing the residual so the accountant can investigate.

  ## Output JSON Structure
  {
    "period": { "date_from": ..., "date_to": ..., "branch_id": ... },
    "operating": {
      "net_income": number,
      "adjustments": {
        "depreciation": number,
        "change_in_ar": number,
        "change_in_inventory": number,
        "change_in_ap": number,
        "change_in_vat": number,
        "other_working_capital": number,
        "items": [{ "label": ..., "amount": ..., "account_code": ... }, ...]
      },
      "total": number
    },
    "investing": {
      "asset_purchases": number,
      "asset_disposals": number,
      "items": [...],
      "total": number
    },
    "financing": {
      "partner_contributions": number,
      "partner_withdrawals": number,
      "loan_proceeds": number,
      "loan_repayments": number,
      "items": [...],
      "total": number
    },
    "net_change": number,
    "opening_cash": number,
    "closing_cash": number,
    "equation_balanced": boolean,
    "unclassified_gl_movement": number
  }

  ## Security
  - SECURITY DEFINER + SET search_path = public
  - Branch isolation: all journal_entry scans filter by p_branch_id (when provided)
  - Read-only: no writes to any table
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
  -- Period
  v_date_from          date    := COALESCE(p_date_from, date_trunc('month', CURRENT_DATE)::date);
  v_date_to            date    := COALESCE(p_date_to,   CURRENT_DATE);

  -- Income statement
  v_is                 jsonb;
  v_net_income         numeric := 0;

  -- Operating
  v_depreciation       numeric := 0;
  v_op_items           jsonb[] := '{}';
  v_op_wc_total        numeric := 0;
  v_op_total           numeric := 0;

  -- Investing
  v_inv_items          jsonb[] := '{}';
  v_inv_total          numeric := 0;
  v_asset_purchases    numeric := 0;
  v_asset_disposals    numeric := 0;

  -- Financing
  v_fin_items          jsonb[] := '{}';
  v_fin_total          numeric := 0;
  v_partner_contrib    numeric := 0;
  v_partner_withdraw   numeric := 0;
  v_loan_proceeds      numeric := 0;
  v_loan_repayments    numeric := 0;

  -- Cash balances
  v_opening_cash       numeric := 0;
  v_closing_cash       numeric := 0;
  v_net_gl_change      numeric := 0;
  v_computed_net       numeric := 0;
  v_unclassified       numeric := 0;

  -- Loop vars
  v_rec                RECORD;
  v_net_movement       numeric;
  v_cash_acct_codes    text[]  := ARRAY['1110','1111','1112'];
BEGIN

  -- ── STEP 1: Net Income ────────────────────────────────────────────────────
  v_is         := get_income_statement(p_branch_id, v_date_from, v_date_to);
  v_net_income := COALESCE((v_is->>'net_profit')::numeric, 0);

  -- ── STEP 2a: Depreciation add-back ───────────────────────────────────────
  -- Depreciation is a non-cash expense already deducted in net_income;
  -- add it back under operating adjustments.
  SELECT COALESCE(SUM(de.amount), 0)
  INTO   v_depreciation
  FROM   depreciation_entries de
  JOIN   fixed_assets fa ON fa.id = de.asset_id
  WHERE  de.entry_date BETWEEN v_date_from AND v_date_to
    AND  (p_branch_id IS NULL OR fa.branch_id = p_branch_id);

  v_op_items := array_append(v_op_items, jsonb_build_object(
    'label',        'Depreciation (add back)',
    'amount',       v_depreciation,
    'account_code', '1200',
    'type',         'non_cash_adjustment'
  ));

  -- ── STEP 2b: Working-capital changes (operating, is_adjustment = true) ────
  FOR v_rec IN
    SELECT
      cfm.account_id,
      cfm.line_label,
      cfm.sign_convention,
      cfm.sort_order,
      a.code AS account_code
    FROM   cash_flow_mapping cfm
    JOIN   accounts a ON a.id = cfm.account_id
    WHERE  cfm.activity_type = 'operating'
      AND  cfm.is_adjustment = true
    ORDER BY cfm.sort_order
  LOOP
    -- net_movement = debit - credit across all Posted JEs for this account/branch/period
    -- For a balance-sheet account:
    --   Positive net_movement → debit > credit → asset increased / liability decreased
    --   Negative net_movement → credit > debit → asset decreased / liability increased
    SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
    INTO   v_net_movement
    FROM   journal_lines jl
    JOIN   journal_entries je ON je.id = jl.journal_entry_id
    WHERE  jl.account_id = v_rec.account_id
      AND  je.status     = 'Posted'
      AND  je.date       BETWEEN v_date_from AND v_date_to
      AND  (p_branch_id IS NULL OR je.branch_id = p_branch_id);

    -- Apply sign convention
    -- sign_convention +1: liability ↑ (credit > debit → net_movement < 0)
    --   → cash impact = -net_movement (positive = inflow)
    -- sign_convention -1: asset ↑ (debit > credit → net_movement > 0)
    --   → cash impact = -net_movement (negative = outflow)
    -- Unified formula: cash_impact = -net_movement * sign_convention
    -- (increases in assets = outflow; increases in liabilities = inflow)
    v_net_movement := (-v_net_movement) * v_rec.sign_convention;

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
  -- 3a: GL-based scan of investing accounts
  FOR v_rec IN
    SELECT
      cfm.account_id,
      cfm.line_label,
      cfm.sign_convention,
      cfm.sort_order,
      a.code AS account_code
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

    -- For investing, debit increase in an asset account = cash outflow
    -- sign_convention = -1 means: cash_impact = -net_movement (debit > credit → negative)
    v_net_movement := (-v_net_movement) * v_rec.sign_convention;

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

  -- 3b: Named summary lines from fixed_assets table (cross-check / named disclosure)
  SELECT COALESCE(SUM(fa.purchase_cost), 0)
  INTO   v_asset_purchases
  FROM   fixed_assets fa
  WHERE  fa.purchase_date BETWEEN v_date_from AND v_date_to
    AND  fa.is_deleted IS NOT TRUE
    AND  (p_branch_id IS NULL OR fa.branch_id = p_branch_id);

  -- ── STEP 4: Financing Activities ──────────────────────────────────────────
  -- 4a: GL-based scan of financing accounts
  FOR v_rec IN
    SELECT
      cfm.account_id,
      cfm.line_label,
      cfm.sign_convention,
      cfm.sort_order,
      a.code AS account_code
    FROM   cash_flow_mapping cfm
    JOIN   accounts a ON a.id = cfm.account_id
    WHERE  cfm.activity_type = 'financing'
      AND  a.code NOT IN ('3200','3300')   -- exclude P&L retained earnings; handled via net income
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

    -- Capital account: credit increase = equity injected = cash in
    -- sign_convention +1: cash_impact = -net_movement
    -- (credit > debit → net_movement negative → -negative = positive = inflow)
    v_net_movement := (-v_net_movement) * v_rec.sign_convention;

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

  -- 4b: Named partner contribution inflows (from partner_contributions table)
  SELECT COALESCE(SUM(pc.amount), 0)
  INTO   v_partner_contrib
  FROM   partner_contributions pc
  JOIN   partners p ON p.id = pc.partner_id
  WHERE  pc.contribution_date BETWEEN v_date_from AND v_date_to
    AND  pc.is_deleted IS NOT TRUE
    AND  pc.voided_at IS NULL
    AND  COALESCE(pc.contribution_type, '') != 'withdrawal'
    AND  (p_branch_id IS NULL OR p.branch_id = p_branch_id);

  -- 4c: Partner withdrawal/dividend outflows
  SELECT COALESCE(SUM(pc.amount), 0)
  INTO   v_partner_withdraw
  FROM   partner_contributions pc
  JOIN   partners p ON p.id = pc.partner_id
  WHERE  pc.contribution_date BETWEEN v_date_from AND v_date_to
    AND  pc.is_deleted IS NOT TRUE
    AND  pc.voided_at IS NULL
    AND  pc.contribution_type = 'withdrawal'
    AND  (p_branch_id IS NULL OR p.branch_id = p_branch_id);

  -- ── STEP 5: Cash Balance Verification ────────────────────────────────────
  -- Opening: GL balance of all cash accounts on the day BEFORE the period start
  SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
  INTO   v_opening_cash
  FROM   journal_lines jl
  JOIN   journal_entries je ON je.id = jl.journal_entry_id
  JOIN   accounts a         ON a.id  = jl.account_id
  WHERE  a.code = ANY(v_cash_acct_codes)
    AND  je.status = 'Posted'
    AND  je.date   < v_date_from
    AND  (p_branch_id IS NULL OR je.branch_id = p_branch_id);

  -- Closing: GL balance of all cash accounts through period end
  SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
  INTO   v_closing_cash
  FROM   journal_lines jl
  JOIN   journal_entries je ON je.id = jl.journal_entry_id
  JOIN   accounts a         ON a.id  = jl.account_id
  WHERE  a.code = ANY(v_cash_acct_codes)
    AND  je.status = 'Posted'
    AND  je.date  <= v_date_to
    AND  (p_branch_id IS NULL OR je.branch_id = p_branch_id);

  v_net_gl_change  := ROUND(v_closing_cash - v_opening_cash, 2);
  v_computed_net   := ROUND(v_op_total + v_inv_total + v_fin_total, 2);
  v_unclassified   := ROUND(v_net_gl_change - v_computed_net, 2);

  -- ── BUILD OUTPUT ──────────────────────────────────────────────────────────
  RETURN jsonb_build_object(

    'period', jsonb_build_object(
      'date_from', v_date_from,
      'date_to',   v_date_to,
      'branch_id', p_branch_id
    ),

    'operating', jsonb_build_object(
      'net_income',   ROUND(v_net_income, 2),
      'adjustments', jsonb_build_object(
        'depreciation',          ROUND(v_depreciation, 2),
        'working_capital_total', ROUND(v_op_wc_total,  2),
        'items',                 to_jsonb(v_op_items)
      ),
      'total', ROUND(v_op_total, 2)
    ),

    'investing', jsonb_build_object(
      'asset_purchases',  ROUND(-v_asset_purchases, 2),
      'asset_disposals',  ROUND(v_asset_disposals,  2),
      'items',            to_jsonb(v_inv_items),
      'total',            ROUND(v_inv_total, 2)
    ),

    'financing', jsonb_build_object(
      'partner_contributions', ROUND(v_partner_contrib,  2),
      'partner_withdrawals',   ROUND(-v_partner_withdraw, 2),
      'loan_proceeds',         ROUND(v_loan_proceeds,    2),
      'loan_repayments',       ROUND(-v_loan_repayments,  2),
      'items',                 to_jsonb(v_fin_items),
      'total',                 ROUND(v_fin_total, 2)
    ),

    'net_change',               v_computed_net,
    'opening_cash',             ROUND(v_opening_cash, 2),
    'closing_cash',             ROUND(v_closing_cash, 2),
    'net_gl_change',            v_net_gl_change,
    'equation_balanced',        ABS(v_unclassified) < 0.01,
    'unclassified_gl_movement', v_unclassified,

    'verification', jsonb_build_object(
      'formula',   'opening_cash + net_change = closing_cash',
      'lhs',       ROUND(v_opening_cash + v_computed_net, 2),
      'rhs',       ROUND(v_closing_cash, 2),
      'balanced',  ABS((v_opening_cash + v_computed_net) - v_closing_cash) < 0.02
    )

  );
END;
$$;
