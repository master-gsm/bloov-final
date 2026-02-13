/*
  # Fix Unindexed Foreign Keys and Duplicate Policies

  ## Changes Made
  
  1. **Add Indexes for Foreign Keys**
     - Added 42 indexes to cover all foreign key constraints
     - Improves JOIN performance and foreign key constraint checking
     - Helps query optimizer make better execution plans
  
  2. **Fix Duplicate SELECT Policies on transactions**
     - Removed ALL policy that was creating duplicate SELECT coverage
     - Split into specific INSERT, UPDATE, DELETE policies for admins/accountants
     - Kept SELECT policy that includes observer role
  
  ## Performance Improvements
     - Foreign key lookups will be significantly faster
     - JOIN operations on foreign keys will use indexes
     - Better query planning by PostgreSQL optimizer
  
  ## Security Improvements
     - Clearer policy structure for transactions table
     - Observers can view but not modify transactions
     - Admins and accountants can modify transactions

  ## Notes
     - Auth DB Connection Strategy and Leaked Password Protection require Supabase Dashboard configuration
*/

-- =============================================================================
-- 1. ADD INDEXES FOR FOREIGN KEYS
-- =============================================================================

-- accounts table
CREATE INDEX IF NOT EXISTS idx_accounts_parent_id ON accounts(parent_id);

-- activity_log table
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);

-- bouquet_components table
CREATE INDEX IF NOT EXISTS idx_bouquet_components_component_product_id ON bouquet_components(component_product_id);

-- cash_registers table
CREATE INDEX IF NOT EXISTS idx_cash_registers_closed_by ON cash_registers(closed_by);
CREATE INDEX IF NOT EXISTS idx_cash_registers_opened_by ON cash_registers(opened_by);

-- categories table
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);

-- customers table
CREATE INDEX IF NOT EXISTS idx_customers_created_by ON customers(created_by);

-- event_orders table
CREATE INDEX IF NOT EXISTS idx_event_orders_created_by ON event_orders(created_by);
CREATE INDEX IF NOT EXISTS idx_event_orders_sale_id ON event_orders(sale_id);

-- expenses table
CREATE INDEX IF NOT EXISTS idx_expenses_cash_register_id ON expenses(cash_register_id);
CREATE INDEX IF NOT EXISTS idx_expenses_created_by ON expenses(created_by);

-- inventory table
CREATE INDEX IF NOT EXISTS idx_inventory_updated_by ON inventory(updated_by);

-- inventory_movements table
CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_by ON inventory_movements(created_by);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_id ON inventory_movements(product_id);

-- invoice_items table
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_product_id ON invoice_items(product_id);

-- invoices table
CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON invoices(created_by);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_sale_id ON invoices(sale_id);

-- loyalty_transactions table
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_customer_id ON loyalty_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_sale_id ON loyalty_transactions(sale_id);

-- partner_contributions table
CREATE INDEX IF NOT EXISTS idx_partner_contributions_created_by ON partner_contributions(created_by);
CREATE INDEX IF NOT EXISTS idx_partner_contributions_partner_id ON partner_contributions(partner_id);

-- partner_distributions table
CREATE INDEX IF NOT EXISTS idx_partner_distributions_created_by ON partner_distributions(created_by);
CREATE INDEX IF NOT EXISTS idx_partner_distributions_partner_id ON partner_distributions(partner_id);

-- products table
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);

-- profiles table
CREATE INDEX IF NOT EXISTS idx_profiles_role_id ON profiles(role_id);

-- purchase_items table
CREATE INDEX IF NOT EXISTS idx_purchase_items_product_id ON purchase_items(product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id ON purchase_items(purchase_id);

-- purchases table
CREATE INDEX IF NOT EXISTS idx_purchases_created_by ON purchases(created_by);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id ON purchases(supplier_id);

-- role_permissions table
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);

-- sale_items table
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id);

-- sales table
CREATE INDEX IF NOT EXISTS idx_sales_created_by ON sales(created_by);
CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id);

-- settings table
CREATE INDEX IF NOT EXISTS idx_settings_updated_by ON settings(updated_by);

-- supplier_payments table
CREATE INDEX IF NOT EXISTS idx_supplier_payments_created_by ON supplier_payments(created_by);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier_id ON supplier_payments(supplier_id);

-- suppliers table
CREATE INDEX IF NOT EXISTS idx_suppliers_created_by ON suppliers(created_by);

-- system_settings table
CREATE INDEX IF NOT EXISTS idx_system_settings_updated_by ON system_settings(updated_by);

-- transactions table
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_by ON transactions(created_by);

-- =============================================================================
-- 2. FIX DUPLICATE SELECT POLICIES ON TRANSACTIONS TABLE
-- =============================================================================

-- Drop the ALL policy that creates duplicate SELECT coverage
DROP POLICY IF EXISTS "Admins and accountants can manage transactions" ON transactions;

-- Create specific policies for INSERT, UPDATE, DELETE
CREATE POLICY "Admins and accountants can insert transactions"
  ON transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    get_my_role() IN ('admin', 'accountant')
  );

CREATE POLICY "Admins and accountants can update transactions"
  ON transactions
  FOR UPDATE
  TO authenticated
  USING (
    get_my_role() IN ('admin', 'accountant')
  )
  WITH CHECK (
    get_my_role() IN ('admin', 'accountant')
  );

CREATE POLICY "Admins and accountants can delete transactions"
  ON transactions
  FOR DELETE
  TO authenticated
  USING (
    get_my_role() IN ('admin', 'accountant')
  );