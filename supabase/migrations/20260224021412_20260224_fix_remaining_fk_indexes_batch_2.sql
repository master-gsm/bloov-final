/*
  # Fix Remaining 36 Unindexed Foreign Keys - Batch 2

  These are mostly branch_id, employee_id, and relationship FKs
  that were missed in the first pass.
*/

-- bank_accounts
CREATE INDEX IF NOT EXISTS idx_bank_accounts_branch_id ON public.bank_accounts(branch_id);

-- cash_registers
CREATE INDEX IF NOT EXISTS idx_cash_registers_branch_id ON public.cash_registers(branch_id);

-- chart_of_accounts
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_branch_id ON public.chart_of_accounts(branch_id);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_created_by ON public.chart_of_accounts(created_by);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_parent_account_id ON public.chart_of_accounts(parent_account_id);

-- compensation_plans
CREATE INDEX IF NOT EXISTS idx_compensation_plans_created_by ON public.compensation_plans(created_by);

-- customer_payments
CREATE INDEX IF NOT EXISTS idx_customer_payments_branch_id ON public.customer_payments(branch_id);
CREATE INDEX IF NOT EXISTS idx_customer_payments_customer_id ON public.customer_payments(customer_id);

-- employee_commissions
CREATE INDEX IF NOT EXISTS idx_employee_commissions_branch_id ON public.employee_commissions(branch_id);
CREATE INDEX IF NOT EXISTS idx_employee_commissions_employee_id ON public.employee_commissions(employee_id);

-- employee_leaves
CREATE INDEX IF NOT EXISTS idx_employee_leaves_branch_id ON public.employee_leaves(branch_id);
CREATE INDEX IF NOT EXISTS idx_employee_leaves_employee_id ON public.employee_leaves(employee_id);

-- employee_loans
CREATE INDEX IF NOT EXISTS idx_employee_loans_employee_id ON public.employee_loans(employee_id);

-- employee_settlements
CREATE INDEX IF NOT EXISTS idx_employee_settlements_branch_id ON public.employee_settlements(branch_id);
CREATE INDEX IF NOT EXISTS idx_employee_settlements_employee_id ON public.employee_settlements(employee_id);

-- expenses
CREATE INDEX IF NOT EXISTS idx_expenses_expense_account_id ON public.expenses(expense_account_id);

-- inventory_movements
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_id ON public.inventory_movements(product_id);

-- invoices
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_sale_id ON public.invoices(sale_id);

-- journal_entries
CREATE INDEX IF NOT EXISTS idx_journal_entries_branch_id ON public.journal_entries(branch_id);

-- payroll_runs (additional ones)
CREATE INDEX IF NOT EXISTS idx_payroll_runs_created_by ON public.payroll_runs(created_by);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_paid_by ON public.payroll_runs(paid_by);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_posted_by ON public.payroll_runs(posted_by);

-- products
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);

-- profiles
CREATE INDEX IF NOT EXISTS idx_profiles_role_id ON public.profiles(role_id);

-- purchase_items
CREATE INDEX IF NOT EXISTS idx_purchase_items_branch_id ON public.purchase_items(branch_id);

-- purchase_payments
CREATE INDEX IF NOT EXISTS idx_purchase_payments_payment_id ON public.purchase_payments(payment_id);
CREATE INDEX IF NOT EXISTS idx_purchase_payments_purchase_id ON public.purchase_payments(purchase_id);

-- purchase_receipts
CREATE INDEX IF NOT EXISTS idx_purchase_receipts_purchase_id ON public.purchase_receipts(purchase_id);

-- purchases
CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id ON public.purchases(supplier_id);

-- salary_payments
CREATE INDEX IF NOT EXISTS idx_salary_payments_created_by ON public.salary_payments(created_by);

-- sale_items
CREATE INDEX IF NOT EXISTS idx_sale_items_branch_id ON public.sale_items(branch_id);

-- sales
CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON public.sales(customer_id);

-- setup_expenses
CREATE INDEX IF NOT EXISTS idx_setup_expenses_created_by ON public.setup_expenses(created_by);
CREATE INDEX IF NOT EXISTS idx_setup_expenses_supplier_id ON public.setup_expenses(supplier_id);
