/*
  # Move SECURITY DEFINER functions to internal schema - Batch 2

  1. Functions moved (9):
    - `add_custody_settlement_atomic`
    - `approve_payroll_run`
    - `assign_branch_to_user`
    - `cancel_draft_payroll_run`
    - `create_employee_custody_atomic`
    - `fn_close_accounting_period`
    - `fn_distribute_monthly_profit`
    - `fn_record_partner_withdrawal`
    - `fn_renew_iqama`

  2. Same pattern as batch 1:
    - DEFINER in internal schema
    - INVOKER wrapper in public schema
*/

------------------------------------------------------------
-- 1. add_custody_settlement_atomic
------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.add_custody_settlement_atomic(
  p_custody_id uuid, p_settlement_type text, p_amount numeric,
  p_account_code text DEFAULT NULL, p_description text DEFAULT NULL,
  p_description_ar text DEFAULT NULL, p_settlement_date date DEFAULT CURRENT_DATE,
  p_reference_type text DEFAULT 'manual', p_reference_id uuid DEFAULT NULL
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
v_custody RECORD;
v_settlement_id UUID;
v_je_id UUID;
v_je_number TEXT;
v_user_id UUID;
v_debit_account TEXT;
v_debit_account_id UUID;
v_custody_account_id UUID;
BEGIN
v_user_id := auth.uid();
IF v_user_id IS NULL THEN
  v_user_id := (SELECT id FROM users WHERE role = 'super_admin' LIMIT 1);
END IF;

SELECT c.*, e.full_name AS emp_name
INTO v_custody
FROM employee_custodies c
JOIN employees e ON e.id = c.employee_id
WHERE c.id = p_custody_id AND NOT c.is_voided;

IF v_custody.id IS NULL THEN
  RETURN json_build_object('success', false, 'message', 'Custody not found or voided');
END IF;

IF v_custody.status = 'settled' THEN
  RETURN json_build_object('success', false, 'message', 'Custody already settled');
END IF;

IF p_amount > v_custody.remaining_balance THEN
  RETURN json_build_object('success', false, 'message', 'Amount exceeds remaining balance');
END IF;

IF p_settlement_type = 'cash_return' THEN
  v_debit_account := '1111';
ELSIF p_settlement_type = 'expense' THEN
  v_debit_account := COALESCE(p_account_code, '6300');
ELSIF p_settlement_type = 'purchase' THEN
  v_debit_account := COALESCE(p_account_code, '1131');
ELSIF p_settlement_type = 'asset' THEN
  v_debit_account := COALESCE(p_account_code, '1213');
ELSE
  RETURN json_build_object('success', false, 'message', 'Invalid settlement type');
END IF;

SELECT id INTO v_debit_account_id FROM accounts WHERE code = v_debit_account;
SELECT id INTO v_custody_account_id FROM accounts WHERE code = '1140';

IF v_debit_account_id IS NULL OR v_custody_account_id IS NULL THEN
  RETURN json_build_object('success', false, 'message', 'Required accounts not found');
END IF;

SELECT 'JE-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' ||
  LPAD((COALESCE(MAX(CAST(SUBSTRING(entry_number FROM 'JE-\d{4}-(\d+)') AS INTEGER)), 0) + 1)::TEXT, 4, '0')
INTO v_je_number
FROM journal_entries
WHERE entry_number LIKE 'JE-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-%';

INSERT INTO journal_entries (entry_number, date, description, status, branch_id, created_by)
VALUES (v_je_number, p_settlement_date,
  COALESCE(p_description, 'Custody settlement - ' || v_custody.emp_name),
  'Draft', v_custody.branch_id, v_user_id)
RETURNING id INTO v_je_id;

INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, base_debit, base_credit, description, line_number)
VALUES (v_je_id, v_debit_account_id, p_amount, 0, p_amount, 0, p_description, 1);

INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, base_debit, base_credit, description, line_number)
VALUES (v_je_id, v_custody_account_id, 0, p_amount, 0, p_amount, 'Settlement from employee custody', 2);

UPDATE journal_entries SET status = 'Posted', posted_at = now(), posted_by = v_user_id WHERE id = v_je_id;

INSERT INTO custody_settlements (
  custody_id, branch_id, settlement_date, settlement_type, account_code,
  amount, description, description_ar, reference_type, reference_id, journal_entry_id, created_by
) VALUES (
  p_custody_id, v_custody.branch_id, p_settlement_date, p_settlement_type, v_debit_account,
  p_amount, p_description, p_description_ar, p_reference_type, p_reference_id, v_je_id, v_user_id
)
RETURNING id INTO v_settlement_id;

RETURN json_build_object(
  'success', true,
  'settlement_id', v_settlement_id,
  'journal_entry_id', v_je_id,
  'new_remaining', v_custody.remaining_balance - p_amount
);
END;
$fn$;

GRANT EXECUTE ON FUNCTION internal.add_custody_settlement_atomic(uuid,text,numeric,text,text,text,date,text,uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.add_custody_settlement_atomic(uuid,text,numeric,text,text,text,date,text,uuid);

CREATE OR REPLACE FUNCTION public.add_custody_settlement_atomic(
  p_custody_id uuid, p_settlement_type text, p_amount numeric,
  p_account_code text DEFAULT NULL, p_description text DEFAULT NULL,
  p_description_ar text DEFAULT NULL, p_settlement_date date DEFAULT CURRENT_DATE,
  p_reference_type text DEFAULT 'manual', p_reference_id uuid DEFAULT NULL
)
 RETURNS json
 LANGUAGE sql
 SECURITY INVOKER
AS $$
SELECT internal.add_custody_settlement_atomic(p_custody_id, p_settlement_type, p_amount, p_account_code, p_description, p_description_ar, p_settlement_date, p_reference_type, p_reference_id);
$$;

GRANT EXECUTE ON FUNCTION public.add_custody_settlement_atomic(uuid,text,numeric,text,text,text,date,text,uuid) TO authenticated;

------------------------------------------------------------
-- 2. approve_payroll_run
------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.approve_payroll_run(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
v_caller_id   uuid;
v_caller_role text;
v_run         record;
BEGIN
v_caller_id := auth.uid();
SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;
IF v_caller_role NOT IN ('admin','super_admin','accountant') THEN
  RAISE EXCEPTION 'Insufficient permissions';
END IF;

SELECT * INTO v_run FROM payroll_runs WHERE id = p_run_id;
IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run not found: %', p_run_id; END IF;
IF v_run.status <> 'draft' THEN
  RAISE EXCEPTION 'Payroll run is not in draft status (current: %)', v_run.status;
END IF;

UPDATE payroll_runs SET
  status      = 'approved',
  approved_by = v_caller_id,
  approved_at = now(),
  updated_at  = now()
WHERE id = p_run_id;

RETURN jsonb_build_object('success', true, 'run_id', p_run_id, 'status', 'approved');
END;
$fn$;

GRANT EXECUTE ON FUNCTION internal.approve_payroll_run(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.approve_payroll_run(uuid);

CREATE OR REPLACE FUNCTION public.approve_payroll_run(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY INVOKER
AS $$
SELECT internal.approve_payroll_run(p_run_id);
$$;

GRANT EXECUTE ON FUNCTION public.approve_payroll_run(uuid) TO authenticated;

------------------------------------------------------------
-- 3. assign_branch_to_user
------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.assign_branch_to_user(p_user_id uuid, p_branch_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM users WHERE id = auth.uid();
  IF v_caller_role NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Only super_admin or admin can assign branches';
  END IF;
  UPDATE users SET branch_id = p_branch_id WHERE id = p_user_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION internal.assign_branch_to_user(uuid, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.assign_branch_to_user(uuid, uuid);

CREATE OR REPLACE FUNCTION public.assign_branch_to_user(p_user_id uuid, p_branch_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY INVOKER
AS $$
BEGIN
  PERFORM internal.assign_branch_to_user(p_user_id, p_branch_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_branch_to_user(uuid, uuid) TO authenticated;

------------------------------------------------------------
-- 4. cancel_draft_payroll_run
------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.cancel_draft_payroll_run(p_run_id uuid, p_reason text DEFAULT '')
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
v_status      text;
v_caller_role text;
v_run_number  text;
v_month       int;
v_year        int;
BEGIN
SELECT role INTO v_caller_role FROM users WHERE id = auth.uid();
IF v_caller_role NOT IN ('admin', 'super_admin', 'accountant') THEN
  RAISE EXCEPTION 'Permission denied';
END IF;

SELECT status, run_number, period_month, period_year
INTO v_status, v_run_number, v_month, v_year
FROM payroll_runs WHERE id = p_run_id;

IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run not found'; END IF;
IF v_status <> 'draft' THEN
  RAISE EXCEPTION 'Only draft payroll runs can be cancelled. Current status: %', v_status;
END IF;

UPDATE payroll_items SET is_cancelled = true WHERE payroll_run_id = p_run_id;
UPDATE payroll_runs SET status = 'cancelled', updated_at = now() WHERE id = p_run_id;

INSERT INTO audit_logs (user_id, action, table_name, record_id, metadata)
VALUES (
  auth.uid(), 'PAYROLL_CANCELLED', 'payroll_runs', p_run_id,
  jsonb_build_object(
    'run_number', v_run_number,
    'period', v_month || '/' || v_year,
    'reason', COALESCE(p_reason, ''),
    'cancelled_at', now()::text
  )
);
END;
$fn$;

GRANT EXECUTE ON FUNCTION internal.cancel_draft_payroll_run(uuid, text) TO authenticated;

DROP FUNCTION IF EXISTS public.cancel_draft_payroll_run(uuid, text);

CREATE OR REPLACE FUNCTION public.cancel_draft_payroll_run(p_run_id uuid, p_reason text DEFAULT '')
 RETURNS void
 LANGUAGE plpgsql
 SECURITY INVOKER
AS $$
BEGIN
  PERFORM internal.cancel_draft_payroll_run(p_run_id, p_reason);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_draft_payroll_run(uuid, text) TO authenticated;

------------------------------------------------------------
-- 5. create_employee_custody_atomic
------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.create_employee_custody_atomic(
  p_employee_id uuid, p_branch_id uuid, p_amount numeric, p_funding_source text,
  p_partner_id uuid DEFAULT NULL, p_payment_method text DEFAULT 'cash',
  p_description text DEFAULT NULL, p_description_ar text DEFAULT NULL,
  p_custody_date date DEFAULT CURRENT_DATE
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
v_custody_id UUID;
v_custody_number TEXT;
v_je_id UUID;
v_je_number TEXT;
v_user_id UUID;
v_credit_account TEXT;
v_emp_name TEXT;
v_custody_account_id UUID;
v_credit_account_id UUID;
BEGIN
v_user_id := auth.uid();
IF v_user_id IS NULL THEN
  v_user_id := (SELECT id FROM users WHERE role = 'super_admin' LIMIT 1);
END IF;

SELECT full_name INTO v_emp_name FROM employees WHERE id = p_employee_id;
IF v_emp_name IS NULL THEN
  RETURN json_build_object('success', false, 'message', 'Employee not found');
END IF;

IF p_funding_source = 'cash' THEN
  v_credit_account := '1111';
ELSIF p_funding_source = 'bank' THEN
  v_credit_account := '1112';
ELSIF p_funding_source = 'partner' THEN
  v_credit_account := '3110';
ELSE
  RETURN json_build_object('success', false, 'message', 'Invalid funding source');
END IF;

SELECT id INTO v_custody_account_id FROM accounts WHERE code = '1140';
SELECT id INTO v_credit_account_id FROM accounts WHERE code = v_credit_account;

IF v_custody_account_id IS NULL OR v_credit_account_id IS NULL THEN
  RETURN json_build_object('success', false, 'message', 'Required accounts not found');
END IF;

SELECT 'JE-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' ||
  LPAD((COALESCE(MAX(CAST(SUBSTRING(entry_number FROM 'JE-\d{4}-(\d+)') AS INTEGER)), 0) + 1)::TEXT, 4, '0')
INTO v_je_number
FROM journal_entries
WHERE entry_number LIKE 'JE-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-%';

INSERT INTO journal_entries (entry_number, date, description, status, branch_id, created_by)
VALUES (v_je_number, p_custody_date,
  COALESCE(p_description, 'Employee custody advance for ' || v_emp_name),
  'Draft', p_branch_id, v_user_id)
RETURNING id INTO v_je_id;

INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, base_debit, base_credit, description, line_number)
VALUES (v_je_id, v_custody_account_id, p_amount, 0, p_amount, 0, 'Employee custody - ' || v_emp_name, 1);

INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, base_debit, base_credit, description, line_number)
VALUES (v_je_id, v_credit_account_id, 0, p_amount, 0, p_amount, 'Funding source', 2);

UPDATE journal_entries SET status = 'Posted', posted_at = now(), posted_by = v_user_id WHERE id = v_je_id;

INSERT INTO employee_custodies (
  employee_id, branch_id, custody_date, amount, funding_source, partner_id,
  payment_method, description, description_ar, journal_entry_id, created_by
) VALUES (
  p_employee_id, p_branch_id, p_custody_date, p_amount, p_funding_source, p_partner_id,
  p_payment_method, p_description, p_description_ar, v_je_id, v_user_id
)
RETURNING id, custody_number INTO v_custody_id, v_custody_number;

RETURN json_build_object(
  'success', true,
  'custody_id', v_custody_id,
  'custody_number', v_custody_number,
  'journal_entry_id', v_je_id
);
END;
$fn$;

GRANT EXECUTE ON FUNCTION internal.create_employee_custody_atomic(uuid,uuid,numeric,text,uuid,text,text,text,date) TO authenticated;

DROP FUNCTION IF EXISTS public.create_employee_custody_atomic(uuid,uuid,numeric,text,uuid,text,text,text,date);

CREATE OR REPLACE FUNCTION public.create_employee_custody_atomic(
  p_employee_id uuid, p_branch_id uuid, p_amount numeric, p_funding_source text,
  p_partner_id uuid DEFAULT NULL, p_payment_method text DEFAULT 'cash',
  p_description text DEFAULT NULL, p_description_ar text DEFAULT NULL,
  p_custody_date date DEFAULT CURRENT_DATE
)
 RETURNS json
 LANGUAGE sql
 SECURITY INVOKER
AS $$
SELECT internal.create_employee_custody_atomic(p_employee_id, p_branch_id, p_amount, p_funding_source, p_partner_id, p_payment_method, p_description, p_description_ar, p_custody_date);
$$;

GRANT EXECUTE ON FUNCTION public.create_employee_custody_atomic(uuid,uuid,numeric,text,uuid,text,text,text,date) TO authenticated;

------------------------------------------------------------
-- 6. fn_close_accounting_period
------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.fn_close_accounting_period(p_period_id uuid, p_reason text DEFAULT 'Monthly close')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
v_period RECORD;
v_caller_id UUID;
v_caller_role TEXT;
v_unposted_count INT;
BEGIN
v_caller_id := auth.uid();
SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;

IF v_caller_role NOT IN ('admin', 'super_admin') THEN
  RAISE EXCEPTION 'ACCESS_DENIED: Only administrators can close accounting periods';
END IF;

SELECT * INTO v_period FROM accounting_periods WHERE id = p_period_id;
IF NOT FOUND THEN
  RAISE EXCEPTION 'PERIOD_NOT_FOUND: Accounting period does not exist';
END IF;

IF v_period.is_closed = true OR v_period.status = 'Closed' THEN
  RAISE EXCEPTION 'ALREADY_CLOSED: Period "%" is already closed', v_period.name;
END IF;

SELECT COUNT(*) INTO v_unposted_count
FROM journal_entries
WHERE date BETWEEN v_period.start_date AND v_period.end_date
AND status != 'Posted';

IF v_unposted_count > 0 THEN
  RAISE EXCEPTION 'UNPOSTED_ENTRIES: Cannot close period - % unposted journal entries exist', v_unposted_count;
END IF;

UPDATE accounting_periods
SET is_closed = true,
    status = 'Closed',
    closed_at = NOW(),
    closed_by = v_caller_id,
    updated_at = NOW()
WHERE id = p_period_id;

INSERT INTO audit_logs (action, table_name, record_id, user_id, metadata)
VALUES (
  'PERIOD_CLOSED', 'accounting_periods', p_period_id, v_caller_id,
  jsonb_build_object(
    'period_name', v_period.name,
    'start_date', v_period.start_date,
    'end_date', v_period.end_date,
    'reason', p_reason,
    'closed_at', NOW()
  )
);

RETURN jsonb_build_object('success', true, 'period_name', v_period.name, 'closed_at', NOW());
END;
$fn$;

GRANT EXECUTE ON FUNCTION internal.fn_close_accounting_period(uuid, text) TO authenticated;

DROP FUNCTION IF EXISTS public.fn_close_accounting_period(uuid, text);

CREATE OR REPLACE FUNCTION public.fn_close_accounting_period(p_period_id uuid, p_reason text DEFAULT 'Monthly close')
 RETURNS jsonb
 LANGUAGE sql
 SECURITY INVOKER
AS $$
SELECT internal.fn_close_accounting_period(p_period_id, p_reason);
$$;

GRANT EXECUTE ON FUNCTION public.fn_close_accounting_period(uuid, text) TO authenticated;

------------------------------------------------------------
-- 7. fn_distribute_monthly_profit
------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.fn_distribute_monthly_profit(p_period_month integer, p_period_year integer, p_branch_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
v_partner RECORD;
v_net_profit numeric;
v_entry_number text;
v_journal_id uuid;
v_line_num int := 1;
v_total_distributed numeric := 0;
v_period_start date;
v_period_end date;
v_dist_count int := 0;
BEGIN
IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin') THEN
  RETURN jsonb_build_object('success', false, 'message', 'Admin access required');
END IF;

v_period_start := make_date(p_period_year, p_period_month, 1);
v_period_end := (v_period_start + INTERVAL '1 month - 1 day')::date;

SELECT COALESCE(SUM(
  CASE WHEN jl.debit > 0 AND ac.account_type = 'revenue' THEN jl.credit - jl.debit
       WHEN jl.credit > 0 AND ac.account_type = 'expense' THEN -(jl.credit - jl.debit)
       ELSE 0 END
), 0)
INTO v_net_profit
FROM journal_lines jl
JOIN journal_entries je ON jl.journal_entry_id = je.id
JOIN chart_of_accounts ac ON jl.account_code = ac.account_code
WHERE je.status = 'posted'
AND je.entry_date BETWEEN v_period_start AND v_period_end
AND (p_branch_id IS NULL OR je.branch_id = p_branch_id)
AND ac.account_type IN ('revenue', 'expense');

IF v_net_profit <= 0 THEN
  RETURN jsonb_build_object('success', false, 'message', 'No distributable profit for this period. Net: ' || v_net_profit);
END IF;

IF EXISTS (
  SELECT 1 FROM profit_distributions
  WHERE period_month = p_period_month AND period_year = p_period_year
  AND status != 'voided'
  AND (p_branch_id IS NULL OR branch_id = p_branch_id)
) THEN
  RETURN jsonb_build_object('success', false, 'message', 'Profit already distributed for this period');
END IF;

SELECT 'PDIST-' || to_char(now(), 'YYYYMM') || '-' || LPAD(COALESCE(
  (SELECT COUNT(*) + 1 FROM journal_entries WHERE entry_number LIKE 'PDIST-%')::text, '1'), 4, '0')
INTO v_entry_number;

INSERT INTO journal_entries (
  entry_number, entry_date, reference, description, status, branch_id, created_by
) VALUES (
  v_entry_number, v_period_end, 'PROFIT_DIST',
  'Monthly Profit Distribution - ' || to_char(v_period_start, 'Month YYYY'),
  'draft', p_branch_id, auth.uid()
) RETURNING id INTO v_journal_id;

INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit, line_number)
VALUES (
  v_journal_id, '3200',
  'Dr Retained Earnings - ' || to_char(v_period_start, 'Month YYYY'),
  v_net_profit, 0, v_line_num
);
v_line_num := v_line_num + 1;

FOR v_partner IN
  SELECT id, name, name_ar, profit_share_percentage
  FROM partners
  WHERE is_active = true AND profit_share_percentage > 0
  ORDER BY name
LOOP
  DECLARE
    v_amount numeric := ROUND((v_net_profit * v_partner.profit_share_percentage / 100), 2);
  BEGIN
    INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit, line_number)
    VALUES (
      v_journal_id, '3110',
      'Cr Partner Current Account - ' || v_partner.name || ' (' || v_partner.profit_share_percentage || '%)',
      0, v_amount, v_line_num
    );
    v_line_num := v_line_num + 1;

    INSERT INTO profit_distributions (
      partner_id, period_month, period_year, net_profit_base,
      share_percentage, amount_distributed, journal_entry_id, status,
      created_by, branch_id
    ) VALUES (
      v_partner.id, p_period_month, p_period_year, v_net_profit,
      v_partner.profit_share_percentage, v_amount, v_journal_id, 'posted',
      auth.uid(), p_branch_id
    )
    ON CONFLICT (partner_id, period_month, period_year) DO NOTHING;

    v_total_distributed := v_total_distributed + v_amount;
    v_dist_count := v_dist_count + 1;
  END;
END LOOP;

UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;

RETURN jsonb_build_object(
  'success', true,
  'journal_entry_id', v_journal_id,
  'entry_number', v_entry_number,
  'net_profit', v_net_profit,
  'total_distributed', v_total_distributed,
  'partners_count', v_dist_count
);
END;
$fn$;

GRANT EXECUTE ON FUNCTION internal.fn_distribute_monthly_profit(integer, integer, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.fn_distribute_monthly_profit(integer, integer, uuid);

CREATE OR REPLACE FUNCTION public.fn_distribute_monthly_profit(p_period_month integer, p_period_year integer, p_branch_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY INVOKER
AS $$
SELECT internal.fn_distribute_monthly_profit(p_period_month, p_period_year, p_branch_id);
$$;

GRANT EXECUTE ON FUNCTION public.fn_distribute_monthly_profit(integer, integer, uuid) TO authenticated;

------------------------------------------------------------
-- 8. fn_record_partner_withdrawal
------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.fn_record_partner_withdrawal(
  p_partner_id uuid, p_amount numeric, p_method text,
  p_description text, p_description_ar text,
  p_withdrawal_date date, p_branch_id uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
v_entry_number text;
v_journal_id uuid;
v_partner_name text;
v_withdrawal_id uuid;
v_cash_account text;
v_partner_account text := '3110';
BEGIN
IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin') THEN
  RETURN jsonb_build_object('success', false, 'message', 'Admin access required');
END IF;

SELECT name INTO v_partner_name FROM partners WHERE id = p_partner_id;
IF NOT FOUND THEN
  RETURN jsonb_build_object('success', false, 'message', 'Partner not found');
END IF;

v_cash_account := CASE WHEN p_method = 'bank' THEN '1121' ELSE '1110' END;

SELECT 'WD-' || to_char(now(), 'YYYYMMDD') || '-' || LPAD(COALESCE(
  (SELECT COUNT(*) + 1 FROM journal_entries WHERE entry_number LIKE 'WD-%' AND created_at::date = CURRENT_DATE)::text, '1'), 4, '0')
INTO v_entry_number;

INSERT INTO journal_entries (
  entry_number, entry_date, reference, description, status, branch_id, created_by
) VALUES (
  v_entry_number, p_withdrawal_date, 'WITHDRAWAL',
  'Partner Withdrawal: ' || v_partner_name || ' - ' || p_description,
  'posted', p_branch_id, auth.uid()
) RETURNING id INTO v_journal_id;

INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit, line_number)
VALUES
  (v_journal_id, v_partner_account, 'Dr Partner Current Account - ' || v_partner_name, p_amount, 0, 1),
  (v_journal_id, v_cash_account, 'Cr ' || CASE WHEN p_method = 'bank' THEN 'Bank' ELSE 'Cash' END || ' - ' || v_partner_name, 0, p_amount, 2);

INSERT INTO partner_withdrawals (
  partner_id, amount, method, description, description_ar,
  withdrawal_date, journal_entry_id, created_by, branch_id
) VALUES (
  p_partner_id, p_amount, p_method, p_description,
  COALESCE(p_description_ar, p_description),
  p_withdrawal_date, v_journal_id, auth.uid(), p_branch_id
) RETURNING id INTO v_withdrawal_id;

RETURN jsonb_build_object(
  'success', true,
  'withdrawal_id', v_withdrawal_id,
  'journal_entry_id', v_journal_id,
  'entry_number', v_entry_number
);
END;
$fn$;

GRANT EXECUTE ON FUNCTION internal.fn_record_partner_withdrawal(uuid,numeric,text,text,text,date,uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.fn_record_partner_withdrawal(uuid,numeric,text,text,text,date,uuid);

CREATE OR REPLACE FUNCTION public.fn_record_partner_withdrawal(
  p_partner_id uuid, p_amount numeric, p_method text,
  p_description text, p_description_ar text,
  p_withdrawal_date date, p_branch_id uuid
)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY INVOKER
AS $$
SELECT internal.fn_record_partner_withdrawal(p_partner_id, p_amount, p_method, p_description, p_description_ar, p_withdrawal_date, p_branch_id);
$$;

GRANT EXECUTE ON FUNCTION public.fn_record_partner_withdrawal(uuid,numeric,text,text,text,date,uuid) TO authenticated;

------------------------------------------------------------
-- 9. fn_renew_iqama
------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.fn_renew_iqama(p_employee_id uuid, p_duration_months integer DEFAULT NULL, p_custom_date date DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
v_employee RECORD;
v_user_role TEXT;
v_user_id UUID;
v_old_expiry DATE;
v_new_expiry DATE;
v_days_remaining INTEGER;
BEGIN
v_user_id := auth.uid();
IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

SELECT role INTO v_user_role FROM users WHERE id = v_user_id;
IF v_user_role NOT IN ('super_admin', 'admin') THEN
  RAISE EXCEPTION 'Insufficient permissions: only super_admin or admin can renew iqama';
END IF;

SELECT id, full_name, full_name_ar, iqama_number, iqama_expiry_date, branch_id
INTO v_employee FROM employees WHERE id = p_employee_id;
IF NOT FOUND THEN RAISE EXCEPTION 'Employee not found'; END IF;

v_old_expiry := v_employee.iqama_expiry_date;

IF p_custom_date IS NOT NULL THEN
  v_new_expiry := p_custom_date;
ELSIF p_duration_months IS NOT NULL AND p_duration_months > 0 THEN
  IF v_old_expiry IS NOT NULL THEN
    v_new_expiry := v_old_expiry + (p_duration_months || ' months')::INTERVAL;
  ELSE
    v_new_expiry := CURRENT_DATE + (p_duration_months || ' months')::INTERVAL;
  END IF;
ELSE
  RAISE EXCEPTION 'Either duration_months or custom_date must be provided';
END IF;

IF v_new_expiry <= CURRENT_DATE THEN
  RAISE EXCEPTION 'New expiry date must be in the future';
END IF;

UPDATE employees
SET iqama_expiry_date = v_new_expiry,
    iqama_notes = COALESCE(iqama_notes, '') ||
      CASE WHEN COALESCE(iqama_notes, '') = '' THEN '' ELSE E'\n' END ||
      '[' || TO_CHAR(now(), 'YYYY-MM-DD HH24:MI') || '] ' ||
      CASE WHEN p_duration_months IS NOT NULL
        THEN 'Renewed +' || p_duration_months || 'mo'
        ELSE 'Renewed to ' || TO_CHAR(v_new_expiry, 'YYYY-MM-DD')
      END ||
      ' (from ' || COALESCE(TO_CHAR(v_old_expiry, 'YYYY-MM-DD'), 'N/A') || ')',
    updated_at = now()
WHERE id = p_employee_id;

v_days_remaining := v_new_expiry - CURRENT_DATE;

INSERT INTO audit_logs (id, user_id, action, table_name, record_id, metadata, created_at)
VALUES (
  gen_random_uuid(), v_user_id, 'IQAMA_RENEWAL', 'employees', p_employee_id,
  jsonb_build_object(
    'employee_name', v_employee.full_name,
    'employee_name_ar', v_employee.full_name_ar,
    'iqama_number', v_employee.iqama_number,
    'old_expiry_date', v_old_expiry,
    'new_expiry_date', v_new_expiry,
    'duration_months', p_duration_months,
    'custom_date', p_custom_date,
    'days_remaining', v_days_remaining,
    'branch_id', v_employee.branch_id,
    'renewed_at', now()
  ),
  now()
);

RETURN jsonb_build_object(
  'success', true,
  'employee_id', p_employee_id,
  'employee_name', v_employee.full_name,
  'old_expiry_date', v_old_expiry,
  'new_expiry_date', v_new_expiry,
  'days_remaining', v_days_remaining,
  'message', 'Iqama renewed successfully'
);
END;
$fn$;

GRANT EXECUTE ON FUNCTION internal.fn_renew_iqama(uuid, integer, date) TO authenticated;

DROP FUNCTION IF EXISTS public.fn_renew_iqama(uuid, integer, date);

CREATE OR REPLACE FUNCTION public.fn_renew_iqama(p_employee_id uuid, p_duration_months integer DEFAULT NULL, p_custom_date date DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY INVOKER
AS $$
SELECT internal.fn_renew_iqama(p_employee_id, p_duration_months, p_custom_date);
$$;

GRANT EXECUTE ON FUNCTION public.fn_renew_iqama(uuid, integer, date) TO authenticated;
