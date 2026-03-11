/*
  # Add Missing Foreign Key Indexes - Batch 3

  1. Performance
    - Adds indexes on foreign key columns that were missing covering indexes
    - Covers tables: journal_entries, journal_entry_lines, loyalty_transactions,
      notifications, operating_expenses, partner_contributions, partner_distributions,
      partner_settlements, partner_withdrawals, payroll_items, payroll_lines,
      payroll_runs, product_recipes, products, profiles, profit_distributions,
      purchase_items, purchase_payments, purchase_receipts, purchases,
      register_transactions, salary_payments, sale_item_materials, sale_items,
      sales, salla_order_items, setup_expenses, sms_logs, supplier_payments,
      suppliers, transactions, users, vat_transactions, wastage

  2. Important Notes
    - Uses IF NOT EXISTS to prevent errors on re-runs
*/

CREATE INDEX IF NOT EXISTS idx_journal_entries_branch_id ON public.journal_entries (branch_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_original_entry_id ON public.journal_entries (original_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_reverse_entry_id ON public.journal_entries (reverse_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_account_id ON public.journal_entry_lines (account_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_customer_id ON public.loyalty_transactions (customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_sale_id ON public.loyalty_transactions (sale_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_operating_expenses_branch_id ON public.operating_expenses (branch_id);
CREATE INDEX IF NOT EXISTS idx_operating_expenses_created_by ON public.operating_expenses (created_by);
CREATE INDEX IF NOT EXISTS idx_operating_expenses_voided_by ON public.operating_expenses (voided_by);
CREATE INDEX IF NOT EXISTS idx_partner_contributions_created_by ON public.partner_contributions (created_by);
CREATE INDEX IF NOT EXISTS idx_partner_contributions_partner_id ON public.partner_contributions (partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_contributions_voided_by ON public.partner_contributions (voided_by);
CREATE INDEX IF NOT EXISTS idx_partner_distributions_created_by ON public.partner_distributions (created_by);
CREATE INDEX IF NOT EXISTS idx_partner_distributions_partner_id ON public.partner_distributions (partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_settlements_from_partner_id ON public.partner_settlements (from_partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_settlements_to_partner_id ON public.partner_settlements (to_partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_settlements_voided_by ON public.partner_settlements (voided_by);
CREATE INDEX IF NOT EXISTS idx_partner_withdrawals_branch_id ON public.partner_withdrawals (branch_id);
CREATE INDEX IF NOT EXISTS idx_partner_withdrawals_created_by ON public.partner_withdrawals (created_by);
CREATE INDEX IF NOT EXISTS idx_partner_withdrawals_journal_entry_id ON public.partner_withdrawals (journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_partner_withdrawals_partner_id ON public.partner_withdrawals (partner_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_employee_id ON public.payroll_items (employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_lines_employee_id ON public.payroll_lines (employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_approved_by ON public.payroll_runs (approved_by);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_branch_id ON public.payroll_runs (branch_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_created_by ON public.payroll_runs (created_by);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_paid_by ON public.payroll_runs (paid_by);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_posted_by ON public.payroll_runs (posted_by);
CREATE INDEX IF NOT EXISTS idx_product_recipes_material_id ON public.product_recipes (material_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products (category_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role_id ON public.profiles (role_id);
CREATE INDEX IF NOT EXISTS idx_profit_distributions_branch_id ON public.profit_distributions (branch_id);
CREATE INDEX IF NOT EXISTS idx_profit_distributions_created_by ON public.profit_distributions (created_by);
CREATE INDEX IF NOT EXISTS idx_profit_distributions_journal_entry_id ON public.profit_distributions (journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_branch_id ON public.purchase_items (branch_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product_id ON public.purchase_items (product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_voided_by ON public.purchase_items (voided_by);
CREATE INDEX IF NOT EXISTS idx_purchase_payments_payment_id ON public.purchase_payments (payment_id);
CREATE INDEX IF NOT EXISTS idx_purchase_payments_purchase_id ON public.purchase_payments (purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_receipts_created_by ON public.purchase_receipts (created_by);
CREATE INDEX IF NOT EXISTS idx_purchase_receipts_purchase_id ON public.purchase_receipts (purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchases_branch_id ON public.purchases (branch_id);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id ON public.purchases (supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_voided_by ON public.purchases (voided_by);
CREATE INDEX IF NOT EXISTS idx_register_transactions_created_by ON public.register_transactions (created_by);
CREATE INDEX IF NOT EXISTS idx_salary_payments_branch_id ON public.salary_payments (branch_id);
CREATE INDEX IF NOT EXISTS idx_salary_payments_created_by ON public.salary_payments (created_by);
CREATE INDEX IF NOT EXISTS idx_salary_payments_employee_id ON public.salary_payments (employee_id);
CREATE INDEX IF NOT EXISTS idx_sale_item_materials_material_id ON public.sale_item_materials (material_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_branch_id ON public.sale_items (branch_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_voided_by ON public.sale_items (voided_by);
CREATE INDEX IF NOT EXISTS idx_sales_branch_id ON public.sales (branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON public.sales (customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_salesperson_id ON public.sales (salesperson_id);
CREATE INDEX IF NOT EXISTS idx_salla_order_items_product_id ON public.salla_order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_salla_order_items_salla_order_id ON public.salla_order_items (salla_order_id);
CREATE INDEX IF NOT EXISTS idx_setup_expenses_branch_id ON public.setup_expenses (branch_id);
CREATE INDEX IF NOT EXISTS idx_setup_expenses_created_by ON public.setup_expenses (created_by);
CREATE INDEX IF NOT EXISTS idx_setup_expenses_partner_id ON public.setup_expenses (partner_id);
CREATE INDEX IF NOT EXISTS idx_setup_expenses_supplier_id ON public.setup_expenses (supplier_id);
CREATE INDEX IF NOT EXISTS idx_setup_expenses_voided_by ON public.setup_expenses (voided_by);
CREATE INDEX IF NOT EXISTS idx_sms_logs_sent_by ON public.sms_logs (sent_by);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_created_by ON public.supplier_payments (created_by);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier_id ON public.supplier_payments (supplier_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_created_by ON public.suppliers (created_by);
CREATE INDEX IF NOT EXISTS idx_transactions_created_by ON public.transactions (created_by);
CREATE INDEX IF NOT EXISTS idx_users_branch_id ON public.users (branch_id);
CREATE INDEX IF NOT EXISTS idx_vat_transactions_vat_return_id ON public.vat_transactions (vat_return_id);
CREATE INDEX IF NOT EXISTS idx_wastage_product_id ON public.wastage (product_id);
CREATE INDEX IF NOT EXISTS idx_wastage_recorded_by ON public.wastage (recorded_by);
