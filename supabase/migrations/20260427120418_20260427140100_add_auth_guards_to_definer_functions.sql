/*
  # Add authorization guards to SECURITY DEFINER functions

  1. Changes
    - Adds auth.uid() IS NOT NULL checks to functions missing authentication validation
    - Adds admin role checks to sensitive functions (payroll, restore, permissions, depreciation)
    - These functions must remain SECURITY DEFINER because they write across multiple
      tables atomically or bypass RLS triggers

  2. Functions modified
    - pay_payroll_run: Added admin/hr_manager role check
    - perform_atomic_restore: Added super_admin role check
    - upsert_user_permissions: Added admin role check
    - generate_depreciation_entries: Added admin/accountant role check
    - void_setup_expense: Already delegates to void_partner_operation_atomic which has checks
    - assign_branch_to_user: Already has auth check, no change needed

  3. Security
    - Even though these functions were already restricted to authenticated users,
      the internal role checks ensure only authorized roles can execute them
*/

-- ============================================================
-- pay_payroll_run: Add admin/hr_manager check
-- ============================================================
CREATE OR REPLACE FUNCTION public.pay_payroll_run(p_run_id uuid, p_payment_method text DEFAULT 'bank_transfer'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_run                   payroll_runs%ROWTYPE;
v_item                  payroll_items%ROWTYPE;
v_expense_number        text;
v_salary_total          numeric := 0;
v_commission_total      numeric := 0;
v_net_total             numeric := 0;
v_shift_id              uuid;
v_loan_id               uuid;
v_je_id                 uuid;
v_je_number             text;
v_cash_account_id       uuid;
v_salary_account_id     uuid;
v_commission_account_id uuid;
v_expense_seq           int;
v_expense_seq_base      int;
v_expense_payment_method text;
v_caller_role           text;
BEGIN
-- Auth guard: require admin or hr_manager
SELECT role INTO v_caller_role FROM users WHERE id = auth.uid() AND is_active = true;
IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'admin', 'hr_manager') THEN
  RAISE EXCEPTION 'Access denied: admin or HR manager role required';
END IF;

SELECT * INTO v_run FROM payroll_runs WHERE id = p_run_id;
IF NOT FOUND THEN
RAISE EXCEPTION 'Payroll run not found: %', p_run_id;
END IF;
IF v_run.status != 'approved' THEN
RAISE EXCEPTION 'Payroll run must be approved before payment (current: %)', v_run.status;
END IF;

IF EXISTS (
SELECT 1 FROM journal_entries
WHERE reference_type = 'payroll_run'
AND reference_id   = p_run_id
AND voided_at IS NULL
) THEN
UPDATE payroll_runs
SET status         = 'paid',
payment_method = p_payment_method,
paid_at        = COALESCE(paid_at, now()),
updated_at     = now()
WHERE id = p_run_id AND status = 'approved';
RETURN jsonb_build_object('success', true, 'note', 'GL already posted, run marked paid');
END IF;

v_expense_payment_method := CASE p_payment_method
WHEN 'bank_transfer' THEN 'transfer'
WHEN 'card'          THEN 'card'
WHEN 'cash'          THEN 'cash'
ELSE 'transfer'
END;

PERFORM set_config('app.bypass_immutable', 'true', true);

SELECT id INTO v_cash_account_id       FROM accounts WHERE code = '1110' AND is_active = true LIMIT 1;
SELECT id INTO v_salary_account_id     FROM accounts WHERE code = '6100' AND is_active = true LIMIT 1;
SELECT id INTO v_commission_account_id FROM accounts WHERE code = '6110' AND is_active = true LIMIT 1;

SELECT COALESCE(MAX(NULLIF(regexp_replace(expense_number, '[^0-9]', '', 'g'), '')::int), 0)
INTO v_expense_seq_base
FROM expenses
WHERE expense_number LIKE 'EXP-' || TO_CHAR(now(), 'YYYYMMDD') || '-%';
v_expense_seq := v_expense_seq_base + 1;

FOR v_item IN
SELECT * FROM payroll_items WHERE payroll_run_id = p_run_id
LOOP
v_expense_number := 'EXP-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD(v_expense_seq::text, 4, '0');
v_expense_seq := v_expense_seq + 1;

IF COALESCE(v_item.net_salary, v_item.net_pay, 0) > 0 THEN
INSERT INTO expenses (
id, expense_number, category, description, description_ar,
amount, expense_date, payment_method, branch_id,
created_by, created_at
) VALUES (
gen_random_uuid(), v_expense_number, 'salaries',
'Payroll: ' || TO_CHAR(make_date(v_run.period_year, v_run.period_month, 1), 'Month YYYY'),
'رواتب: '   || TO_CHAR(make_date(v_run.period_year, v_run.period_month, 1), 'Month YYYY'),
COALESCE(v_item.net_salary, v_item.net_pay, 0),
CURRENT_DATE, v_expense_payment_method, v_run.branch_id,
v_run.created_by, now()
);
v_salary_total := v_salary_total + COALESCE(v_item.net_salary, v_item.net_pay, 0);
END IF;

IF COALESCE(v_item.commission_amount, v_item.commission_total, 0) > 0 THEN
v_expense_number := 'EXP-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD(v_expense_seq::text, 4, '0');
v_expense_seq := v_expense_seq + 1;

INSERT INTO expenses (
id, expense_number, category, description, description_ar,
amount, expense_date, payment_method, branch_id,
created_by, created_at
) VALUES (
gen_random_uuid(), v_expense_number, 'commissions',
'Commissions: ' || TO_CHAR(make_date(v_run.period_year, v_run.period_month, 1), 'Month YYYY'),
'عمولات: '      || TO_CHAR(make_date(v_run.period_year, v_run.period_month, 1), 'Month YYYY'),
COALESCE(v_item.commission_amount, v_item.commission_total, 0),
CURRENT_DATE, v_expense_payment_method, v_run.branch_id,
v_run.created_by, now()
);
v_commission_total := v_commission_total + COALESCE(v_item.commission_amount, v_item.commission_total, 0);
END IF;

UPDATE employee_commissions
SET is_paid    = true,
status     = 'approved',
updated_at = now()
WHERE employee_id  = v_item.employee_id
AND period_month = v_run.period_month
AND period_year  = v_run.period_year
AND is_paid = false;

IF COALESCE(v_item.loan_deduction, 0) > 0 THEN
SELECT id INTO v_loan_id
FROM employee_loans
WHERE employee_id = v_item.employee_id
AND status      = 'active'
AND branch_id   = v_run.branch_id
LIMIT 1;

IF v_loan_id IS NOT NULL THEN
UPDATE employee_loans
SET remaining_balance = GREATEST(remaining_balance - v_item.loan_deduction, 0),
status = CASE
WHEN remaining_balance - v_item.loan_deduction <= 0 THEN 'completed'
ELSE status
END,
updated_at = now()
WHERE id = v_loan_id;
END IF;
END IF;

UPDATE employee_leaves
SET payroll_deducted = true,
updated_at       = now()
WHERE employee_id      = v_item.employee_id
AND leave_type       = 'unpaid'
AND status           = 'approved'
AND payroll_deducted = false
AND EXTRACT(MONTH FROM start_date) = v_run.period_month
AND EXTRACT(YEAR  FROM start_date) = v_run.period_year;
END LOOP;

v_net_total := v_salary_total + v_commission_total;

IF p_payment_method IN ('cash', 'bank_transfer') THEN
SELECT id INTO v_shift_id
FROM cash_shifts
WHERE branch_id = v_run.branch_id
AND status    = 'open'
ORDER BY opened_at DESC
LIMIT 1;

IF v_shift_id IS NOT NULL THEN
INSERT INTO cash_transactions (
id, shift_id, branch_id, transaction_type,
amount, description, reference_id, reference_type,
created_by, created_at
) VALUES (
gen_random_uuid(), v_shift_id, v_run.branch_id, 'expense_out',
v_net_total,
'Payroll: ' || TO_CHAR(make_date(v_run.period_year, v_run.period_month, 1), 'Month YYYY'),
p_run_id, 'payroll_run',
v_run.created_by, now()
);

UPDATE cash_shifts
SET expected_balance = expected_balance - v_net_total,
updated_at       = now()
WHERE id = v_shift_id;
END IF;
END IF;

IF v_cash_account_id IS NOT NULL AND v_net_total > 0 THEN
v_je_id     := gen_random_uuid();
v_je_number := 'JE-PAY-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || SUBSTRING(p_run_id::text, 1, 8);

INSERT INTO journal_entries (
id, entry_number, date, description,
branch_id, reference_id, reference_type,
status, created_by, created_at, updated_at
) VALUES (
v_je_id, v_je_number, CURRENT_DATE,
'Payroll payment: ' || TO_CHAR(make_date(v_run.period_year, v_run.period_month, 1), 'Month YYYY'),
v_run.branch_id, p_run_id, 'payroll_run',
'Draft', v_run.created_by, now(), now()
);

IF v_salary_total > 0 AND v_salary_account_id IS NOT NULL THEN
INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, description, line_number, created_at)
VALUES (gen_random_uuid(), v_je_id, v_salary_account_id, v_salary_total, 0, 'Salaries paid', 1, now());
END IF;

IF v_commission_total > 0 THEN
INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, description, line_number, created_at)
VALUES (gen_random_uuid(), v_je_id, COALESCE(v_commission_account_id, v_salary_account_id), v_commission_total, 0, 'Commissions paid', 2, now());
END IF;

INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, description, line_number, created_at)
VALUES (gen_random_uuid(), v_je_id, v_cash_account_id, 0, v_net_total, 'Cash out: payroll',
CASE WHEN v_commission_total > 0 THEN 3 ELSE 2 END, now());

UPDATE journal_entries
SET status     = 'Posted',
posted_by  = v_run.created_by,
posted_at  = now(),
updated_at = now()
WHERE id = v_je_id;
END IF;

UPDATE payroll_runs
SET status         = 'paid',
payment_method = p_payment_method,
paid_at        = now(),
approved_at    = COALESCE(approved_at, now()),
updated_at     = now()
WHERE id = p_run_id;

PERFORM set_config('app.bypass_immutable', 'false', true);

RETURN jsonb_build_object(
'success',          true,
'salary_total',     v_salary_total,
'commission_total', v_commission_total,
'net_total',        v_net_total,
'shift_registered', (v_shift_id IS NOT NULL)
);

EXCEPTION WHEN OTHERS THEN
PERFORM set_config('app.bypass_immutable', 'false', true);
RAISE;
END;
$function$;

-- ============================================================
-- perform_atomic_restore: Add super_admin check
-- ============================================================
CREATE OR REPLACE FUNCTION public.perform_atomic_restore(p_backup jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_restore_order text[] := ARRAY[
'settings', 'branches', 'users', 'permissions', 'employees',
'products', 'inventory', 'customers', 'suppliers',
'purchases', 'purchase_items', 'sales', 'sale_items',
'partners', 'partner_contributions', 'setup_expenses',
'operating_expenses', 'expenses',
'cash_shifts', 'cash_transactions',
'salla_orders', 'salla_order_items',
'loyalty_transactions', 'audit_logs'
];
v_table          text;
v_table_data     jsonb;
v_row_count      int;
v_restored_tables int   := 0;
v_restored_records int  := 0;
v_errors         jsonb[] := '{}';
v_failed_tables  text[]  := '{}';
v_sql            text;
v_err_message    text;
v_err_detail     text;
v_err_hint       text;
v_err_sqlstate   text;
BEGIN
-- Auth guard: only super_admin can restore
IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin' AND is_active = true) THEN
  RAISE EXCEPTION 'Access denied: only super_admin can perform database restore';
END IF;

IF p_backup IS NULL OR p_backup -> 'data' IS NULL THEN
RETURN jsonb_build_object(
'success',          false,
'restored_tables',  0,
'restored_records', 0,
'failed_tables',    '[]'::jsonb,
'errors',           jsonb_build_array(jsonb_build_object(
'table',   'validation',
'message', 'Backup payload is missing the "data" key',
'detail',  NULL,
'hint',    'Ensure the backup file has a top-level "data" object'
)),
'rolled_back', true
);
END IF;

FOREACH v_table IN ARRAY v_restore_order LOOP
v_table_data := p_backup -> 'data' -> v_table;

IF v_table_data IS NULL OR jsonb_array_length(v_table_data) = 0 THEN
CONTINUE;
END IF;

v_row_count := jsonb_array_length(v_table_data);

BEGIN
v_sql := format(
'INSERT INTO %I SELECT * FROM jsonb_populate_recordset(null::%I, $1) '
'ON CONFLICT (id) DO UPDATE SET '
'id = EXCLUDED.id',
v_table, v_table
);

EXECUTE v_sql USING v_table_data;

v_restored_tables  := v_restored_tables  + 1;
v_restored_records := v_restored_records + v_row_count;

EXCEPTION WHEN OTHERS THEN
GET STACKED DIAGNOSTICS
v_err_message  = MESSAGE_TEXT,
v_err_detail   = PG_EXCEPTION_DETAIL,
v_err_hint     = PG_EXCEPTION_HINT,
v_err_sqlstate = RETURNED_SQLSTATE;

v_errors := array_append(
v_errors,
jsonb_build_object(
'table',    v_table,
'message',  v_err_message,
'detail',   v_err_detail,
'hint',     v_err_hint,
'sqlstate', v_err_sqlstate,
'rows_attempted', v_row_count
)
);
v_failed_tables := array_append(v_failed_tables, v_table);

RAISE EXCEPTION 'Atomic restore aborted: table "%" failed — %. Rolling back all changes.',
v_table, v_err_message
USING DETAIL  = v_err_detail,
HINT    = 'All previously restored tables have been rolled back. No data was changed.',
ERRCODE = v_err_sqlstate;
END;
END LOOP;

RETURN jsonb_build_object(
'success',          true,
'restored_tables',  v_restored_tables,
'restored_records', v_restored_records,
'failed_tables',    to_jsonb(v_failed_tables),
'errors',           to_jsonb(v_errors),
'rolled_back',      false
);

EXCEPTION WHEN OTHERS THEN
GET STACKED DIAGNOSTICS
v_err_message = MESSAGE_TEXT,
v_err_detail  = PG_EXCEPTION_DETAIL;

RETURN jsonb_build_object(
'success',          false,
'restored_tables',  0,
'restored_records', 0,
'failed_tables',    to_jsonb(v_failed_tables),
'errors',           to_jsonb(v_errors),
'rolled_back',      true
);
END;
$function$;

-- ============================================================
-- upsert_user_permissions: Add admin check
-- ============================================================
CREATE OR REPLACE FUNCTION public.upsert_user_permissions(p_user_id uuid, p_permissions jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_section text;
v_perms jsonb;
v_caller_role text;
BEGIN
-- Auth guard: only admin or super_admin can modify permissions
SELECT role INTO v_caller_role FROM users WHERE id = auth.uid() AND is_active = true;
IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'admin') THEN
  RAISE EXCEPTION 'Access denied: admin role required to modify permissions';
END IF;

FOR v_section, v_perms IN SELECT * FROM jsonb_each(p_permissions)
LOOP
INSERT INTO user_permissions (user_id, section, can_view, can_create, can_edit, can_delete, updated_at)
VALUES (
p_user_id,
v_section,
COALESCE((v_perms->>'view')::boolean, false),
COALESCE((v_perms->>'create')::boolean, false),
COALESCE((v_perms->>'edit')::boolean, false),
COALESCE((v_perms->>'delete')::boolean, false),
now()
)
ON CONFLICT (user_id, section)
DO UPDATE SET
can_view = COALESCE((v_perms->>'view')::boolean, false),
can_create = COALESCE((v_perms->>'create')::boolean, false),
can_edit = COALESCE((v_perms->>'edit')::boolean, false),
can_delete = COALESCE((v_perms->>'delete')::boolean, false),
updated_at = now();
END LOOP;
END;
$function$;

-- ============================================================
-- generate_depreciation_entries: Add admin/accountant check
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_depreciation_entries(p_up_to_date date DEFAULT CURRENT_DATE)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
asset RECORD;
month_cursor date;
monthly_amount numeric;
running_accumulated numeric;
running_book_value numeric;
entries_created integer := 0;
asset_end_date date;
v_caller_role text;
BEGIN
-- Auth guard: require admin or accountant
SELECT role INTO v_caller_role FROM users WHERE id = auth.uid() AND is_active = true;
IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'admin', 'accountant') THEN
  RAISE EXCEPTION 'Access denied: admin or accountant role required';
END IF;

FOR asset IN
SELECT id, purchase_cost, salvage_value, useful_life_months, depreciation_start_date
FROM fixed_assets
WHERE is_deleted = false
AND is_active = true
AND depreciation_start_date <= p_up_to_date
LOOP
monthly_amount := ROUND((asset.purchase_cost - asset.salvage_value) / asset.useful_life_months, 2);
asset_end_date := asset.depreciation_start_date + (asset.useful_life_months || ' months')::interval;

SELECT COALESCE(MAX(accumulated_depreciation), 0)
INTO running_accumulated
FROM depreciation_entries
WHERE asset_id = asset.id;

month_cursor := date_trunc('month', asset.depreciation_start_date)::date;

WHILE month_cursor < p_up_to_date AND month_cursor < asset_end_date LOOP
IF NOT EXISTS (
SELECT 1 FROM depreciation_entries
WHERE asset_id = asset.id AND entry_date = month_cursor
) THEN
running_accumulated := running_accumulated + monthly_amount;
running_book_value := GREATEST(asset.purchase_cost - running_accumulated, asset.salvage_value);

INSERT INTO depreciation_entries (asset_id, entry_date, amount, accumulated_depreciation, book_value, is_auto)
VALUES (asset.id, month_cursor, monthly_amount, running_accumulated, running_book_value, true);

entries_created := entries_created + 1;
ELSE
SELECT accumulated_depreciation INTO running_accumulated
FROM depreciation_entries
WHERE asset_id = asset.id AND entry_date = month_cursor;
END IF;

month_cursor := (month_cursor + interval '1 month')::date;
END LOOP;
END LOOP;

RETURN entries_created;
END;
$function$;
