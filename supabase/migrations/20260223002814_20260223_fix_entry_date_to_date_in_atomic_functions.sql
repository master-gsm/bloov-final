/*
  # Fix entry_date column name in create_sale_atomic and pay_payroll_run

  ## Problem
  Both `create_sale_atomic` and `pay_payroll_run` functions reference
  `entry_date` when inserting into `journal_entries`, but the actual
  column name in that table is `date`.

  ## Changes
  - Recreate `create_sale_atomic`: replace `entry_date` with `date` in the INSERT
  - Recreate `pay_payroll_run`: replace `entry_date` with `date` in the INSERT

  ## No logic changes — only the column name is corrected.
*/

CREATE OR REPLACE FUNCTION public.create_sale_atomic(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
v_register_id        uuid;
v_tx_number          text;
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
SELECT id INTO v_existing_sale_id
FROM sales
WHERE idempotency_key = v_idempotency_key
LIMIT 1;

IF v_existing_sale_id IS NOT NULL THEN
SELECT sale_number INTO v_sale_number FROM sales WHERE id = v_existing_sale_id;
RETURN jsonb_build_object(
'success', true,
'sale_id', v_existing_sale_id,
'sale_number', v_sale_number,
'status', 'confirmed',
'duplicate', true
);
END IF;
END IF;

IF v_branch_id IS NULL THEN
RAISE EXCEPTION 'branch_id is required';
END IF;

IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
RAISE EXCEPTION 'At least one item is required';
END IF;

PERFORM set_config('app.bypass_immutable', 'true', true);
PERFORM set_config('app.atomic_sale_in_progress', 'true', true);

FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
LOOP
v_product_id := (v_item->>'product_id')::uuid;
v_qty        := COALESCE((v_item->>'quantity')::numeric, 0);

IF EXISTS (SELECT 1 FROM products WHERE id = v_product_id AND type = 'services') THEN
CONTINUE;
END IF;

SELECT COALESCE(quantity_on_hand, 0)
INTO v_stock_qty
FROM product_costing
WHERE product_id = v_product_id AND branch_id = v_branch_id;

IF v_stock_qty IS NULL THEN v_stock_qty := 0; END IF;

IF v_stock_qty < v_qty THEN
RAISE EXCEPTION 'Insufficient stock for product % (available: %, requested: %)',
v_product_id, v_stock_qty, v_qty;
END IF;
END LOOP;

SELECT 'INV-' || TO_CHAR(now(), 'YYYYMMDD') || '-' ||
LPAD((
SELECT COUNT(*) + 1
FROM sales
WHERE sale_date::date = now()::date
AND branch_id = v_branch_id
)::text, 4, '0')
INTO v_sale_number;

INSERT INTO sales (
id, branch_id, sale_number,
customer_id, customer_name, customer_phone,
sale_date, status,
subtotal, tax, discount, total,
paid_amount, payment_status, payment_method,
delivery_charge, delivery_address, card_message,
notes, source,
salla_shipping_cost, salla_payment_gateway_fee,
buyer_type, company_name, company_vat_number, company_address,
salesperson_id, created_by, created_at, updated_at,
idempotency_key
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
v_salesperson_id, v_created_by, now(), now(),
v_idempotency_key
);

FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
LOOP
v_product_id    := (v_item->>'product_id')::uuid;
v_qty           := COALESCE((v_item->>'quantity')::numeric, 0);
v_unit_price    := COALESCE((v_item->>'unit_price')::numeric, 0);
v_item_discount := COALESCE((v_item->>'discount')::numeric, 0);
v_item_total    := COALESCE((v_item->>'total')::numeric, 0);
v_purchase_price := 0;
v_is_service    := false;

SELECT COALESCE(purchase_price, 0), type = 'services'
INTO v_purchase_price, v_is_service
FROM products WHERE id = v_product_id;

INSERT INTO sale_items (
id, sale_id, product_id, quantity,
unit_price, purchase_price, discount, total,
created_at
) VALUES (
gen_random_uuid(), v_sale_id, v_product_id, v_qty,
v_unit_price, v_purchase_price, v_item_discount, v_item_total,
now()
);

IF NOT v_is_service THEN
UPDATE product_costing
SET quantity_on_hand = quantity_on_hand - v_qty,
updated_at = now()
WHERE product_id = v_product_id AND branch_id = v_branch_id;

UPDATE inventory
SET quantity = quantity - v_qty,
updated_at = now()
WHERE product_id = v_product_id AND branch_id = v_branch_id;

INSERT INTO inventory_movements (
id, product_id, branch_id, movement_type,
quantity, reference_id, reference_type,
unit_cost, notes, created_by, created_at
) VALUES (
gen_random_uuid(), v_product_id, v_branch_id, 'out',
v_qty, v_sale_id, 'sale',
v_purchase_price, 'Sale: ' || v_sale_number,
v_created_by, now()
)
ON CONFLICT DO NOTHING;

v_item_cost  := v_qty * v_purchase_price;
v_total_cost := v_total_cost + v_item_cost;
END IF;
END LOOP;

v_gross_profit := v_subtotal - v_total_cost;
IF v_subtotal > 0 THEN
v_profit_margin := ROUND((v_gross_profit / v_subtotal) * 100, 2);
END IF;

UPDATE sales SET
total_cost    = v_total_cost,
gross_profit  = v_gross_profit,
profit_margin = v_profit_margin,
updated_at    = now()
WHERE id = v_sale_id;

SELECT id INTO v_cash_account_id    FROM accounts WHERE code = '1110' LIMIT 1;
SELECT id INTO v_ar_account_id      FROM accounts WHERE code = '1120' LIMIT 1;
SELECT id INTO v_revenue_account_id FROM accounts WHERE code = '4100' LIMIT 1;
SELECT id INTO v_cogs_account_id    FROM accounts WHERE code = '5100' LIMIT 1;
SELECT id INTO v_inv_account_id     FROM accounts WHERE code = '1130' LIMIT 1;
SELECT id INTO v_vat_account_id     FROM accounts WHERE code = '2130' LIMIT 1;

IF v_cash_account_id IS NOT NULL AND v_revenue_account_id IS NOT NULL THEN
v_je_id     := gen_random_uuid();
v_je_number := 'JE-SALE-' || TO_CHAR(now(), 'YYYYMMDD') || '-' ||
SUBSTRING(v_sale_id::text, 1, 8);

v_debit_account_id := CASE
WHEN v_payment_method IN ('cash', 'card', 'bank_transfer') THEN v_cash_account_id
ELSE COALESCE(v_ar_account_id, v_cash_account_id)
END;

INSERT INTO journal_entries (
id, entry_number, date, description,
branch_id, reference_id, reference_type,
status, created_by, created_at, updated_at
) VALUES (
v_je_id, v_je_number, v_sale_date::date,
'Sale: ' || v_sale_number,
v_branch_id, v_sale_id, 'sale',
'posted', v_created_by, now(), now()
);

INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, description, created_at)
VALUES
(gen_random_uuid(), v_je_id, v_debit_account_id, v_total, 0, 'Cash/AR: ' || v_sale_number, now()),
(gen_random_uuid(), v_je_id, v_revenue_account_id, 0, v_subtotal, 'Revenue: ' || v_sale_number, now());

IF v_tax > 0 AND v_vat_account_id IS NOT NULL THEN
INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, description, created_at)
VALUES (gen_random_uuid(), v_je_id, v_vat_account_id, 0, v_tax, 'VAT Output: ' || v_sale_number, now());
END IF;

IF v_total_cost > 0 AND v_cogs_account_id IS NOT NULL AND v_inv_account_id IS NOT NULL THEN
INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, description, created_at)
VALUES
(gen_random_uuid(), v_je_id, v_cogs_account_id, v_total_cost, 0, 'COGS: ' || v_sale_number, now()),
(gen_random_uuid(), v_je_id, v_inv_account_id, 0, v_total_cost, 'Inv OUT: ' || v_sale_number, now());
END IF;
END IF;

IF v_payment_method = 'cash' THEN
SELECT id INTO v_register_id
FROM cash_registers
WHERE branch_id = v_branch_id AND status = 'open'
ORDER BY opened_at DESC
LIMIT 1;

IF v_register_id IS NOT NULL THEN
v_tx_number := 'CT-' || TO_CHAR(now(), 'YYYYMMDDHHMI') || '-' || SUBSTRING(v_sale_id::text, 1, 6);

INSERT INTO cash_transactions (
id, register_id, branch_id, transaction_type,
amount, description, reference_id, reference_type,
transaction_number, created_by, created_at
) VALUES (
gen_random_uuid(), v_register_id, v_branch_id, 'sale_in',
v_total, 'Sale: ' || v_sale_number, v_sale_id, 'sale',
v_tx_number, v_created_by, now()
);

UPDATE cash_registers
SET current_balance = current_balance + v_total,
updated_at = now()
WHERE id = v_register_id;
END IF;
END IF;

IF v_salesperson_id IS NOT NULL THEN
SELECT COALESCE(commission_rate, 0)
INTO v_emp_commission_rate
FROM employees
WHERE id = v_salesperson_id AND is_active = true;

IF COALESCE(v_emp_commission_rate, 0) > 0 THEN
INSERT INTO employee_commissions (
id, employee_id, branch_id, sale_id,
commission_rate, commission_amount,
sale_amount, is_paid, status,
period_month, period_year,
created_at
) VALUES (
gen_random_uuid(), v_salesperson_id, v_branch_id, v_sale_id,
v_emp_commission_rate,
ROUND(v_subtotal * (v_emp_commission_rate / 100), 2),
v_subtotal, false, 'pending',
EXTRACT(MONTH FROM now())::int,
EXTRACT(YEAR FROM now())::int,
now()
)
ON CONFLICT DO NOTHING;
END IF;
END IF;

IF (p_payload->>'customer_id') IS NOT NULL AND (p_payload->>'customer_id') != '' THEN
UPDATE customers SET
total_spent     = COALESCE(total_spent, 0) + v_total,
order_count     = COALESCE(order_count, 0) + 1,
last_order_date = v_sale_date::date,
updated_at      = now()
WHERE id = (p_payload->>'customer_id')::uuid;
END IF;

PERFORM set_config('app.bypass_immutable', 'false', true);
PERFORM set_config('app.atomic_sale_in_progress', 'false', true);

RETURN jsonb_build_object(
'success',      true,
'sale_id',      v_sale_id,
'sale_number',  v_sale_number,
'status',       'confirmed',
'total_cost',   v_total_cost,
'gross_profit', v_gross_profit,
'profit_margin',v_profit_margin,
'duplicate',    false
);

EXCEPTION WHEN OTHERS THEN
PERFORM set_config('app.bypass_immutable', 'false', true);
PERFORM set_config('app.atomic_sale_in_progress', 'false', true);
RAISE;
END;
$$;


CREATE OR REPLACE FUNCTION public.pay_payroll_run(p_run_id uuid, p_payment_method text DEFAULT 'cash')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
v_run             payroll_runs%ROWTYPE;
v_item            payroll_items%ROWTYPE;
v_expense_number  text;
v_salary_total    numeric := 0;
v_commission_total numeric := 0;
v_net_total       numeric := 0;
v_register_id     uuid;
v_loan_id         uuid;
v_tx_number       text;
v_je_id           uuid;
v_je_number       text;
v_cash_account_id       uuid;
v_salary_account_id     uuid;
v_commission_account_id uuid;
v_expense_seq     int := 1;
BEGIN
SELECT * INTO v_run FROM payroll_runs WHERE id = p_run_id;
IF NOT FOUND THEN
RAISE EXCEPTION 'Payroll run not found: %', p_run_id;
END IF;
IF v_run.status != 'approved' THEN
RAISE EXCEPTION 'Payroll run must be approved before payment (current: %)', v_run.status;
END IF;

PERFORM set_config('app.bypass_immutable', 'true', true);

SELECT id INTO v_cash_account_id       FROM accounts WHERE code = '1110' LIMIT 1;
SELECT id INTO v_salary_account_id     FROM accounts WHERE code = '6100' LIMIT 1;
SELECT id INTO v_commission_account_id FROM accounts WHERE code = '6110' LIMIT 1;

FOR v_item IN
SELECT * FROM payroll_items WHERE payroll_run_id = p_run_id
LOOP
SELECT 'EXP-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD(v_expense_seq::text, 4, '0')
INTO v_expense_number;
v_expense_seq := v_expense_seq + 1;

IF COALESCE(v_item.net_salary, v_item.net_pay, 0) > 0 THEN
INSERT INTO expenses (
id, expense_number, category, description, description_ar,
amount, expense_date, payment_method, branch_id,
created_by, created_at
) VALUES (
gen_random_uuid(), v_expense_number, 'salaries',
'Payroll: ' || TO_CHAR(make_date(v_run.period_year, v_run.period_month, 1), 'Month YYYY'),
'رواتب: ' || TO_CHAR(make_date(v_run.period_year, v_run.period_month, 1), 'Month YYYY'),
COALESCE(v_item.net_salary, v_item.net_pay, 0),
CURRENT_DATE, p_payment_method, v_run.branch_id,
v_run.created_by, now()
);
v_salary_total := v_salary_total + COALESCE(v_item.net_salary, v_item.net_pay, 0);
END IF;

IF COALESCE(v_item.commission_amount, v_item.commission_total, 0) > 0 THEN
SELECT 'EXP-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD(v_expense_seq::text, 4, '0')
INTO v_expense_number;
v_expense_seq := v_expense_seq + 1;

INSERT INTO expenses (
id, expense_number, category, description, description_ar,
amount, expense_date, payment_method, branch_id,
created_by, created_at
) VALUES (
gen_random_uuid(), v_expense_number, 'commissions',
'Commissions: ' || TO_CHAR(make_date(v_run.period_year, v_run.period_month, 1), 'Month YYYY'),
'عمولات: ' || TO_CHAR(make_date(v_run.period_year, v_run.period_month, 1), 'Month YYYY'),
COALESCE(v_item.commission_amount, v_item.commission_total, 0),
CURRENT_DATE, p_payment_method, v_run.branch_id,
v_run.created_by, now()
);
v_commission_total := v_commission_total + COALESCE(v_item.commission_amount, v_item.commission_total, 0);
END IF;

UPDATE employee_commissions
SET is_paid = true, status = 'approved', updated_at = now()
WHERE employee_id = v_item.employee_id
AND period_month = v_run.period_month
AND period_year  = v_run.period_year
AND is_paid = false;

IF COALESCE(v_item.loan_deduction, 0) > 0 THEN
SELECT id INTO v_loan_id
FROM employee_loans
WHERE employee_id = v_item.employee_id
AND status = 'active'
AND branch_id = v_run.branch_id
LIMIT 1;

IF v_loan_id IS NOT NULL THEN
UPDATE employee_loans
SET
remaining_balance = GREATEST(remaining_balance - v_item.loan_deduction, 0),
status = CASE
WHEN remaining_balance - v_item.loan_deduction <= 0 THEN 'completed'
ELSE status
END,
updated_at = now()
WHERE id = v_loan_id;
END IF;
END IF;

UPDATE employee_leaves
SET payroll_deducted = true, updated_at = now()
WHERE employee_id = v_item.employee_id
AND leave_type = 'unpaid'
AND status = 'approved'
AND payroll_deducted = false
AND EXTRACT(MONTH FROM start_date) = v_run.period_month
AND EXTRACT(YEAR  FROM start_date) = v_run.period_year;
END LOOP;

v_net_total := v_salary_total + v_commission_total;

IF p_payment_method IN ('cash', 'bank_transfer') THEN
SELECT id INTO v_register_id
FROM cash_registers
WHERE branch_id = v_run.branch_id AND status = 'open'
ORDER BY opened_at DESC
LIMIT 1;

IF v_register_id IS NOT NULL THEN
v_tx_number := 'CT-PAY-' || TO_CHAR(now(), 'YYYYMMDDHHMI') || '-' || SUBSTRING(p_run_id::text, 1, 6);

INSERT INTO cash_transactions (
id, register_id, branch_id, transaction_type,
amount, description, reference_id, reference_type,
transaction_number, created_by, created_at
) VALUES (
gen_random_uuid(), v_register_id, v_run.branch_id, 'expense_out',
v_net_total,
'Payroll: ' || TO_CHAR(make_date(v_run.period_year, v_run.period_month, 1), 'Month YYYY'),
p_run_id, 'payroll_run',
v_tx_number, v_run.created_by, now()
);

UPDATE cash_registers
SET current_balance = current_balance - v_net_total,
updated_at = now()
WHERE id = v_register_id;
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
'posted', v_run.created_by, now(), now()
);

IF v_salary_total > 0 AND v_salary_account_id IS NOT NULL THEN
INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, description, created_at)
VALUES (gen_random_uuid(), v_je_id, v_salary_account_id, v_salary_total, 0, 'Salaries paid', now());
END IF;

IF v_commission_total > 0 THEN
INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, description, created_at)
VALUES (gen_random_uuid(), v_je_id, COALESCE(v_commission_account_id, v_salary_account_id), v_commission_total, 0, 'Commissions paid', now());
END IF;

INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, description, created_at)
VALUES (gen_random_uuid(), v_je_id, v_cash_account_id, 0, v_net_total, 'Cash out: payroll', now());
END IF;

UPDATE payroll_runs SET
status         = 'paid',
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
'cash_registered',  (v_register_id IS NOT NULL)
);

EXCEPTION WHEN OTHERS THEN
PERFORM set_config('app.bypass_immutable', 'false', true);
RAISE;
END;
$$;
