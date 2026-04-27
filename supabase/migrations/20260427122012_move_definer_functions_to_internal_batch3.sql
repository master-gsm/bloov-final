/*
  # Move SECURITY DEFINER functions to internal schema - Batch 3

  1. Functions moved (9):
    - `fn_super_admin_update_setup_expense`
    - `create_sale_atomic`
    - `generate_depreciation_entries`
    - `generate_payroll_run`
    - `pay_payroll_run`
    - `perform_atomic_restore`
    - `process_purchase_receipt_atomic`
    - `update_purchase_status`
    - `update_sale_status`

  2. Same pattern as batch 1 and 2:
    - DEFINER in internal schema
    - INVOKER wrapper in public schema

  3. Cross-references:
    - `update_sale_status` calls `public.void_sale()` (now an INVOKER wrapper -> internal.void_sale)
    - `update_purchase_status` calls `public.void_purchase()` (remains in public, already secured)
    - `process_purchase_receipt_atomic` calls `fn_can_bypass_period_lock()` (already secured)
*/

------------------------------------------------------------
-- 1. fn_super_admin_update_setup_expense
------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.fn_super_admin_update_setup_expense(
  p_expense_id uuid, p_amount numeric DEFAULT NULL, p_expense_date date DEFAULT NULL,
  p_category text DEFAULT NULL, p_description text DEFAULT NULL,
  p_notes text DEFAULT NULL, p_partner_id uuid DEFAULT NULL,
  p_reason text DEFAULT 'Updated by super_admin'
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
v_caller_id UUID;
v_caller_role TEXT;
v_old_expense RECORD;
v_result JSONB;
BEGIN
v_caller_id := auth.uid();
SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;

IF v_caller_role != 'super_admin' THEN
  RAISE EXCEPTION 'ACCESS_DENIED: Only super_admin can use this function';
END IF;

SELECT * INTO v_old_expense FROM setup_expenses WHERE id = p_expense_id;
IF NOT FOUND THEN RAISE EXCEPTION 'EXPENSE_NOT_FOUND: Setup expense does not exist'; END IF;
IF v_old_expense.is_deleted = true THEN RAISE EXCEPTION 'EXPENSE_DELETED: Cannot update a deleted expense'; END IF;

UPDATE setup_expenses SET
  amount = COALESCE(p_amount, amount),
  expense_date = COALESCE(p_expense_date, expense_date),
  category = COALESCE(p_category, category),
  description = COALESCE(p_description, description),
  notes = COALESCE(p_notes, notes),
  partner_id = CASE WHEN p_partner_id IS NOT NULL THEN p_partner_id ELSE partner_id END,
  updated_at = NOW(),
  version = version + 1
WHERE id = p_expense_id;

INSERT INTO audit_logs (action, table_name, record_id, user_id, metadata)
VALUES (
  'SETUP_EXPENSE_ADMIN_UPDATE', 'setup_expenses', p_expense_id, v_caller_id,
  jsonb_build_object(
    'old_values', jsonb_build_object('amount', v_old_expense.amount, 'expense_date', v_old_expense.expense_date, 'category', v_old_expense.category, 'description', v_old_expense.description),
    'new_values', jsonb_build_object('amount', COALESCE(p_amount, v_old_expense.amount), 'expense_date', COALESCE(p_expense_date, v_old_expense.expense_date), 'category', COALESCE(p_category, v_old_expense.category), 'description', COALESCE(p_description, v_old_expense.description)),
    'reason', p_reason,
    'updated_at', NOW()
  )
);

SELECT jsonb_build_object('success', true, 'expense_id', p_expense_id, 'message', 'Setup expense updated successfully') INTO v_result;
RETURN v_result;
END;
$fn$;

GRANT EXECUTE ON FUNCTION internal.fn_super_admin_update_setup_expense(uuid,numeric,date,text,text,text,uuid,text) TO authenticated;

DROP FUNCTION IF EXISTS public.fn_super_admin_update_setup_expense(uuid,numeric,date,text,text,text,uuid,text);

CREATE OR REPLACE FUNCTION public.fn_super_admin_update_setup_expense(
  p_expense_id uuid, p_amount numeric DEFAULT NULL, p_expense_date date DEFAULT NULL,
  p_category text DEFAULT NULL, p_description text DEFAULT NULL,
  p_notes text DEFAULT NULL, p_partner_id uuid DEFAULT NULL,
  p_reason text DEFAULT 'Updated by super_admin'
)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY INVOKER
AS $$
SELECT internal.fn_super_admin_update_setup_expense(p_expense_id, p_amount, p_expense_date, p_category, p_description, p_notes, p_partner_id, p_reason);
$$;

GRANT EXECUTE ON FUNCTION public.fn_super_admin_update_setup_expense(uuid,numeric,date,text,text,text,uuid,text) TO authenticated;

------------------------------------------------------------
-- 2. create_sale_atomic
------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.create_sale_atomic(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
v_sale_id         uuid;
v_sale_number     text;
v_branch_id       uuid;
v_created_by      uuid;
v_payment_method  text;
v_items           jsonb;
v_item            jsonb;
v_product_id      uuid;
v_qty             numeric;
v_stock_qty       numeric;
v_total_cost      numeric := 0;
v_gross_profit    numeric := 0;
v_profit_margin   numeric := 0;
v_subtotal        numeric;
v_tax             numeric;
v_discount        numeric;
v_total           numeric;
v_delivery_charge numeric;
v_sale_date       timestamptz;
v_cash_account_id    uuid;
v_ar_account_id      uuid;
v_revenue_account_id uuid;
v_cogs_account_id    uuid;
v_inv_account_id     uuid;
v_vat_account_id     uuid;
v_je_id              uuid;
v_je_number          text;
v_debit_account_id   uuid;
v_shift_id           uuid;
v_salesperson_id     uuid;
v_emp_commission_rate numeric;
v_idempotency_key    text;
v_existing_sale_id   uuid;
v_unit_price         numeric;
v_item_discount      numeric;
v_item_total         numeric;
v_purchase_price     numeric;
v_item_cost          numeric;
v_is_service         boolean;
v_line_num           int;
BEGIN
v_sale_id        := COALESCE((p_payload->>'id')::uuid, gen_random_uuid());
v_branch_id      := (p_payload->>'branch_id')::uuid;
v_created_by     := (p_payload->>'created_by')::uuid;
v_payment_method := COALESCE(p_payload->>'payment_method', 'cash');
v_items          := p_payload->'items';
v_subtotal       := COALESCE((p_payload->>'subtotal')::numeric, 0);
v_tax            := COALESCE((p_payload->>'tax')::numeric, 0);
v_discount       := COALESCE((p_payload->>'discount')::numeric, 0);
v_total          := COALESCE((p_payload->>'total')::numeric, 0);
v_delivery_charge:= COALESCE((p_payload->>'delivery_charge')::numeric, 0);
v_sale_date      := COALESCE((p_payload->>'sale_date')::timestamptz, now());
v_salesperson_id := NULLIF(p_payload->>'salesperson_id', '')::uuid;
v_idempotency_key:= NULLIF(p_payload->>'idempotency_key', '');

IF v_idempotency_key IS NOT NULL THEN
  SELECT id INTO v_existing_sale_id FROM sales WHERE idempotency_key = v_idempotency_key LIMIT 1;
  IF v_existing_sale_id IS NOT NULL THEN
    SELECT sale_number INTO v_sale_number FROM sales WHERE id = v_existing_sale_id;
    RETURN jsonb_build_object('success', true, 'sale_id', v_existing_sale_id, 'sale_number', v_sale_number, 'status', 'confirmed', 'duplicate', true);
  END IF;
END IF;

IF v_branch_id IS NULL THEN RAISE EXCEPTION 'branch_id is required'; END IF;
IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN RAISE EXCEPTION 'At least one item is required'; END IF;

PERFORM set_config('app.bypass_immutable', 'true', true);
PERFORM set_config('app.atomic_sale_in_progress', 'true', true);

FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
LOOP
  v_product_id := (v_item->>'product_id')::uuid;
  v_qty        := COALESCE((v_item->>'quantity')::numeric, 0);
  IF EXISTS (SELECT 1 FROM products WHERE id = v_product_id AND type = 'services') THEN CONTINUE; END IF;
  SELECT COALESCE(quantity_on_hand, 0) INTO v_stock_qty FROM product_costing WHERE product_id = v_product_id AND branch_id = v_branch_id;
  IF v_stock_qty IS NULL THEN v_stock_qty := 0; END IF;
  IF v_stock_qty < v_qty THEN RAISE EXCEPTION 'Insufficient stock for product % (available: %, requested: %)', v_product_id, v_stock_qty, v_qty; END IF;
END LOOP;

SELECT 'INV-' || TO_CHAR(now(), 'YYYYMMDD') || '-' ||
  LPAD((SELECT COUNT(*) + 1 FROM sales WHERE sale_date::date = now()::date AND branch_id = v_branch_id)::text, 4, '0')
INTO v_sale_number;

INSERT INTO sales (
  id, branch_id, sale_number, customer_id, customer_name, customer_phone,
  sale_date, status, subtotal, tax, discount, total,
  paid_amount, payment_status, payment_method,
  delivery_charge, delivery_address, card_message,
  notes, source, salla_shipping_cost, salla_payment_gateway_fee,
  buyer_type, company_name, company_vat_number, company_address,
  salesperson_id, created_by, created_at, updated_at, idempotency_key
) VALUES (
  v_sale_id, v_branch_id, v_sale_number,
  NULLIF(p_payload->>'customer_id', '')::uuid,
  NULLIF(p_payload->>'customer_name', ''),
  NULLIF(p_payload->>'customer_phone', ''),
  v_sale_date, 'confirmed',
  v_subtotal, v_tax, v_discount, v_total,
  CASE WHEN p_payload->>'payment_status' = 'unpaid' THEN 0 ELSE v_total END,
  COALESCE(p_payload->>'payment_status', 'paid'),
  v_payment_method,
  v_delivery_charge,
  NULLIF(p_payload->>'delivery_address', ''),
  NULLIF(p_payload->>'card_message', ''),
  NULLIF(p_payload->>'notes', ''),
  COALESCE(p_payload->>'source', 'store'),
  COALESCE((p_payload->>'salla_shipping_cost')::numeric, 0),
  COALESCE((p_payload->>'salla_payment_gateway_fee')::numeric, 0),
  COALESCE(p_payload->>'buyer_type', 'individual'),
  NULLIF(p_payload->>'company_name', ''),
  NULLIF(p_payload->>'company_vat_number', ''),
  NULLIF(p_payload->>'company_address', ''),
  v_salesperson_id, v_created_by, now(), now(), v_idempotency_key
);

FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
LOOP
  v_product_id    := (v_item->>'product_id')::uuid;
  v_qty           := COALESCE((v_item->>'quantity')::numeric, 0);
  v_unit_price    := COALESCE((v_item->>'unit_price')::numeric, 0);
  v_item_discount := COALESCE((v_item->>'discount')::numeric, 0);
  v_item_total    := COALESCE((v_item->>'item_total')::numeric, COALESCE((v_item->>'total')::numeric, 0));
  v_purchase_price := 0;
  v_is_service    := false;

  SELECT COALESCE(purchase_price, 0), type = 'services'
  INTO v_purchase_price, v_is_service FROM products WHERE id = v_product_id;

  INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, purchase_price, discount, total, created_at)
  VALUES (gen_random_uuid(), v_sale_id, v_product_id, v_qty, v_unit_price, v_purchase_price, v_item_discount, v_item_total, now());

  IF NOT v_is_service THEN
    UPDATE product_costing SET quantity_on_hand = quantity_on_hand - v_qty, updated_at = now()
    WHERE product_id = v_product_id AND branch_id = v_branch_id;

    UPDATE inventory SET quantity = quantity - v_qty, last_updated = now()
    WHERE product_id = v_product_id AND branch_id = v_branch_id;

    INSERT INTO inventory_movements (id, product_id, branch_id, movement_type, quantity, reference_id, reference_type, unit_cost, notes, created_by, created_at)
    VALUES (gen_random_uuid(), v_product_id, v_branch_id, 'out', v_qty, v_sale_id, 'sale', v_purchase_price, 'Sale: ' || v_sale_number, v_created_by, now())
    ON CONFLICT DO NOTHING;

    v_item_cost  := v_qty * v_purchase_price;
    v_total_cost := v_total_cost + v_item_cost;
  END IF;
END LOOP;

v_gross_profit := v_subtotal - v_total_cost;
IF v_subtotal > 0 THEN v_profit_margin := ROUND((v_gross_profit / v_subtotal) * 100, 2); END IF;

UPDATE sales SET total_cost = v_total_cost, gross_profit = v_gross_profit, profit_margin = v_profit_margin, updated_at = now()
WHERE id = v_sale_id;

SELECT id INTO v_cash_account_id    FROM accounts WHERE code = '1110' LIMIT 1;
SELECT id INTO v_ar_account_id      FROM accounts WHERE code = '1120' LIMIT 1;
SELECT id INTO v_revenue_account_id FROM accounts WHERE code = '4100' LIMIT 1;
SELECT id INTO v_cogs_account_id    FROM accounts WHERE code = '5100' LIMIT 1;
SELECT id INTO v_inv_account_id     FROM accounts WHERE code = '1130' LIMIT 1;
SELECT id INTO v_vat_account_id     FROM accounts WHERE code = '2130' LIMIT 1;

IF v_cash_account_id IS NOT NULL AND v_revenue_account_id IS NOT NULL THEN
  v_je_id     := gen_random_uuid();
  v_je_number := 'JE-SALE-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || SUBSTRING(v_sale_id::text, 1, 8);
  v_debit_account_id := CASE WHEN v_payment_method IN ('cash', 'card', 'bank_transfer') THEN v_cash_account_id ELSE COALESCE(v_ar_account_id, v_cash_account_id) END;

  INSERT INTO journal_entries (id, entry_number, date, description, branch_id, reference_id, reference_type, status, created_by, created_at, updated_at)
  VALUES (v_je_id, v_je_number, v_sale_date::date, 'Sale: ' || v_sale_number, v_branch_id, v_sale_id, 'sale', 'Draft', v_created_by, now(), now());

  v_line_num := 1;
  INSERT INTO journal_lines (id, journal_entry_id, account_id, line_number, debit, credit, description, created_at)
  VALUES (gen_random_uuid(), v_je_id, v_debit_account_id, v_line_num, v_total, 0, 'Cash/AR: ' || v_sale_number, now());
  v_line_num := v_line_num + 1;

  INSERT INTO journal_lines (id, journal_entry_id, account_id, line_number, debit, credit, description, created_at)
  VALUES (gen_random_uuid(), v_je_id, v_revenue_account_id, v_line_num, 0, v_subtotal, 'Revenue: ' || v_sale_number, now());
  v_line_num := v_line_num + 1;

  IF v_tax > 0 AND v_vat_account_id IS NOT NULL THEN
    INSERT INTO journal_lines (id, journal_entry_id, account_id, line_number, debit, credit, description, created_at)
    VALUES (gen_random_uuid(), v_je_id, v_vat_account_id, v_line_num, 0, v_tax, 'VAT Output: ' || v_sale_number, now());
    v_line_num := v_line_num + 1;
  END IF;

  IF v_total_cost > 0 AND v_cogs_account_id IS NOT NULL AND v_inv_account_id IS NOT NULL THEN
    INSERT INTO journal_lines (id, journal_entry_id, account_id, line_number, debit, credit, description, created_at)
    VALUES (gen_random_uuid(), v_je_id, v_cogs_account_id, v_line_num, v_total_cost, 0, 'COGS: ' || v_sale_number, now());
    v_line_num := v_line_num + 1;

    INSERT INTO journal_lines (id, journal_entry_id, account_id, line_number, debit, credit, description, created_at)
    VALUES (gen_random_uuid(), v_je_id, v_inv_account_id, v_line_num, 0, v_total_cost, 'Inv OUT: ' || v_sale_number, now());
    v_line_num := v_line_num + 1;
  END IF;

  UPDATE journal_entries SET status = 'Posted', updated_at = now() WHERE id = v_je_id;
END IF;

IF v_payment_method = 'cash' THEN
  SELECT id INTO v_shift_id FROM cash_shifts WHERE branch_id = v_branch_id AND status = 'open' ORDER BY opened_at DESC LIMIT 1;
  IF v_shift_id IS NOT NULL THEN
    INSERT INTO cash_transactions (id, shift_id, branch_id, transaction_type, amount, description, reference_id, reference_type, created_by, created_at)
    VALUES (gen_random_uuid(), v_shift_id, v_branch_id, 'sale_in', v_total, 'Sale: ' || v_sale_number, v_sale_id, 'sale', v_created_by, now());
    UPDATE cash_shifts SET expected_balance = expected_balance + v_total, updated_at = now() WHERE id = v_shift_id;
  END IF;
END IF;

IF v_salesperson_id IS NOT NULL THEN
  SELECT COALESCE(commission_rate, 0) INTO v_emp_commission_rate FROM employees WHERE id = v_salesperson_id AND is_active = true;
  IF COALESCE(v_emp_commission_rate, 0) > 0 THEN
    INSERT INTO employee_commissions (id, employee_id, branch_id, sale_id, commission_rate, commission_amount, sale_amount, is_paid, status, period_month, period_year, created_at)
    VALUES (gen_random_uuid(), v_salesperson_id, v_branch_id, v_sale_id, v_emp_commission_rate, ROUND(v_subtotal * (v_emp_commission_rate / 100), 2), v_subtotal, false, 'pending', EXTRACT(MONTH FROM now())::int, EXTRACT(YEAR FROM now())::int, now())
    ON CONFLICT DO NOTHING;
  END IF;
END IF;

IF (p_payload->>'customer_id') IS NOT NULL AND (p_payload->>'customer_id') != '' THEN
  UPDATE customers SET
    total_spent = COALESCE(total_spent, 0) + v_total,
    order_count = COALESCE(order_count, 0) + 1,
    last_order_date = v_sale_date::date,
    updated_at = now()
  WHERE id = (p_payload->>'customer_id')::uuid;
END IF;

PERFORM set_config('app.bypass_immutable', 'false', true);
PERFORM set_config('app.atomic_sale_in_progress', 'false', true);

RETURN jsonb_build_object(
  'success', true, 'sale_id', v_sale_id, 'sale_number', v_sale_number,
  'status', 'confirmed', 'total_cost', v_total_cost,
  'gross_profit', v_gross_profit, 'profit_margin', v_profit_margin, 'duplicate', false
);

EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.bypass_immutable', 'false', true);
  PERFORM set_config('app.atomic_sale_in_progress', 'false', true);
  RAISE;
END;
$fn$;

GRANT EXECUTE ON FUNCTION internal.create_sale_atomic(jsonb) TO authenticated;

DROP FUNCTION IF EXISTS public.create_sale_atomic(jsonb);

CREATE OR REPLACE FUNCTION public.create_sale_atomic(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY INVOKER
AS $$
SELECT internal.create_sale_atomic(p_payload);
$$;

GRANT EXECUTE ON FUNCTION public.create_sale_atomic(jsonb) TO authenticated;

------------------------------------------------------------
-- 3. generate_depreciation_entries
------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.generate_depreciation_entries(p_up_to_date date DEFAULT CURRENT_DATE)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
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
SELECT role INTO v_caller_role FROM users WHERE id = auth.uid() AND is_active = true;
IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'admin', 'accountant') THEN
  RAISE EXCEPTION 'Access denied: admin or accountant role required';
END IF;

FOR asset IN
  SELECT id, purchase_cost, salvage_value, useful_life_months, depreciation_start_date
  FROM fixed_assets WHERE is_deleted = false AND is_active = true AND depreciation_start_date <= p_up_to_date
LOOP
  monthly_amount := ROUND((asset.purchase_cost - asset.salvage_value) / asset.useful_life_months, 2);
  asset_end_date := asset.depreciation_start_date + (asset.useful_life_months || ' months')::interval;
  SELECT COALESCE(MAX(accumulated_depreciation), 0) INTO running_accumulated FROM depreciation_entries WHERE asset_id = asset.id;
  month_cursor := date_trunc('month', asset.depreciation_start_date)::date;

  WHILE month_cursor < p_up_to_date AND month_cursor < asset_end_date LOOP
    IF NOT EXISTS (SELECT 1 FROM depreciation_entries WHERE asset_id = asset.id AND entry_date = month_cursor) THEN
      running_accumulated := running_accumulated + monthly_amount;
      running_book_value := GREATEST(asset.purchase_cost - running_accumulated, asset.salvage_value);
      INSERT INTO depreciation_entries (asset_id, entry_date, amount, accumulated_depreciation, book_value, is_auto)
      VALUES (asset.id, month_cursor, monthly_amount, running_accumulated, running_book_value, true);
      entries_created := entries_created + 1;
    ELSE
      SELECT accumulated_depreciation INTO running_accumulated FROM depreciation_entries WHERE asset_id = asset.id AND entry_date = month_cursor;
    END IF;
    month_cursor := (month_cursor + interval '1 month')::date;
  END LOOP;
END LOOP;

RETURN entries_created;
END;
$fn$;

GRANT EXECUTE ON FUNCTION internal.generate_depreciation_entries(date) TO authenticated;

DROP FUNCTION IF EXISTS public.generate_depreciation_entries(date);

CREATE OR REPLACE FUNCTION public.generate_depreciation_entries(p_up_to_date date DEFAULT CURRENT_DATE)
 RETURNS integer
 LANGUAGE sql
 SECURITY INVOKER
AS $$
SELECT internal.generate_depreciation_entries(p_up_to_date);
$$;

GRANT EXECUTE ON FUNCTION public.generate_depreciation_entries(date) TO authenticated;

------------------------------------------------------------
-- 4. generate_payroll_run
------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.generate_payroll_run(p_branch_id uuid, p_month integer, p_year integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
v_caller_id    uuid;
v_caller_role  text;
v_run_id       uuid;
v_period_start date;
v_period_end   date;
v_run_number   text;
v_existing_status text;
v_emp          record;
v_commission   numeric;
v_loan_ded     numeric;
v_leave_ded    numeric;
v_net          numeric;
v_total_base   numeric := 0;
v_total_comm   numeric := 0;
v_total_loan   numeric := 0;
v_total_net    numeric := 0;
BEGIN
v_caller_id := auth.uid();
SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;
IF v_caller_role NOT IN ('admin','super_admin','accountant') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
IF p_month < 1 OR p_month > 12 THEN RAISE EXCEPTION 'Invalid month: %', p_month; END IF;

v_period_start := make_date(p_year, p_month, 1);
v_period_end   := (v_period_start + interval '1 month - 1 day')::date;
v_run_number := 'PAY-' || LPAD(p_year::text, 4, '0') || '-' || LPAD(p_month::text, 2, '0') || '-' || UPPER(LEFT(p_branch_id::text, 8));

SELECT status INTO v_existing_status FROM payroll_runs WHERE branch_id = p_branch_id AND period_month = p_month AND period_year = p_year LIMIT 1;

IF FOUND THEN
  IF v_existing_status = 'cancelled' THEN
    DELETE FROM payroll_items WHERE payroll_run_id = (SELECT id FROM payroll_runs WHERE branch_id = p_branch_id AND period_month = p_month AND period_year = p_year AND status = 'cancelled' LIMIT 1);
    DELETE FROM payroll_runs WHERE branch_id = p_branch_id AND period_month = p_month AND period_year = p_year AND status = 'cancelled';
  ELSE
    RAISE EXCEPTION 'A payroll run already exists for branch % month %/% with status=% — delete or cancel it first.', p_branch_id, p_month, p_year, v_existing_status;
  END IF;
END IF;

INSERT INTO payroll_runs (branch_id, period_month, period_year, status, run_number, total_base_salary, total_commissions, total_loan_deductions, net_pay, created_by)
VALUES (p_branch_id, p_month, p_year, 'draft', v_run_number, 0, 0, 0, 0, v_caller_id)
RETURNING id INTO v_run_id;

FOR v_emp IN SELECT e.id, e.basic_salary FROM employees e WHERE e.branch_id = p_branch_id AND e.is_active = true AND (e.termination_date IS NULL OR e.termination_date > v_period_end)
LOOP
  SELECT COALESCE(SUM(ec.commission_amount), 0) INTO v_commission FROM employee_commissions ec
  WHERE ec.employee_id = v_emp.id AND ec.is_paid = false AND (ec.status IS NULL OR ec.status NOT IN ('void','paid')) AND ec.created_at::date BETWEEN v_period_start AND v_period_end;

  SELECT COALESCE(LEAST(el.monthly_deduction, el.remaining_balance), 0) INTO v_loan_ded FROM employee_loans el
  WHERE el.employee_id = v_emp.id AND el.status = 'active' ORDER BY el.created_at LIMIT 1;
  IF v_loan_ded IS NULL THEN v_loan_ded := 0; END IF;

  SELECT COALESCE(SUM((el2.days / 30.0) * v_emp.basic_salary), 0) INTO v_leave_ded FROM employee_leaves el2
  WHERE el2.employee_id = v_emp.id AND el2.leave_type = 'unpaid' AND el2.status = 'approved' AND el2.payroll_deducted = false AND el2.start_date BETWEEN v_period_start AND v_period_end;
  IF v_leave_ded IS NULL THEN v_leave_ded := 0; END IF;

  v_net := v_emp.basic_salary + v_commission - v_loan_ded - v_leave_ded;
  IF v_net < 0 THEN v_net := 0; END IF;

  INSERT INTO payroll_items (payroll_run_id, employee_id, base_salary, commission_amount, loan_deduction, unpaid_leave_deduction, net_salary)
  VALUES (v_run_id, v_emp.id, v_emp.basic_salary, v_commission, v_loan_ded, v_leave_ded, v_net)
  ON CONFLICT (payroll_run_id, employee_id) DO NOTHING;

  v_total_base := v_total_base + v_emp.basic_salary;
  v_total_comm := v_total_comm + v_commission;
  v_total_loan := v_total_loan + v_loan_ded;
  v_total_net  := v_total_net  + v_net;
END LOOP;

UPDATE payroll_runs SET total_base_salary = v_total_base, total_commissions = v_total_comm, total_loan_deductions = v_total_loan, net_pay = v_total_net, updated_at = now()
WHERE id = v_run_id;

RETURN jsonb_build_object('success', true, 'run_id', v_run_id, 'run_number', v_run_number, 'total_employees', (SELECT COUNT(*) FROM payroll_items WHERE payroll_run_id = v_run_id), 'total_net', v_total_net);
END;
$fn$;

GRANT EXECUTE ON FUNCTION internal.generate_payroll_run(uuid, integer, integer) TO authenticated;

DROP FUNCTION IF EXISTS public.generate_payroll_run(uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.generate_payroll_run(p_branch_id uuid, p_month integer, p_year integer)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY INVOKER
AS $$
SELECT internal.generate_payroll_run(p_branch_id, p_month, p_year);
$$;

GRANT EXECUTE ON FUNCTION public.generate_payroll_run(uuid, integer, integer) TO authenticated;

------------------------------------------------------------
-- 5. pay_payroll_run
------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.pay_payroll_run(p_run_id uuid, p_payment_method text DEFAULT 'bank_transfer')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
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
SELECT role INTO v_caller_role FROM users WHERE id = auth.uid() AND is_active = true;
IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'admin', 'hr_manager') THEN
  RAISE EXCEPTION 'Access denied: admin or HR manager role required';
END IF;

SELECT * INTO v_run FROM payroll_runs WHERE id = p_run_id;
IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run not found: %', p_run_id; END IF;
IF v_run.status != 'approved' THEN RAISE EXCEPTION 'Payroll run must be approved before payment (current: %)', v_run.status; END IF;

IF EXISTS (SELECT 1 FROM journal_entries WHERE reference_type = 'payroll_run' AND reference_id = p_run_id AND voided_at IS NULL) THEN
  UPDATE payroll_runs SET status = 'paid', payment_method = p_payment_method, paid_at = COALESCE(paid_at, now()), updated_at = now() WHERE id = p_run_id AND status = 'approved';
  RETURN jsonb_build_object('success', true, 'note', 'GL already posted, run marked paid');
END IF;

v_expense_payment_method := CASE p_payment_method WHEN 'bank_transfer' THEN 'transfer' WHEN 'card' THEN 'card' WHEN 'cash' THEN 'cash' ELSE 'transfer' END;

PERFORM set_config('app.bypass_immutable', 'true', true);

SELECT id INTO v_cash_account_id       FROM accounts WHERE code = '1110' AND is_active = true LIMIT 1;
SELECT id INTO v_salary_account_id     FROM accounts WHERE code = '6100' AND is_active = true LIMIT 1;
SELECT id INTO v_commission_account_id FROM accounts WHERE code = '6110' AND is_active = true LIMIT 1;

SELECT COALESCE(MAX(NULLIF(regexp_replace(expense_number, '[^0-9]', '', 'g'), '')::int), 0) INTO v_expense_seq_base
FROM expenses WHERE expense_number LIKE 'EXP-' || TO_CHAR(now(), 'YYYYMMDD') || '-%';
v_expense_seq := v_expense_seq_base + 1;

FOR v_item IN SELECT * FROM payroll_items WHERE payroll_run_id = p_run_id
LOOP
  v_expense_number := 'EXP-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD(v_expense_seq::text, 4, '0');
  v_expense_seq := v_expense_seq + 1;

  IF COALESCE(v_item.net_salary, v_item.net_pay, 0) > 0 THEN
    INSERT INTO expenses (id, expense_number, category, description, description_ar, amount, expense_date, payment_method, branch_id, created_by, created_at)
    VALUES (gen_random_uuid(), v_expense_number, 'salaries',
      'Payroll: ' || TO_CHAR(make_date(v_run.period_year, v_run.period_month, 1), 'Month YYYY'),
      'رواتب: ' || TO_CHAR(make_date(v_run.period_year, v_run.period_month, 1), 'Month YYYY'),
      COALESCE(v_item.net_salary, v_item.net_pay, 0), CURRENT_DATE, v_expense_payment_method, v_run.branch_id, v_run.created_by, now());
    v_salary_total := v_salary_total + COALESCE(v_item.net_salary, v_item.net_pay, 0);
  END IF;

  IF COALESCE(v_item.commission_amount, v_item.commission_total, 0) > 0 THEN
    v_expense_number := 'EXP-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD(v_expense_seq::text, 4, '0');
    v_expense_seq := v_expense_seq + 1;
    INSERT INTO expenses (id, expense_number, category, description, description_ar, amount, expense_date, payment_method, branch_id, created_by, created_at)
    VALUES (gen_random_uuid(), v_expense_number, 'commissions',
      'Commissions: ' || TO_CHAR(make_date(v_run.period_year, v_run.period_month, 1), 'Month YYYY'),
      'عمولات: ' || TO_CHAR(make_date(v_run.period_year, v_run.period_month, 1), 'Month YYYY'),
      COALESCE(v_item.commission_amount, v_item.commission_total, 0), CURRENT_DATE, v_expense_payment_method, v_run.branch_id, v_run.created_by, now());
    v_commission_total := v_commission_total + COALESCE(v_item.commission_amount, v_item.commission_total, 0);
  END IF;

  UPDATE employee_commissions SET is_paid = true, status = 'approved', updated_at = now()
  WHERE employee_id = v_item.employee_id AND period_month = v_run.period_month AND period_year = v_run.period_year AND is_paid = false;

  IF COALESCE(v_item.loan_deduction, 0) > 0 THEN
    SELECT id INTO v_loan_id FROM employee_loans WHERE employee_id = v_item.employee_id AND status = 'active' AND branch_id = v_run.branch_id LIMIT 1;
    IF v_loan_id IS NOT NULL THEN
      UPDATE employee_loans SET remaining_balance = GREATEST(remaining_balance - v_item.loan_deduction, 0),
        status = CASE WHEN remaining_balance - v_item.loan_deduction <= 0 THEN 'completed' ELSE status END, updated_at = now()
      WHERE id = v_loan_id;
    END IF;
  END IF;

  UPDATE employee_leaves SET payroll_deducted = true, updated_at = now()
  WHERE employee_id = v_item.employee_id AND leave_type = 'unpaid' AND status = 'approved' AND payroll_deducted = false
  AND EXTRACT(MONTH FROM start_date) = v_run.period_month AND EXTRACT(YEAR FROM start_date) = v_run.period_year;
END LOOP;

v_net_total := v_salary_total + v_commission_total;

IF p_payment_method IN ('cash', 'bank_transfer') THEN
  SELECT id INTO v_shift_id FROM cash_shifts WHERE branch_id = v_run.branch_id AND status = 'open' ORDER BY opened_at DESC LIMIT 1;
  IF v_shift_id IS NOT NULL THEN
    INSERT INTO cash_transactions (id, shift_id, branch_id, transaction_type, amount, description, reference_id, reference_type, created_by, created_at)
    VALUES (gen_random_uuid(), v_shift_id, v_run.branch_id, 'expense_out', v_net_total,
      'Payroll: ' || TO_CHAR(make_date(v_run.period_year, v_run.period_month, 1), 'Month YYYY'),
      p_run_id, 'payroll_run', v_run.created_by, now());
    UPDATE cash_shifts SET expected_balance = expected_balance - v_net_total, updated_at = now() WHERE id = v_shift_id;
  END IF;
END IF;

IF v_cash_account_id IS NOT NULL AND v_net_total > 0 THEN
  v_je_id := gen_random_uuid();
  v_je_number := 'JE-PAY-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || SUBSTRING(p_run_id::text, 1, 8);

  INSERT INTO journal_entries (id, entry_number, date, description, branch_id, reference_id, reference_type, status, created_by, created_at, updated_at)
  VALUES (v_je_id, v_je_number, CURRENT_DATE, 'Payroll payment: ' || TO_CHAR(make_date(v_run.period_year, v_run.period_month, 1), 'Month YYYY'),
    v_run.branch_id, p_run_id, 'payroll_run', 'Draft', v_run.created_by, now(), now());

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

  UPDATE journal_entries SET status = 'Posted', posted_by = v_run.created_by, posted_at = now(), updated_at = now() WHERE id = v_je_id;
END IF;

UPDATE payroll_runs SET status = 'paid', payment_method = p_payment_method, paid_at = now(), approved_at = COALESCE(approved_at, now()), updated_at = now()
WHERE id = p_run_id;

PERFORM set_config('app.bypass_immutable', 'false', true);

RETURN jsonb_build_object('success', true, 'salary_total', v_salary_total, 'commission_total', v_commission_total, 'net_total', v_net_total, 'shift_registered', (v_shift_id IS NOT NULL));

EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.bypass_immutable', 'false', true);
  RAISE;
END;
$fn$;

GRANT EXECUTE ON FUNCTION internal.pay_payroll_run(uuid, text) TO authenticated;

DROP FUNCTION IF EXISTS public.pay_payroll_run(uuid, text);

CREATE OR REPLACE FUNCTION public.pay_payroll_run(p_run_id uuid, p_payment_method text DEFAULT 'bank_transfer')
 RETURNS jsonb
 LANGUAGE sql
 SECURITY INVOKER
AS $$
SELECT internal.pay_payroll_run(p_run_id, p_payment_method);
$$;

GRANT EXECUTE ON FUNCTION public.pay_payroll_run(uuid, text) TO authenticated;

------------------------------------------------------------
-- 6. perform_atomic_restore
------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.perform_atomic_restore(p_backup jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
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
IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin' AND is_active = true) THEN
  RAISE EXCEPTION 'Access denied: only super_admin can perform database restore';
END IF;

IF p_backup IS NULL OR p_backup -> 'data' IS NULL THEN
  RETURN jsonb_build_object('success', false, 'restored_tables', 0, 'restored_records', 0, 'failed_tables', '[]'::jsonb,
    'errors', jsonb_build_array(jsonb_build_object('table', 'validation', 'message', 'Backup payload is missing the "data" key', 'detail', NULL, 'hint', 'Ensure the backup file has a top-level "data" object')),
    'rolled_back', true);
END IF;

FOREACH v_table IN ARRAY v_restore_order LOOP
  v_table_data := p_backup -> 'data' -> v_table;
  IF v_table_data IS NULL OR jsonb_array_length(v_table_data) = 0 THEN CONTINUE; END IF;
  v_row_count := jsonb_array_length(v_table_data);

  BEGIN
    v_sql := format('INSERT INTO %I SELECT * FROM jsonb_populate_recordset(null::%I, $1) ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id', v_table, v_table);
    EXECUTE v_sql USING v_table_data;
    v_restored_tables  := v_restored_tables  + 1;
    v_restored_records := v_restored_records + v_row_count;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_message = MESSAGE_TEXT, v_err_detail = PG_EXCEPTION_DETAIL, v_err_hint = PG_EXCEPTION_HINT, v_err_sqlstate = RETURNED_SQLSTATE;
    v_errors := array_append(v_errors, jsonb_build_object('table', v_table, 'message', v_err_message, 'detail', v_err_detail, 'hint', v_err_hint, 'sqlstate', v_err_sqlstate, 'rows_attempted', v_row_count));
    v_failed_tables := array_append(v_failed_tables, v_table);
    RAISE EXCEPTION 'Atomic restore aborted: table "%" failed — %. Rolling back all changes.', v_table, v_err_message
      USING DETAIL = v_err_detail, HINT = 'All previously restored tables have been rolled back. No data was changed.', ERRCODE = v_err_sqlstate;
  END;
END LOOP;

RETURN jsonb_build_object('success', true, 'restored_tables', v_restored_tables, 'restored_records', v_restored_records, 'failed_tables', to_jsonb(v_failed_tables), 'errors', to_jsonb(v_errors), 'rolled_back', false);

EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_err_message = MESSAGE_TEXT, v_err_detail = PG_EXCEPTION_DETAIL;
  RETURN jsonb_build_object('success', false, 'restored_tables', 0, 'restored_records', 0, 'failed_tables', to_jsonb(v_failed_tables), 'errors', to_jsonb(v_errors), 'rolled_back', true);
END;
$fn$;

GRANT EXECUTE ON FUNCTION internal.perform_atomic_restore(jsonb) TO authenticated;

DROP FUNCTION IF EXISTS public.perform_atomic_restore(jsonb);

CREATE OR REPLACE FUNCTION public.perform_atomic_restore(p_backup jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY INVOKER
AS $$
SELECT internal.perform_atomic_restore(p_backup);
$$;

GRANT EXECUTE ON FUNCTION public.perform_atomic_restore(jsonb) TO authenticated;

------------------------------------------------------------
-- 7. process_purchase_receipt_atomic
------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.process_purchase_receipt_atomic(p_purchase_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
v_purchase        purchases%ROWTYPE;
v_item            RECORD;
v_branch_id       uuid;
v_user_id         uuid;
v_purchase_date   date;
v_old_qty         numeric := 0;
v_old_avg         numeric := 0;
v_new_avg         numeric := 0;
v_total_net       numeric := 0;
v_vat_amount      numeric := 0;
v_has_vat         boolean := false;
v_total_value     numeric := 0;
v_je_id           uuid;
v_je_number       text;
v_line_no         integer := 0;
v_inv_account_id  uuid;
v_ap_account_id   uuid;
v_cash_account_id uuid;
v_vat_account_id  uuid;
v_credit_acct_id  uuid;
v_movements_created integer := 0;
v_is_super_admin  boolean;
v_period_name     text;
BEGIN
PERFORM set_config('app.bypass_immutable', 'true', true);

SELECT * INTO v_purchase FROM purchases WHERE id = p_purchase_id;
IF NOT FOUND THEN RAISE EXCEPTION 'Purchase not found: %', p_purchase_id; END IF;

IF v_purchase.status = 'received' OR EXISTS (SELECT 1 FROM inventory_movements WHERE reference_type = 'purchase' AND reference_id = p_purchase_id) THEN
  UPDATE purchases SET status = 'received', updated_at = now() WHERE id = p_purchase_id AND status != 'received';
  PERFORM set_config('app.bypass_immutable', 'false', true);
  RETURN jsonb_build_object('success', true, 'duplicate', true, 'message', 'Purchase already processed — no changes made');
END IF;

IF v_purchase.status NOT IN ('confirmed', 'draft') THEN RAISE EXCEPTION 'Cannot receive purchase in status: %', v_purchase.status; END IF;

v_branch_id     := v_purchase.branch_id;
v_user_id       := COALESCE(auth.uid(), v_purchase.created_by);
v_purchase_date := COALESCE(v_purchase.purchase_date::date, CURRENT_DATE);
IF v_branch_id IS NULL THEN RAISE EXCEPTION 'Purchase has no branch_id'; END IF;

IF EXISTS (SELECT 1 FROM accounting_periods WHERE is_closed = true AND start_date <= v_purchase_date AND end_date >= v_purchase_date) THEN
  v_is_super_admin := fn_can_bypass_period_lock();
  IF v_is_super_admin THEN
    SELECT name INTO v_period_name FROM accounting_periods WHERE is_closed = true AND start_date <= v_purchase_date AND end_date >= v_purchase_date LIMIT 1;
    INSERT INTO audit_logs (id, user_id, action, table_name, record_id, metadata, created_at)
    VALUES (gen_random_uuid(), auth.uid(), 'CLOSED_PERIOD_BYPASS', 'purchases', p_purchase_id,
      jsonb_build_object('function', 'process_purchase_receipt_atomic', 'period_name', v_period_name, 'purchase_date', v_purchase_date, 'purchase_number', v_purchase.purchase_number, 'bypassed_at', now(), 'warning', 'Super Admin processed purchase receipt in closed period'), now());
  ELSE
    PERFORM set_config('app.bypass_immutable', 'false', true);
    RAISE EXCEPTION 'Accounting period is locked for date %', v_purchase_date;
  END IF;
END IF;

SELECT id INTO v_inv_account_id  FROM accounts WHERE code = '1132' LIMIT 1;
SELECT id INTO v_ap_account_id   FROM accounts WHERE code = '2110' LIMIT 1;
SELECT id INTO v_cash_account_id FROM accounts WHERE code = '1110' LIMIT 1;
SELECT id INTO v_vat_account_id  FROM accounts WHERE code = '2140' LIMIT 1;
IF v_inv_account_id IS NULL THEN RAISE EXCEPTION 'Account 1132 not found'; END IF;
IF v_ap_account_id  IS NULL THEN RAISE EXCEPTION 'Account 2110 not found'; END IF;

v_credit_acct_id := CASE WHEN v_purchase.payment_method = 'cash' AND v_cash_account_id IS NOT NULL THEN v_cash_account_id ELSE v_ap_account_id END;

IF COALESCE(v_purchase.vat_status_snapshot, '') = 'standard' AND COALESCE(v_purchase.vat_amount, 0) > 0 THEN
  v_has_vat := true;
  v_vat_amount := ROUND(v_purchase.vat_amount, 2);
END IF;

v_total_value := ROUND(COALESCE(v_purchase.total, 0), 2);
v_total_net   := ROUND(v_total_value - v_vat_amount, 2);

FOR v_item IN SELECT pi.product_id, pi.quantity, pi.unit_price FROM purchase_items pi JOIN products p ON p.id = pi.product_id WHERE pi.purchase_id = p_purchase_id AND pi.quantity > 0
LOOP
  SELECT COALESCE(quantity_on_hand, 0), COALESCE(average_cost, 0) INTO v_old_qty, v_old_avg FROM product_costing WHERE product_id = v_item.product_id AND branch_id = v_branch_id;
  IF NOT FOUND THEN v_old_qty := 0; v_old_avg := 0; END IF;

  IF (v_old_qty + v_item.quantity) > 0 THEN
    v_new_avg := ROUND((v_old_qty * v_old_avg + v_item.quantity * v_item.unit_price) / (v_old_qty + v_item.quantity), 4);
  ELSE v_new_avg := v_item.unit_price; END IF;

  INSERT INTO product_costing (product_id, branch_id, quantity_on_hand, average_cost, last_purchase_date, created_at, updated_at)
  VALUES (v_item.product_id, v_branch_id, v_item.quantity, v_new_avg, v_purchase_date, now(), now())
  ON CONFLICT (product_id, branch_id) DO UPDATE SET quantity_on_hand = product_costing.quantity_on_hand + v_item.quantity, average_cost = v_new_avg, last_purchase_date = v_purchase_date, updated_at = now();

  UPDATE inventory SET quantity = COALESCE(quantity, 0) + v_item.quantity, last_updated = now() WHERE product_id = v_item.product_id AND branch_id = v_branch_id;
  IF NOT FOUND THEN
    INSERT INTO inventory (product_id, branch_id, quantity, last_updated) VALUES (v_item.product_id, v_branch_id, v_item.quantity, now())
    ON CONFLICT (product_id, branch_id) DO UPDATE SET quantity = inventory.quantity + v_item.quantity, last_updated = now();
  END IF;

  INSERT INTO inventory_movements (id, product_id, branch_id, movement_type, quantity, unit_cost, reference_type, reference_id, notes, created_by, created_at)
  VALUES (gen_random_uuid(), v_item.product_id, v_branch_id, 'in', v_item.quantity, v_item.unit_price, 'purchase', p_purchase_id, 'Purchase Receipt: ' || v_purchase.purchase_number, v_user_id, now());
  v_movements_created := v_movements_created + 1;
END LOOP;

IF v_has_vat THEN
  INSERT INTO vat_transactions (id, source_type, source_id, supplier_id, invoice_number, taxable_amount, vat_amount, vat_category, tax_code, tax_rate, direction, period_month, period_year, transaction_date, branch_id, status, reference_type, reference_id, description, created_at)
  VALUES (gen_random_uuid(), 'purchase', p_purchase_id, v_purchase.supplier_id, v_purchase.purchase_number, v_total_net, v_vat_amount, 'standard', 'S', 15, 'input', EXTRACT(MONTH FROM v_purchase_date)::int, EXTRACT(YEAR FROM v_purchase_date)::int, v_purchase_date, v_branch_id, 'open', 'purchase', p_purchase_id, 'VAT Input — ' || v_purchase.purchase_number, now())
  ON CONFLICT (source_type, source_id, direction) DO NOTHING;
END IF;

IF NOT EXISTS (SELECT 1 FROM journal_entries WHERE reference_type = 'purchase' AND reference_id = p_purchase_id AND status IN ('Draft', 'Posted')) THEN
  v_je_id := gen_random_uuid();
  v_je_number := 'JE-PO-' || TO_CHAR(v_purchase_date, 'YYYYMMDD') || '-' || SUBSTRING(p_purchase_id::text, 1, 8);

  INSERT INTO journal_entries (id, entry_number, date, description, branch_id, reference_type, reference_id, status, created_by, created_at, updated_at)
  VALUES (v_je_id, v_je_number, v_purchase_date, 'Purchase Receipt — ' || v_purchase.purchase_number, v_branch_id, 'purchase', p_purchase_id, 'Draft', v_user_id, now(), now());

  INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, base_debit, base_credit, description, line_number, created_at)
  VALUES (gen_random_uuid(), v_je_id, v_inv_account_id, v_total_net, 0, v_total_net, 0, 'Inventory IN — ' || v_purchase.purchase_number, 1, now());

  IF v_has_vat AND v_vat_account_id IS NOT NULL THEN
    INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, base_debit, base_credit, description, line_number, created_at)
    VALUES (gen_random_uuid(), v_je_id, v_vat_account_id, v_vat_amount, 0, v_vat_amount, 0, 'VAT Input (2140) — ' || v_purchase.purchase_number, 2, now());
    INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, base_debit, base_credit, description, line_number, created_at)
    VALUES (gen_random_uuid(), v_je_id, v_credit_acct_id, 0, v_total_value, 0, v_total_value,
      CASE WHEN v_purchase.payment_method = 'cash' THEN 'Cash Payment — ' ELSE 'Accounts Payable — ' END || v_purchase.purchase_number, 3, now());
  ELSE
    INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, base_debit, base_credit, description, line_number, created_at)
    VALUES (gen_random_uuid(), v_je_id, v_credit_acct_id, 0, v_total_value, 0, v_total_value,
      CASE WHEN v_purchase.payment_method = 'cash' THEN 'Cash Payment — ' ELSE 'Accounts Payable — ' END || v_purchase.purchase_number, 2, now());
  END IF;

  UPDATE journal_entries SET status = 'Posted', posted_by = v_user_id, posted_at = now(), updated_at = now() WHERE id = v_je_id;
END IF;

UPDATE purchases SET status = 'received', receipt_processed_at = now(), updated_at = now() WHERE id = p_purchase_id;

PERFORM set_config('app.bypass_immutable', 'false', true);

RETURN jsonb_build_object('success', true, 'duplicate', false, 'purchase_id', p_purchase_id, 'purchase_number', v_purchase.purchase_number, 'movements_created', v_movements_created, 'vat_recorded', v_has_vat, 'vat_amount', v_vat_amount, 'total_net', v_total_net, 'total_value', v_total_value, 'journal_entry_id', v_je_id, 'message', 'Purchase receipt processed successfully');

EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.bypass_immutable', 'false', true);
  RAISE;
END;
$fn$;

GRANT EXECUTE ON FUNCTION internal.process_purchase_receipt_atomic(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.process_purchase_receipt_atomic(uuid);

CREATE OR REPLACE FUNCTION public.process_purchase_receipt_atomic(p_purchase_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY INVOKER
AS $$
SELECT internal.process_purchase_receipt_atomic(p_purchase_id);
$$;

GRANT EXECUTE ON FUNCTION public.process_purchase_receipt_atomic(uuid) TO authenticated;

------------------------------------------------------------
-- 8. update_purchase_status
------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.update_purchase_status(p_purchase_id uuid, p_new_status text, p_reason text DEFAULT 'No reason provided')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
v_caller_id uuid;
v_caller_role text;
v_purchase record;
v_allowed_transitions jsonb;
BEGIN
v_caller_id := auth.uid();
IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;
IF v_caller_role NOT IN ('admin', 'super_admin', 'accountant') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;

SELECT * INTO v_purchase FROM purchases WHERE id = p_purchase_id;
IF NOT FOUND THEN RAISE EXCEPTION 'Purchase not found: %', p_purchase_id; END IF;

v_allowed_transitions := '{"draft": ["confirmed", "cancelled", "void"], "confirmed": ["received", "cancelled", "void"], "received": ["void"], "cancelled": ["confirmed"]}'::jsonb;
IF NOT (v_allowed_transitions->v_purchase.status) ? p_new_status THEN
  RAISE EXCEPTION 'Invalid status transition: % -> %', v_purchase.status, p_new_status;
END IF;

IF p_new_status = 'void' THEN
  RETURN void_purchase(p_purchase_id, p_reason);
END IF;

PERFORM set_config('app.bypass_immutable', 'true', true);

UPDATE purchases SET status = p_new_status, updated_at = now() WHERE id = p_purchase_id;

INSERT INTO audit_logs (action, table_name, record_id, user_id, metadata)
VALUES ('STATUS_CHANGE', 'purchases', p_purchase_id, v_caller_id,
  jsonb_build_object('reason', p_reason, 'previous_status', v_purchase.status, 'new_status', p_new_status, 'purchase_number', v_purchase.purchase_number));

PERFORM set_config('app.bypass_immutable', 'false', true);

RETURN jsonb_build_object('success', true, 'purchase_id', p_purchase_id, 'previous_status', v_purchase.status, 'new_status', p_new_status);
END;
$fn$;

GRANT EXECUTE ON FUNCTION internal.update_purchase_status(uuid, text, text) TO authenticated;

DROP FUNCTION IF EXISTS public.update_purchase_status(uuid, text, text);

CREATE OR REPLACE FUNCTION public.update_purchase_status(p_purchase_id uuid, p_new_status text, p_reason text DEFAULT 'No reason provided')
 RETURNS jsonb
 LANGUAGE sql
 SECURITY INVOKER
AS $$
SELECT internal.update_purchase_status(p_purchase_id, p_new_status, p_reason);
$$;

GRANT EXECUTE ON FUNCTION public.update_purchase_status(uuid, text, text) TO authenticated;

------------------------------------------------------------
-- 9. update_sale_status
------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.update_sale_status(p_sale_id uuid, p_new_status text, p_reason text DEFAULT 'No reason provided')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
v_caller_id uuid;
v_caller_role text;
v_sale record;
v_allowed_transitions jsonb;
BEGIN
v_caller_id := auth.uid();
IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;
IF v_caller_role NOT IN ('admin', 'super_admin', 'accountant') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;

SELECT * INTO v_sale FROM sales WHERE id = p_sale_id;
IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found: %', p_sale_id; END IF;

v_allowed_transitions := '{"draft": ["confirmed", "cancelled", "void"], "confirmed": ["cancelled", "returned", "void"], "cancelled": ["confirmed"], "returned": ["confirmed"]}'::jsonb;
IF NOT (v_allowed_transitions->v_sale.status) ? p_new_status THEN
  RAISE EXCEPTION 'Invalid status transition: % -> %', v_sale.status, p_new_status;
END IF;

IF p_new_status = 'void' THEN
  RETURN internal.void_sale(p_sale_id, p_reason);
END IF;

PERFORM set_config('app.bypass_immutable', 'true', true);

UPDATE sales SET status = p_new_status, updated_at = now() WHERE id = p_sale_id;

INSERT INTO audit_logs (action, table_name, record_id, user_id, metadata)
VALUES ('STATUS_CHANGE', 'sales', p_sale_id, v_caller_id,
  jsonb_build_object('reason', p_reason, 'previous_status', v_sale.status, 'new_status', p_new_status, 'sale_number', v_sale.sale_number));

PERFORM set_config('app.bypass_immutable', 'false', true);

RETURN jsonb_build_object('success', true, 'sale_id', p_sale_id, 'previous_status', v_sale.status, 'new_status', p_new_status);
END;
$fn$;

GRANT EXECUTE ON FUNCTION internal.update_sale_status(uuid, text, text) TO authenticated;

DROP FUNCTION IF EXISTS public.update_sale_status(uuid, text, text);

CREATE OR REPLACE FUNCTION public.update_sale_status(p_sale_id uuid, p_new_status text, p_reason text DEFAULT 'No reason provided')
 RETURNS jsonb
 LANGUAGE sql
 SECURITY INVOKER
AS $$
SELECT internal.update_sale_status(p_sale_id, p_new_status, p_reason);
$$;

GRANT EXECUTE ON FUNCTION public.update_sale_status(uuid, text, text) TO authenticated;
