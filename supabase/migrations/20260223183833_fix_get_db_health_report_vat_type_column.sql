/*
  # Fix get_db_health_report: replace non-existent column vat_type with direction

  The duplicate VAT detection query referenced column "vat_type" which does not
  exist in vat_transactions. The correct column is "direction". No logic changed.
*/

CREATE OR REPLACE FUNCTION public.get_db_health_report()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_total_tables           int;
v_sales_count            bigint;
v_purchases_count        bigint;
v_journal_entries_count  bigint;
v_inventory_count        bigint;
v_vat_transactions_count bigint;
v_payroll_runs_count     bigint;
v_last_je_date           date;
v_last_backup_ts         timestamptz;
v_tb_diff                numeric;
v_orphan_sale_items      bigint;
v_orphan_purchase_items  bigint;
v_dup_vat                bigint;
BEGIN
SELECT count(*)
INTO v_total_tables
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_type = 'BASE TABLE';

SELECT count(*) INTO v_sales_count            FROM sales;
SELECT count(*) INTO v_purchases_count        FROM purchases;
SELECT count(*) INTO v_journal_entries_count  FROM journal_entries;
SELECT count(*) INTO v_inventory_count        FROM inventory;
SELECT count(*) INTO v_vat_transactions_count FROM vat_transactions;
SELECT count(*) INTO v_payroll_runs_count     FROM payroll_runs;

SELECT MAX(date)
INTO v_last_je_date
FROM journal_entries
WHERE status = 'Posted';

BEGIN
SELECT MAX(created_at)
INTO v_last_backup_ts
FROM backups;
EXCEPTION WHEN undefined_table THEN
v_last_backup_ts := NULL;
END;

SELECT COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)
INTO v_tb_diff
FROM journal_lines jl
JOIN journal_entries je ON je.id = jl.journal_entry_id
WHERE je.status = 'Posted'
AND je.voided_at IS NULL;

SELECT count(*)
INTO v_orphan_sale_items
FROM sale_items si
WHERE NOT EXISTS (SELECT 1 FROM sales s WHERE s.id = si.sale_id);

SELECT count(*)
INTO v_orphan_purchase_items
FROM purchase_items pi
WHERE NOT EXISTS (SELECT 1 FROM purchases p WHERE p.id = pi.purchase_id);

SELECT count(*)
INTO v_dup_vat
FROM (
  SELECT source_type, source_id, direction
  FROM vat_transactions
  GROUP BY source_type, source_id, direction
  HAVING count(*) > 1
) t;

RETURN jsonb_build_object(
'generated_at',              now(),
'total_tables',              v_total_tables,
'row_counts', jsonb_build_object(
'sales',             v_sales_count,
'purchases',         v_purchases_count,
'journal_entries',   v_journal_entries_count,
'inventory',         v_inventory_count,
'vat_transactions',  v_vat_transactions_count,
'payroll_runs',      v_payroll_runs_count
),
'last_journal_entry_date',   v_last_je_date,
'last_backup_timestamp',     v_last_backup_ts,
'trial_balance_difference',  v_tb_diff,
'orphan_sale_items',         v_orphan_sale_items,
'orphan_purchase_items',     v_orphan_purchase_items,
'duplicate_vat_transactions', v_dup_vat
);
END;
$function$;
