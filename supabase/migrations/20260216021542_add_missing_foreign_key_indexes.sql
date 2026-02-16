/*
  # Add Missing Foreign Key Indexes

  1. Performance Improvements
    - Add indexes for all unindexed foreign keys
    - Improves JOIN performance and foreign key constraint checking
    - Essential for query optimization

  2. Indexes Added
    - accounting_periods: branch_id, closed_by
    - ai_forecasts, ai_insights: created_by
    - audit_log: branch_id
    - cash_transactions: created_by
    - chart_of_accounts: branch_id, created_by, parent_account_id
    - compensation_plans: created_by
    - customer_payments: branch_id, created_by, customer_id, journal_entry_id
    - inventory_movements: product_id
    - invoices: customer_id, sale_id
    - journal_entries: branch_id, created_by, period_id, posted_by
    - partner_settlements: created_by
    - payroll_runs: created_by, paid_by, posted_by
    - products: category_id
    - profiles: role_id
    - purchase_items: purchase_id
    - purchases: supplier_id
    - salary_payments: created_by
    - sale_items: product_id, sale_id
    - sales: customer_id
    - setup_expenses: created_by, supplier_id
    - transactions: account_id
*/

-- accounting_periods
CREATE INDEX IF NOT EXISTS idx_accounting_periods_branch_id ON accounting_periods(branch_id);
CREATE INDEX IF NOT EXISTS idx_accounting_periods_closed_by ON accounting_periods(closed_by);

-- ai_forecasts, ai_insights
CREATE INDEX IF NOT EXISTS idx_ai_forecasts_created_by ON ai_forecasts(created_by);
CREATE INDEX IF NOT EXISTS idx_ai_insights_created_by ON ai_insights(created_by);

-- audit_log
CREATE INDEX IF NOT EXISTS idx_audit_log_branch_id ON audit_log(branch_id);

-- cash_transactions
CREATE INDEX IF NOT EXISTS idx_cash_transactions_created_by ON cash_transactions(created_by);

-- chart_of_accounts
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_branch_id ON chart_of_accounts(branch_id);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_created_by ON chart_of_accounts(created_by);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_parent_account_id ON chart_of_accounts(parent_account_id);

-- compensation_plans
CREATE INDEX IF NOT EXISTS idx_compensation_plans_created_by ON compensation_plans(created_by);

-- customer_payments
CREATE INDEX IF NOT EXISTS idx_customer_payments_branch_id ON customer_payments(branch_id);
CREATE INDEX IF NOT EXISTS idx_customer_payments_created_by ON customer_payments(created_by);
CREATE INDEX IF NOT EXISTS idx_customer_payments_customer_id ON customer_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_payments_journal_entry_id ON customer_payments(journal_entry_id);

-- inventory_movements
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_id ON inventory_movements(product_id);

-- invoices
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_sale_id ON invoices(sale_id);

-- journal_entries
CREATE INDEX IF NOT EXISTS idx_journal_entries_branch_id ON journal_entries(branch_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_created_by ON journal_entries(created_by);
CREATE INDEX IF NOT EXISTS idx_journal_entries_period_id ON journal_entries(period_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_posted_by ON journal_entries(posted_by);

-- partner_settlements
CREATE INDEX IF NOT EXISTS idx_partner_settlements_created_by ON partner_settlements(created_by);

-- payroll_runs
CREATE INDEX IF NOT EXISTS idx_payroll_runs_created_by ON payroll_runs(created_by);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_paid_by ON payroll_runs(paid_by);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_posted_by ON payroll_runs(posted_by);

-- products
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);

-- profiles
CREATE INDEX IF NOT EXISTS idx_profiles_role_id ON profiles(role_id);

-- purchase_items
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id ON purchase_items(purchase_id);

-- purchases
CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id ON purchases(supplier_id);

-- salary_payments
CREATE INDEX IF NOT EXISTS idx_salary_payments_created_by ON salary_payments(created_by);

-- sale_items
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);

-- sales
CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id);

-- setup_expenses
CREATE INDEX IF NOT EXISTS idx_setup_expenses_created_by ON setup_expenses(created_by);
CREATE INDEX IF NOT EXISTS idx_setup_expenses_supplier_id ON setup_expenses(supplier_id);

-- transactions
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);