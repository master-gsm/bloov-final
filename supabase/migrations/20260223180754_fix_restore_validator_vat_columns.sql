/*
  # Fix validate_restore_readiness — correct vat_transactions column names

  The previous version referenced vat_type which does not exist.
  The actual unique index uq_vat_tx_source_direction covers (source_type, source_id, direction).
  This migration replaces the function body to use the correct column names.
*/

CREATE OR REPLACE FUNCTION public.validate_restore_readiness()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_results   jsonb := '[]'::jsonb;
  v_count     bigint;
  v_diff      numeric;
BEGIN

  -- =========================================================================
  -- SECTION 1 — FK CHAIN VIOLATIONS
  -- =========================================================================

  SELECT count(*) INTO v_count
  FROM branches b
  WHERE b.manager_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = b.manager_id);
  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'check_name',     'branches.manager_id → users.id',
    'status',         CASE WHEN v_count=0 THEN 'ok' ELSE 'fail' END,
    'failure_type',   CASE WHEN v_count=0 THEN 'ok' ELSE 'fk_violation' END,
    'affected_table', 'branches',
    'detail',         CASE WHEN v_count=0 THEN 'All manager_id values resolve'
                      ELSE format('%s rows reference missing users.id — restore users BEFORE branches', v_count) END
  ));

  SELECT count(*) INTO v_count
  FROM users u
  WHERE u.branch_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM branches b WHERE b.id = u.branch_id);
  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'check_name',     'users.branch_id → branches.id (circular FK)',
    'status',         CASE WHEN v_count=0 THEN 'ok' ELSE 'fail' END,
    'failure_type',   CASE WHEN v_count=0 THEN 'ok' ELSE 'fk_violation' END,
    'affected_table', 'users',
    'detail',         CASE WHEN v_count=0 THEN 'All branch_id values resolve'
                      ELSE format('%s user rows reference missing branches.id — circular FK requires SET CONSTRAINTS DEFERRED on restore', v_count) END
  ));

  SELECT count(*) INTO v_count
  FROM accounts a
  WHERE a.parent_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM accounts p WHERE p.id = a.parent_id);
  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'check_name',     'accounts.parent_id self-reference FK',
    'status',         CASE WHEN v_count=0 THEN 'ok' ELSE 'fail' END,
    'failure_type',   CASE WHEN v_count=0 THEN 'ok' ELSE 'fk_violation' END,
    'affected_table', 'accounts',
    'detail',         CASE WHEN v_count=0 THEN 'All parent_id values resolve'
                      ELSE format('%s account rows reference missing parent — self-FK needs SET CONSTRAINTS DEFERRED on restore', v_count) END
  ));

  SELECT count(*) INTO v_count
  FROM journal_entries je
  WHERE (je.original_entry_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM journal_entries p WHERE p.id = je.original_entry_id))
     OR (je.reverse_entry_id   IS NOT NULL AND NOT EXISTS (SELECT 1 FROM journal_entries p WHERE p.id = je.reverse_entry_id));
  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'check_name',     'journal_entries self-reference FK (original/reverse)',
    'status',         CASE WHEN v_count=0 THEN 'ok' ELSE 'fail' END,
    'failure_type',   CASE WHEN v_count=0 THEN 'ok' ELSE 'fk_violation' END,
    'affected_table', 'journal_entries',
    'detail',         CASE WHEN v_count=0 THEN 'All original/reverse references resolve'
                      ELSE format('%s rows reference missing original or reverse journal entry — needs SET CONSTRAINTS DEFERRED', v_count) END
  ));

  SELECT count(*) INTO v_count
  FROM journal_lines jl
  WHERE NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = jl.journal_entry_id);
  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'check_name',     'journal_lines.journal_entry_id → journal_entries.id (RESTRICT)',
    'status',         CASE WHEN v_count=0 THEN 'ok' ELSE 'fail' END,
    'failure_type',   CASE WHEN v_count=0 THEN 'ok' ELSE 'fk_violation' END,
    'affected_table', 'journal_lines',
    'detail',         CASE WHEN v_count=0 THEN 'All journal_entry_id values resolve'
                      ELSE format('%s journal_line rows reference missing journal_entries — alphabetical restore puts journal_lines before journal_entries', v_count) END
  ));

  SELECT count(*) INTO v_count
  FROM sale_items si
  WHERE NOT EXISTS (SELECT 1 FROM sales s WHERE s.id = si.sale_id);
  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'check_name',     'sale_items.sale_id → sales.id',
    'status',         CASE WHEN v_count=0 THEN 'ok' ELSE 'fail' END,
    'failure_type',   CASE WHEN v_count=0 THEN 'ok' ELSE 'orphan' END,
    'affected_table', 'sale_items',
    'detail',         CASE WHEN v_count=0 THEN 'All sale_id values resolve'
                      ELSE format('%s sale_item rows have no matching sale — orphans violate FK on restore', v_count) END
  ));

  SELECT count(*) INTO v_count
  FROM sale_items si
  WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = si.product_id);
  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'check_name',     'sale_items.product_id → products.id (RESTRICT)',
    'status',         CASE WHEN v_count=0 THEN 'ok' ELSE 'fail' END,
    'failure_type',   CASE WHEN v_count=0 THEN 'ok' ELSE 'fk_violation' END,
    'affected_table', 'sale_items',
    'detail',         CASE WHEN v_count=0 THEN 'All product_id values resolve'
                      ELSE format('%s sale_item rows reference missing products — RESTRICT prevents restore', v_count) END
  ));

  SELECT count(*) INTO v_count
  FROM purchase_items pi
  WHERE NOT EXISTS (SELECT 1 FROM purchases p WHERE p.id = pi.purchase_id);
  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'check_name',     'purchase_items.purchase_id → purchases.id',
    'status',         CASE WHEN v_count=0 THEN 'ok' ELSE 'fail' END,
    'failure_type',   CASE WHEN v_count=0 THEN 'ok' ELSE 'orphan' END,
    'affected_table', 'purchase_items',
    'detail',         CASE WHEN v_count=0 THEN 'All purchase_id values resolve'
                      ELSE format('%s purchase_item rows have no matching purchase', v_count) END
  ));

  SELECT count(*) INTO v_count
  FROM purchase_items pi
  WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = pi.product_id);
  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'check_name',     'purchase_items.product_id → products.id (RESTRICT)',
    'status',         CASE WHEN v_count=0 THEN 'ok' ELSE 'fail' END,
    'failure_type',   CASE WHEN v_count=0 THEN 'ok' ELSE 'fk_violation' END,
    'affected_table', 'purchase_items',
    'detail',         CASE WHEN v_count=0 THEN 'All product_id values resolve'
                      ELSE format('%s purchase_item rows reference missing products — RESTRICT prevents restore', v_count) END
  ));

  SELECT count(*) INTO v_count
  FROM commission_accruals ca
  WHERE NOT EXISTS (SELECT 1 FROM sales s WHERE s.id = ca.sale_id)
     OR NOT EXISTS (SELECT 1 FROM employees e WHERE e.id = ca.employee_id);
  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'check_name',     'commission_accruals → sales + employees (RESTRICT)',
    'status',         CASE WHEN v_count=0 THEN 'ok' ELSE 'fail' END,
    'failure_type',   CASE WHEN v_count=0 THEN 'ok' ELSE 'fk_violation' END,
    'affected_table', 'commission_accruals',
    'detail',         CASE WHEN v_count=0 THEN 'All FK values resolve'
                      ELSE format('%s rows reference missing sales or employees — RESTRICT', v_count) END
  ));

  SELECT count(*) INTO v_count
  FROM employees e
  WHERE e.user_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = e.user_id);
  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'check_name',     'employees.user_id → users.id (RESTRICT)',
    'status',         CASE WHEN v_count=0 THEN 'ok' ELSE 'fail' END,
    'failure_type',   CASE WHEN v_count=0 THEN 'ok' ELSE 'fk_violation' END,
    'affected_table', 'employees',
    'detail',         CASE WHEN v_count=0 THEN 'All user_id values resolve'
                      ELSE format('%s employee rows reference missing users — restore users before employees', v_count) END
  ));

  SELECT count(*) INTO v_count
  FROM payroll_lines pl
  WHERE NOT EXISTS (SELECT 1 FROM payroll_runs pr WHERE pr.id = pl.payroll_run_id)
     OR NOT EXISTS (SELECT 1 FROM employees e WHERE e.id = pl.employee_id);
  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'check_name',     'payroll_lines → payroll_runs + employees (RESTRICT)',
    'status',         CASE WHEN v_count=0 THEN 'ok' ELSE 'fail' END,
    'failure_type',   CASE WHEN v_count=0 THEN 'ok' ELSE 'fk_violation' END,
    'affected_table', 'payroll_lines',
    'detail',         CASE WHEN v_count=0 THEN 'All FK values resolve'
                      ELSE format('%s rows reference missing payroll_runs or employees — RESTRICT', v_count) END
  ));

  SELECT count(*) INTO v_count
  FROM purchase_receipts pr
  WHERE NOT EXISTS (SELECT 1 FROM purchases p WHERE p.id = pr.purchase_id);
  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'check_name',     'purchase_receipts.purchase_id → purchases.id (RESTRICT)',
    'status',         CASE WHEN v_count=0 THEN 'ok' ELSE 'fail' END,
    'failure_type',   CASE WHEN v_count=0 THEN 'ok' ELSE 'fk_violation' END,
    'affected_table', 'purchase_receipts',
    'detail',         CASE WHEN v_count=0 THEN 'All purchase_id values resolve'
                      ELSE format('%s rows reference missing purchases — RESTRICT', v_count) END
  ));

  SELECT count(*) INTO v_count
  FROM operating_expenses oe
  WHERE oe.partner_contribution_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM partner_contributions pc WHERE pc.id = oe.partner_contribution_id);
  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'check_name',     'operating_expenses.partner_contribution_id → partner_contributions.id',
    'status',         CASE WHEN v_count=0 THEN 'ok' ELSE 'fail' END,
    'failure_type',   CASE WHEN v_count=0 THEN 'ok' ELSE 'fk_violation' END,
    'affected_table', 'operating_expenses',
    'detail',         CASE WHEN v_count=0 THEN 'All FK values resolve'
                      ELSE format('%s rows reference missing partner_contributions', v_count) END
  ));

  SELECT count(*) INTO v_count
  FROM vat_transactions vt
  WHERE vt.vat_return_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM vat_returns vr WHERE vr.id = vt.vat_return_id);
  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'check_name',     'vat_transactions.vat_return_id → vat_returns.id',
    'status',         CASE WHEN v_count=0 THEN 'ok' ELSE 'fail' END,
    'failure_type',   CASE WHEN v_count=0 THEN 'ok' ELSE 'fk_violation' END,
    'affected_table', 'vat_transactions',
    'detail',         CASE WHEN v_count=0 THEN 'All vat_return_id values resolve'
                      ELSE format('%s rows reference missing vat_returns', v_count) END
  ));

  -- =========================================================================
  -- SECTION 2 — UNIQUE / DUPLICATE KEY VIOLATIONS
  -- =========================================================================

  SELECT count(*) - count(DISTINCT sale_number) INTO v_count FROM sales;
  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'check_name',     'sales.sale_number UNIQUE constraint',
    'status',         CASE WHEN v_count=0 THEN 'ok' ELSE 'fail' END,
    'failure_type',   CASE WHEN v_count=0 THEN 'ok' ELSE 'duplicate_key' END,
    'affected_table', 'sales',
    'detail',         CASE WHEN v_count=0 THEN 'No duplicates' ELSE format('%s duplicate sale_number values', v_count) END
  ));

  SELECT count(*) - count(DISTINCT purchase_number) INTO v_count FROM purchases;
  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'check_name',     'purchases.purchase_number UNIQUE constraint',
    'status',         CASE WHEN v_count=0 THEN 'ok' ELSE 'fail' END,
    'failure_type',   CASE WHEN v_count=0 THEN 'ok' ELSE 'duplicate_key' END,
    'affected_table', 'purchases',
    'detail',         CASE WHEN v_count=0 THEN 'No duplicates' ELSE format('%s duplicate purchase_number values', v_count) END
  ));

  SELECT count(*) - count(DISTINCT entry_number) INTO v_count FROM journal_entries;
  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'check_name',     'journal_entries.entry_number UNIQUE constraint',
    'status',         CASE WHEN v_count=0 THEN 'ok' ELSE 'fail' END,
    'failure_type',   CASE WHEN v_count=0 THEN 'ok' ELSE 'duplicate_key' END,
    'affected_table', 'journal_entries',
    'detail',         CASE WHEN v_count=0 THEN 'No duplicates' ELSE format('%s duplicate entry_number values', v_count) END
  ));

  SELECT count(*) - count(DISTINCT run_number) INTO v_count FROM payroll_runs;
  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'check_name',     'payroll_runs.run_number UNIQUE constraint',
    'status',         CASE WHEN v_count=0 THEN 'ok' ELSE 'fail' END,
    'failure_type',   CASE WHEN v_count=0 THEN 'ok' ELSE 'duplicate_key' END,
    'affected_table', 'payroll_runs',
    'detail',         CASE WHEN v_count=0 THEN 'No duplicates' ELSE format('%s duplicate run_number values', v_count) END
  ));

  SELECT count(*) - count(DISTINCT expense_number) INTO v_count FROM expenses;
  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'check_name',     'expenses.expense_number UNIQUE constraint',
    'status',         CASE WHEN v_count=0 THEN 'ok' ELSE 'fail' END,
    'failure_type',   CASE WHEN v_count=0 THEN 'ok' ELSE 'duplicate_key' END,
    'affected_table', 'expenses',
    'detail',         CASE WHEN v_count=0 THEN 'No duplicates' ELSE format('%s duplicate expense_number values', v_count) END
  ));

  -- vat_transactions: actual unique index is (source_type, source_id, direction)
  SELECT count(*) INTO v_count
  FROM (
    SELECT source_type, source_id, direction
    FROM vat_transactions
    GROUP BY source_type, source_id, direction
    HAVING count(*) > 1
  ) t;
  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'check_name',     'vat_transactions (source_type, source_id, direction) UNIQUE — uq_vat_tx_source_direction',
    'status',         CASE WHEN v_count=0 THEN 'ok' ELSE 'fail' END,
    'failure_type',   CASE WHEN v_count=0 THEN 'ok' ELSE 'duplicate_key' END,
    'affected_table', 'vat_transactions',
    'detail',         CASE WHEN v_count=0 THEN 'No duplicates'
                      ELSE format('%s duplicate groups on (source_type, source_id, direction)', v_count) END
  ));

  SELECT count(*) INTO v_count
  FROM (
    SELECT product_id, branch_id FROM inventory
    GROUP BY product_id, branch_id HAVING count(*) > 1
  ) t;
  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'check_name',     'inventory (product_id, branch_id) UNIQUE',
    'status',         CASE WHEN v_count=0 THEN 'ok' ELSE 'fail' END,
    'failure_type',   CASE WHEN v_count=0 THEN 'ok' ELSE 'duplicate_key' END,
    'affected_table', 'inventory',
    'detail',         CASE WHEN v_count=0 THEN 'No duplicates'
                      ELSE format('%s duplicate (product_id, branch_id) pairs', v_count) END
  ));

  SELECT count(*) INTO v_count
  FROM (
    SELECT product_id, branch_id FROM product_costing
    GROUP BY product_id, branch_id HAVING count(*) > 1
  ) t;
  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'check_name',     'product_costing (product_id, branch_id) UNIQUE',
    'status',         CASE WHEN v_count=0 THEN 'ok' ELSE 'fail' END,
    'failure_type',   CASE WHEN v_count=0 THEN 'ok' ELSE 'duplicate_key' END,
    'affected_table', 'product_costing',
    'detail',         CASE WHEN v_count=0 THEN 'No duplicates'
                      ELSE format('%s duplicate (product_id, branch_id) pairs', v_count) END
  ));

  -- =========================================================================
  -- SECTION 3 — FINANCIAL INTEGRITY
  -- =========================================================================

  SELECT COALESCE(SUM(jl.debit),0) - COALESCE(SUM(jl.credit),0)
  INTO v_diff
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.journal_entry_id
  WHERE je.status = 'Posted' AND je.voided_at IS NULL;

  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'check_name',     'Trial Balance (Posted entries, debit - credit)',
    'status',         CASE WHEN ABS(COALESCE(v_diff,0)) <= 0.005 THEN 'ok' ELSE 'fail' END,
    'failure_type',   CASE WHEN ABS(COALESCE(v_diff,0)) <= 0.005 THEN 'ok' ELSE 'imbalance' END,
    'affected_table', 'journal_lines',
    'detail',         format('Difference = %s (threshold ±0.005)', ROUND(COALESCE(v_diff,0), 4))
  ));

  RETURN jsonb_build_object(
    'generated_at',  now(),
    'total_checks',  jsonb_array_length(v_results),
    'failed_checks', (
      SELECT count(*)::int FROM jsonb_array_elements(v_results) r
      WHERE r->>'status' = 'fail'
    ),
    'checks', v_results
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_restore_readiness() TO authenticated;
