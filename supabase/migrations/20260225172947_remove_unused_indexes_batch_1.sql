/*
  # Remove Unused Indexes - Batch 1 (Core Tables)

  1. Purpose
    - Remove 170+ unused indexes identified by security audit
    - Reduce database bloat and improve write performance
    - Decrease maintenance overhead for index updates

  2. Impact
    - Faster INSERT/UPDATE/DELETE operations
    - Less storage space required
    - No impact on query performance (indexes not used)

  3. Safety
    - All indexes confirmed as unused by pg_stat_user_indexes
    - Can be recreated if needed in future
    - Foreign key constraints remain intact
*/

-- ZATCA & E-Invoicing
DROP INDEX IF EXISTS idx_sales_invoice_uuid;
DROP INDEX IF EXISTS idx_sales_zatca_unsigned;
DROP INDEX IF EXISTS idx_sales_zatca_status;
DROP INDEX IF EXISTS idx_sales_invoice_hash_pending;
DROP INDEX IF EXISTS idx_zatca_queue_pending;
DROP INDEX IF EXISTS idx_zatca_queue_sale_id;
DROP INDEX IF EXISTS idx_zatca_queue_branch;
DROP INDEX IF EXISTS idx_zatca_queue_status;

-- VAT & Tax
DROP INDEX IF EXISTS idx_vat_transactions_vat_return_id;

-- Sales & Customers
DROP INDEX IF EXISTS idx_sales_customer_id;
DROP INDEX IF EXISTS idx_sales_branch_id;
DROP INDEX IF EXISTS idx_sales_salesperson_id;
DROP INDEX IF EXISTS idx_sales_branch_date_status;
DROP INDEX IF EXISTS idx_sales_confirmed_branch;
DROP INDEX IF EXISTS idx_customers_branch_id;
DROP INDEX IF EXISTS idx_customers_created_by;
DROP INDEX IF EXISTS idx_customer_payments_branch_id;
DROP INDEX IF EXISTS idx_customer_payments_customer_id;

-- Invoices
DROP INDEX IF EXISTS idx_invoices_customer_id;
DROP INDEX IF EXISTS idx_invoices_sale_id;
DROP INDEX IF EXISTS idx_invoices_created_by;
DROP INDEX IF EXISTS idx_invoice_items_invoice_id;
DROP INDEX IF EXISTS idx_invoice_items_product_id;

-- Products & Inventory
DROP INDEX IF EXISTS idx_products_category_id;
DROP INDEX IF EXISTS idx_inventory_branch_id;
DROP INDEX IF EXISTS idx_inventory_updated_by;
DROP INDEX IF EXISTS idx_inventory_movements_product_id;
DROP INDEX IF EXISTS idx_inventory_movements_branch_id;
DROP INDEX IF EXISTS idx_inventory_movements_created_by;
DROP INDEX IF EXISTS idx_inventory_movements_voided_by;

-- Purchases & Suppliers
DROP INDEX IF EXISTS idx_purchases_supplier_id;
DROP INDEX IF EXISTS idx_purchases_branch_id;
DROP INDEX IF EXISTS idx_purchases_branch_date;
DROP INDEX IF EXISTS idx_purchases_voided_by;
DROP INDEX IF EXISTS idx_purchase_items_branch_id;
DROP INDEX IF EXISTS idx_purchase_items_product_id;
DROP INDEX IF EXISTS idx_purchase_items_voided_by;
DROP INDEX IF EXISTS idx_purchase_receipts_purchase_id;
DROP INDEX IF EXISTS idx_purchase_receipts_created_by;
DROP INDEX IF EXISTS idx_purchase_payments_payment_id;
DROP INDEX IF EXISTS idx_purchase_payments_purchase_id;
DROP INDEX IF EXISTS idx_suppliers_created_by;
DROP INDEX IF EXISTS idx_supplier_payments_created_by;
DROP INDEX IF EXISTS idx_supplier_payments_supplier_id;

-- Expenses
DROP INDEX IF EXISTS idx_expenses_branch_id;
DROP INDEX IF EXISTS idx_expenses_expense_account_id;
DROP INDEX IF EXISTS idx_expenses_created_by;
DROP INDEX IF EXISTS idx_expenses_cash_register_id;
DROP INDEX IF EXISTS idx_expenses_partner_contribution_id;
DROP INDEX IF EXISTS idx_expenses_voided_by;
DROP INDEX IF EXISTS idx_setup_expenses_branch_id;
DROP INDEX IF EXISTS idx_setup_expenses_created_by;
DROP INDEX IF EXISTS idx_setup_expenses_supplier_id;
DROP INDEX IF EXISTS idx_setup_expenses_partner_id;
DROP INDEX IF EXISTS idx_setup_expenses_voided_by;
DROP INDEX IF EXISTS idx_operating_expenses_branch_id;
DROP INDEX IF EXISTS idx_operating_expenses_created_by;
DROP INDEX IF EXISTS idx_operating_expenses_voided_by;

-- Chart of Accounts & Journal Entries
DROP INDEX IF EXISTS idx_chart_of_accounts_branch_id;
DROP INDEX IF EXISTS idx_chart_of_accounts_created_by;
DROP INDEX IF EXISTS idx_chart_of_accounts_parent_account_id;
DROP INDEX IF EXISTS idx_journal_entries_branch_id;
DROP INDEX IF EXISTS idx_journal_entries_posted_date;
DROP INDEX IF EXISTS idx_journal_entries_original_entry_id;
DROP INDEX IF EXISTS idx_journal_entries_reverse_entry_id;
DROP INDEX IF EXISTS idx_journal_lines_account_entry;
DROP INDEX IF EXISTS idx_journal_entry_lines_account_id;
