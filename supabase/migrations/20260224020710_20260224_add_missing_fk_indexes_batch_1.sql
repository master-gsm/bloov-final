/*
  # Add Missing FK Indexes - Batch 1 (90+ indexes)

  Creates indexes on foreign key columns to improve:
  - JOIN performance (faster lookups on FK columns)
  - Referential integrity constraint checks
  - CASCADE DELETE operations
*/

-- accounting_periods
CREATE INDEX IF NOT EXISTS idx_accounting_periods_closed_by ON public.accounting_periods(closed_by);

-- activity_log
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON public.activity_log(user_id);

-- ai_analysis_logs
CREATE INDEX IF NOT EXISTS idx_ai_analysis_logs_created_by ON public.ai_analysis_logs(created_by);

-- ai_forecasts
CREATE INDEX IF NOT EXISTS idx_ai_forecasts_product_id ON public.ai_forecasts(product_id);

-- audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_branch_id ON public.audit_logs(branch_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);

-- bank_accounts
CREATE INDEX IF NOT EXISTS idx_bank_accounts_gl_account_id ON public.bank_accounts(gl_account_id);

-- bouquet_components
CREATE INDEX IF NOT EXISTS idx_bouquet_components_component_product_id ON public.bouquet_components(component_product_id);

-- branch_stock
CREATE INDEX IF NOT EXISTS idx_branch_stock_product_id ON public.branch_stock(product_id);

-- branches
CREATE INDEX IF NOT EXISTS idx_branches_manager_id ON public.branches(manager_id);

-- cash_registers
CREATE INDEX IF NOT EXISTS idx_cash_registers_closed_by ON public.cash_registers(closed_by);
CREATE INDEX IF NOT EXISTS idx_cash_registers_opened_by ON public.cash_registers(opened_by);

-- cash_shifts
CREATE INDEX IF NOT EXISTS idx_cash_shifts_user_id ON public.cash_shifts(user_id);
CREATE INDEX IF NOT EXISTS idx_cash_shifts_voided_by ON public.cash_shifts(voided_by);

-- cash_transactions
CREATE INDEX IF NOT EXISTS idx_cash_transactions_shift_id ON public.cash_transactions(shift_id);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_voided_by ON public.cash_transactions(voided_by);

-- categories
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON public.categories(parent_id);

-- commission_accruals
CREATE INDEX IF NOT EXISTS idx_commission_accruals_employee_id ON public.commission_accruals(employee_id);
CREATE INDEX IF NOT EXISTS idx_commission_accruals_payroll_run_id ON public.commission_accruals(payroll_run_id);

-- compensation_plans
CREATE INDEX IF NOT EXISTS idx_compensation_plans_branch_id ON public.compensation_plans(branch_id);

-- customers
CREATE INDEX IF NOT EXISTS idx_customers_branch_id ON public.customers(branch_id);
CREATE INDEX IF NOT EXISTS idx_customers_created_by ON public.customers(created_by);

-- employee_commissions
CREATE INDEX IF NOT EXISTS idx_employee_commissions_payment_id ON public.employee_commissions(payment_id);

-- employee_leaves
CREATE INDEX IF NOT EXISTS idx_employee_leaves_approved_by ON public.employee_leaves(approved_by);
CREATE INDEX IF NOT EXISTS idx_employee_leaves_created_by ON public.employee_leaves(created_by);

-- employee_loans
CREATE INDEX IF NOT EXISTS idx_employee_loans_branch_id ON public.employee_loans(branch_id);
CREATE INDEX IF NOT EXISTS idx_employee_loans_created_by ON public.employee_loans(created_by);

-- employee_settlements
CREATE INDEX IF NOT EXISTS idx_employee_settlements_approved_by ON public.employee_settlements(approved_by);
CREATE INDEX IF NOT EXISTS idx_employee_settlements_created_by ON public.employee_settlements(created_by);

-- event_orders
CREATE INDEX IF NOT EXISTS idx_event_orders_created_by ON public.event_orders(created_by);
CREATE INDEX IF NOT EXISTS idx_event_orders_sale_id ON public.event_orders(sale_id);

-- expenses
CREATE INDEX IF NOT EXISTS idx_expenses_branch_id ON public.expenses(branch_id);
CREATE INDEX IF NOT EXISTS idx_expenses_cash_register_id ON public.expenses(cash_register_id);
CREATE INDEX IF NOT EXISTS idx_expenses_created_by ON public.expenses(created_by);
CREATE INDEX IF NOT EXISTS idx_expenses_partner_contribution_id ON public.expenses(partner_contribution_id);
CREATE INDEX IF NOT EXISTS idx_expenses_voided_by ON public.expenses(voided_by);

-- fixed_assets
CREATE INDEX IF NOT EXISTS idx_fixed_assets_created_by ON public.fixed_assets(created_by);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_supplier_id ON public.fixed_assets(supplier_id);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_voided_by ON public.fixed_assets(voided_by);

-- inventory
CREATE INDEX IF NOT EXISTS idx_inventory_branch_id ON public.inventory(branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_updated_by ON public.inventory(updated_by);

-- inventory_movements
CREATE INDEX IF NOT EXISTS idx_inventory_movements_branch_id ON public.inventory_movements(branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_by ON public.inventory_movements(created_by);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_voided_by ON public.inventory_movements(voided_by);

-- invoice_items
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_product_id ON public.invoice_items(product_id);

-- invoices
CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON public.invoices(created_by);

-- journal_entries
CREATE INDEX IF NOT EXISTS idx_journal_entries_created_by ON public.journal_entries(created_by);
CREATE INDEX IF NOT EXISTS idx_journal_entries_original_entry_id ON public.journal_entries(original_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_posted_by ON public.journal_entries(posted_by);
CREATE INDEX IF NOT EXISTS idx_journal_entries_reverse_entry_id ON public.journal_entries(reverse_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_voided_by ON public.journal_entries(voided_by);

-- journal_entry_lines
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_account_id ON public.journal_entry_lines(account_id);

-- loyalty_transactions
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_customer_id ON public.loyalty_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_sale_id ON public.loyalty_transactions(sale_id);

-- operating_expenses
CREATE INDEX IF NOT EXISTS idx_operating_expenses_branch_id ON public.operating_expenses(branch_id);
CREATE INDEX IF NOT EXISTS idx_operating_expenses_created_by ON public.operating_expenses(created_by);
CREATE INDEX IF NOT EXISTS idx_operating_expenses_voided_by ON public.operating_expenses(voided_by);

-- partner_contributions
CREATE INDEX IF NOT EXISTS idx_partner_contributions_created_by ON public.partner_contributions(created_by);
CREATE INDEX IF NOT EXISTS idx_partner_contributions_partner_id ON public.partner_contributions(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_contributions_voided_by ON public.partner_contributions(voided_by);

-- partner_distributions
CREATE INDEX IF NOT EXISTS idx_partner_distributions_created_by ON public.partner_distributions(created_by);
CREATE INDEX IF NOT EXISTS idx_partner_distributions_partner_id ON public.partner_distributions(partner_id);

-- partner_settlements
CREATE INDEX IF NOT EXISTS idx_partner_settlements_from_partner_id ON public.partner_settlements(from_partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_settlements_to_partner_id ON public.partner_settlements(to_partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_settlements_voided_by ON public.partner_settlements(voided_by);

-- payroll_items
CREATE INDEX IF NOT EXISTS idx_payroll_items_employee_id ON public.payroll_items(employee_id);

-- payroll_lines
CREATE INDEX IF NOT EXISTS idx_payroll_lines_employee_id ON public.payroll_lines(employee_id);

-- payroll_runs
CREATE INDEX IF NOT EXISTS idx_payroll_runs_approved_by ON public.payroll_runs(approved_by);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_branch_id ON public.payroll_runs(branch_id);

-- product_recipes
CREATE INDEX IF NOT EXISTS idx_product_recipes_material_id ON public.product_recipes(material_id);

-- purchase_items
CREATE INDEX IF NOT EXISTS idx_purchase_items_product_id ON public.purchase_items(product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_voided_by ON public.purchase_items(voided_by);

-- purchase_receipts
CREATE INDEX IF NOT EXISTS idx_purchase_receipts_created_by ON public.purchase_receipts(created_by);

-- purchases
CREATE INDEX IF NOT EXISTS idx_purchases_branch_id ON public.purchases(branch_id);
CREATE INDEX IF NOT EXISTS idx_purchases_created_by ON public.purchases(created_by);
CREATE INDEX IF NOT EXISTS idx_purchases_voided_by ON public.purchases(voided_by);

-- register_transactions
CREATE INDEX IF NOT EXISTS idx_register_transactions_created_by ON public.register_transactions(created_by);

-- role_permissions
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON public.role_permissions(permission_id);

-- salary_payments
CREATE INDEX IF NOT EXISTS idx_salary_payments_branch_id ON public.salary_payments(branch_id);
CREATE INDEX IF NOT EXISTS idx_salary_payments_employee_id ON public.salary_payments(employee_id);

-- sale_item_materials
CREATE INDEX IF NOT EXISTS idx_sale_item_materials_material_id ON public.sale_item_materials(material_id);

-- sale_items
CREATE INDEX IF NOT EXISTS idx_sale_items_voided_by ON public.sale_items(voided_by);

-- sales
CREATE INDEX IF NOT EXISTS idx_sales_branch_id ON public.sales(branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_by ON public.sales(created_by);
CREATE INDEX IF NOT EXISTS idx_sales_salesperson_id ON public.sales(salesperson_id);
CREATE INDEX IF NOT EXISTS idx_sales_voided_by ON public.sales(voided_by);

-- salla_order_items
CREATE INDEX IF NOT EXISTS idx_salla_order_items_product_id ON public.salla_order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_salla_order_items_salla_order_id ON public.salla_order_items(salla_order_id);

-- setup_expenses
CREATE INDEX IF NOT EXISTS idx_setup_expenses_branch_id ON public.setup_expenses(branch_id);
CREATE INDEX IF NOT EXISTS idx_setup_expenses_partner_id ON public.setup_expenses(partner_id);
CREATE INDEX IF NOT EXISTS idx_setup_expenses_voided_by ON public.setup_expenses(voided_by);

-- sms_logs
CREATE INDEX IF NOT EXISTS idx_sms_logs_sent_by ON public.sms_logs(sent_by);

-- supplier_payments
CREATE INDEX IF NOT EXISTS idx_supplier_payments_created_by ON public.supplier_payments(created_by);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier_id ON public.supplier_payments(supplier_id);

-- suppliers
CREATE INDEX IF NOT EXISTS idx_suppliers_created_by ON public.suppliers(created_by);

-- transactions
CREATE INDEX IF NOT EXISTS idx_transactions_created_by ON public.transactions(created_by);

-- users
CREATE INDEX IF NOT EXISTS idx_users_branch_id ON public.users(branch_id);

-- vat_transactions
CREATE INDEX IF NOT EXISTS idx_vat_transactions_vat_return_id ON public.vat_transactions(vat_return_id);

-- wastage
CREATE INDEX IF NOT EXISTS idx_wastage_product_id ON public.wastage(product_id);
CREATE INDEX IF NOT EXISTS idx_wastage_recorded_by ON public.wastage(recorded_by);
