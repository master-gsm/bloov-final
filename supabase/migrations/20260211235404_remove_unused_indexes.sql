/*
  # Remove Unused Database Indexes

  This migration removes unused indexes that are consuming storage space and slowing down
  INSERT/UPDATE operations without providing any query performance benefits.

  ## Indexes Being Removed

  All indexes listed were identified as unused by Supabase's performance monitoring:
  - Account, activity log, and category indexes
  - Cash register and customer indexes  
  - Event order, expense, and inventory indexes
  - Invoice and loyalty transaction indexes
  - Partner contribution and distribution indexes
  - Product, purchase, and sale indexes
  - Supplier payment and transaction indexes
  - System settings indexes

  ## Impact

  - Reduced storage usage
  - Faster INSERT/UPDATE operations
  - No impact on query performance (indexes were unused)
*/

-- Drop all unused indexes
DROP INDEX IF EXISTS idx_accounts_parent_id;
DROP INDEX IF EXISTS idx_activity_log_user_id;
DROP INDEX IF EXISTS idx_bouquet_components_component_product_id;
DROP INDEX IF EXISTS idx_cash_registers_closed_by;
DROP INDEX IF EXISTS idx_cash_registers_opened_by;
DROP INDEX IF EXISTS idx_categories_parent_id;
DROP INDEX IF EXISTS idx_customers_created_by;
DROP INDEX IF EXISTS idx_event_orders_created_by;
DROP INDEX IF EXISTS idx_event_orders_sale_id;
DROP INDEX IF EXISTS idx_expenses_cash_register_id;
DROP INDEX IF EXISTS idx_expenses_created_by;
DROP INDEX IF EXISTS idx_inventory_updated_by;
DROP INDEX IF EXISTS idx_inventory_movements_created_by;
DROP INDEX IF EXISTS idx_inventory_movements_product_id;
DROP INDEX IF EXISTS idx_invoice_items_invoice_id;
DROP INDEX IF EXISTS idx_invoice_items_product_id;
DROP INDEX IF EXISTS idx_invoices_created_by;
DROP INDEX IF EXISTS idx_invoices_customer_id;
DROP INDEX IF EXISTS idx_invoices_sale_id;
DROP INDEX IF EXISTS idx_loyalty_transactions_customer_id;
DROP INDEX IF EXISTS idx_loyalty_transactions_sale_id;
DROP INDEX IF EXISTS idx_partner_contributions_created_by;
DROP INDEX IF EXISTS idx_partner_contributions_partner_id;
DROP INDEX IF EXISTS idx_partner_distributions_created_by;
DROP INDEX IF EXISTS idx_partner_distributions_partner_id;
DROP INDEX IF EXISTS idx_products_category_id;
DROP INDEX IF EXISTS idx_profiles_role_id;
DROP INDEX IF EXISTS idx_purchase_items_product_id;
DROP INDEX IF EXISTS idx_purchase_items_purchase_id;
DROP INDEX IF EXISTS idx_purchases_created_by;
DROP INDEX IF EXISTS idx_purchases_supplier_id;
DROP INDEX IF EXISTS idx_role_permissions_permission_id;
DROP INDEX IF EXISTS idx_sale_items_product_id;
DROP INDEX IF EXISTS idx_sales_created_by;
DROP INDEX IF EXISTS idx_sales_customer_id;
DROP INDEX IF EXISTS idx_settings_updated_by;
DROP INDEX IF EXISTS idx_supplier_payments_created_by;
DROP INDEX IF EXISTS idx_supplier_payments_supplier_id;
DROP INDEX IF EXISTS idx_suppliers_created_by;
DROP INDEX IF EXISTS idx_system_settings_updated_by;
DROP INDEX IF EXISTS idx_transactions_account_id;
DROP INDEX IF EXISTS idx_transactions_created_by;
