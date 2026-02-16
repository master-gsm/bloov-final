/*
  # Optimize RLS Policies for Better Performance

  1. Performance Improvements
    - Replace auth.uid() with (select auth.uid()) in all RLS policies
    - This prevents re-evaluation of the function for each row
    - Significantly improves query performance at scale

  2. Tables Optimized
    - users, customers, inventory, operating_expenses
    - cash_transactions, cash_shifts, wastage
    - setup_expenses, salla_orders, salla_order_items
    - settings, ai_analysis_logs, ai_forecasts, ai_insights
    - partner_settlements, backup_settings, backup_logs
    - loyalty_settings, loyalty_point_transactions
    - And many more...
*/

-- Users table
DROP POLICY IF EXISTS "Users can update own profile only" ON users;
CREATE POLICY "Users can update own profile only" ON users
  FOR UPDATE
  TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

-- Customers table  
DROP POLICY IF EXISTS "Users can create customers" ON customers;
CREATE POLICY "Users can create customers" ON customers
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IN (
    SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
  ));

DROP POLICY IF EXISTS "Users can delete customers from their branch" ON customers;
CREATE POLICY "Users can delete customers from their branch" ON customers
  FOR DELETE
  TO authenticated
  USING ((select auth.uid()) IN (
    SELECT id FROM users WHERE role IN ('admin', 'super_admin')
  ));

DROP POLICY IF EXISTS "Users can update customers" ON customers;
CREATE POLICY "Users can update customers" ON customers
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Inventory table
DROP POLICY IF EXISTS "Users can view their branch inventory" ON inventory;
CREATE POLICY "Users can view their branch inventory" ON inventory
  FOR SELECT
  TO authenticated
  USING (
    branch_id IN (
      SELECT branch_id FROM users WHERE id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can insert inventory for their branch" ON inventory;
CREATE POLICY "Users can insert inventory for their branch" ON inventory
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Users can update their branch inventory" ON inventory;
CREATE POLICY "Users can update their branch inventory" ON inventory
  FOR UPDATE
  TO authenticated
  USING (
    branch_id IN (
      SELECT branch_id FROM users WHERE id = (select auth.uid())
    )
  )
  WITH CHECK (
    branch_id IN (
      SELECT branch_id FROM users WHERE id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete their branch inventory" ON inventory;
CREATE POLICY "Users can delete their branch inventory" ON inventory
  FOR DELETE
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role = 'admin'
    )
  );

-- Operating expenses table
DROP POLICY IF EXISTS "Users can view their branch expenses" ON operating_expenses;
CREATE POLICY "Users can view their branch expenses" ON operating_expenses
  FOR SELECT
  TO authenticated
  USING (
    branch_id IN (
      SELECT branch_id FROM users WHERE id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can insert expenses for their branch" ON operating_expenses;
CREATE POLICY "Users can insert expenses for their branch" ON operating_expenses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Users can update their branch expenses" ON operating_expenses;
CREATE POLICY "Users can update their branch expenses" ON operating_expenses
  FOR UPDATE
  TO authenticated
  USING (
    branch_id IN (
      SELECT branch_id FROM users WHERE id = (select auth.uid())
    )
  )
  WITH CHECK (
    branch_id IN (
      SELECT branch_id FROM users WHERE id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete their branch expenses" ON operating_expenses;
CREATE POLICY "Users can delete their branch expenses" ON operating_expenses
  FOR DELETE
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admin and accountant can insert operating expenses" ON operating_expenses;
CREATE POLICY "Admin and accountant can insert operating expenses" ON operating_expenses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Admin and accountant can update operating expenses" ON operating_expenses;
CREATE POLICY "Admin and accountant can update operating expenses" ON operating_expenses
  FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Admin can delete operating expenses" ON operating_expenses;
CREATE POLICY "Admin can delete operating expenses" ON operating_expenses
  FOR DELETE
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  );

-- Cash transactions table
DROP POLICY IF EXISTS "Users can view their branch cash transactions" ON cash_transactions;
CREATE POLICY "Users can view their branch cash transactions" ON cash_transactions
  FOR SELECT
  TO authenticated
  USING (
    branch_id IN (
      SELECT branch_id FROM users WHERE id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can insert cash transactions for their branch" ON cash_transactions;
CREATE POLICY "Users can insert cash transactions for their branch" ON cash_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Users can update their branch cash transactions" ON cash_transactions;
CREATE POLICY "Users can update their branch cash transactions" ON cash_transactions
  FOR UPDATE
  TO authenticated
  USING (
    branch_id IN (
      SELECT branch_id FROM users WHERE id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete their branch cash transactions" ON cash_transactions;
CREATE POLICY "Users can delete their branch cash transactions" ON cash_transactions
  FOR DELETE
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admin and accountant can insert cash transactions" ON cash_transactions;
CREATE POLICY "Admin and accountant can insert cash transactions" ON cash_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Admin and accountant can update cash transactions" ON cash_transactions;
CREATE POLICY "Admin and accountant can update cash transactions" ON cash_transactions
  FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Only admin can delete cash transactions" ON cash_transactions;
CREATE POLICY "Only admin can delete cash transactions" ON cash_transactions
  FOR DELETE
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  );

-- Cash shifts table
DROP POLICY IF EXISTS "Users can view their branch cash shifts" ON cash_shifts;
CREATE POLICY "Users can view their branch cash shifts" ON cash_shifts
  FOR SELECT
  TO authenticated
  USING (
    branch_id IN (
      SELECT branch_id FROM users WHERE id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can insert cash shifts for their branch" ON cash_shifts;
CREATE POLICY "Users can insert cash shifts for their branch" ON cash_shifts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Users can update their branch cash shifts" ON cash_shifts;
CREATE POLICY "Users can update their branch cash shifts" ON cash_shifts
  FOR UPDATE
  TO authenticated
  USING (
    branch_id IN (
      SELECT branch_id FROM users WHERE id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete their branch cash shifts" ON cash_shifts;
CREATE POLICY "Users can delete their branch cash shifts" ON cash_shifts
  FOR DELETE
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admin and accountant can insert cash shifts" ON cash_shifts;
CREATE POLICY "Admin and accountant can insert cash shifts" ON cash_shifts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Admin and accountant can update cash shifts" ON cash_shifts;
CREATE POLICY "Admin and accountant can update cash shifts" ON cash_shifts
  FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Only admin can delete cash shifts" ON cash_shifts;
CREATE POLICY "Only admin can delete cash shifts" ON cash_shifts
  FOR DELETE
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  );

-- Settings table
DROP POLICY IF EXISTS "Admin and accountant can view settings" ON settings;
CREATE POLICY "Admin and accountant can view settings" ON settings
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Admin can update settings" ON settings;
CREATE POLICY "Admin can update settings" ON settings
  FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  );

-- AI Analysis logs table
DROP POLICY IF EXISTS "Users can create AI logs" ON ai_analysis_logs;
CREATE POLICY "Users can create AI logs" ON ai_analysis_logs
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can view their own AI logs" ON ai_analysis_logs;
CREATE POLICY "Users can view their own AI logs" ON ai_analysis_logs
  FOR SELECT
  TO authenticated
  USING (created_by = (select auth.uid()));

-- AI Forecasts table
DROP POLICY IF EXISTS "Users can create forecasts" ON ai_forecasts;
CREATE POLICY "Users can create forecasts" ON ai_forecasts
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can update their forecasts" ON ai_forecasts;
CREATE POLICY "Users can update their forecasts" ON ai_forecasts
  FOR UPDATE
  TO authenticated
  USING (created_by = (select auth.uid()));

-- AI Insights table
DROP POLICY IF EXISTS "Users can create insights" ON ai_insights;
CREATE POLICY "Users can create insights" ON ai_insights
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- Loyalty settings table
DROP POLICY IF EXISTS "Admins can update loyalty settings" ON loyalty_settings;
CREATE POLICY "Admins can update loyalty settings" ON loyalty_settings
  FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  );

-- Loyalty point transactions table
DROP POLICY IF EXISTS "Admins can update loyalty transactions" ON loyalty_point_transactions;
CREATE POLICY "Admins can update loyalty transactions" ON loyalty_point_transactions
  FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  );

-- Backup settings table
DROP POLICY IF EXISTS "Admins can view backup settings" ON backup_settings;
CREATE POLICY "Admins can view backup settings" ON backup_settings
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Admins can update backup settings" ON backup_settings;
CREATE POLICY "Admins can update backup settings" ON backup_settings
  FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  );

-- Backup logs table
DROP POLICY IF EXISTS "Admins can view all backup logs" ON backup_logs;
CREATE POLICY "Admins can view all backup logs" ON backup_logs
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  );

-- Setup expenses table
DROP POLICY IF EXISTS "Accountants and admins can insert setup expenses" ON setup_expenses;
CREATE POLICY "Accountants and admins can insert setup expenses" ON setup_expenses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Accountants and admins can update setup expenses" ON setup_expenses;
CREATE POLICY "Accountants and admins can update setup expenses" ON setup_expenses
  FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Admins can delete setup expenses" ON setup_expenses;
CREATE POLICY "Admins can delete setup expenses" ON setup_expenses
  FOR DELETE
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  );

-- Salla orders table
DROP POLICY IF EXISTS "Admin and accountant can insert salla orders" ON salla_orders;
CREATE POLICY "Admin and accountant can insert salla orders" ON salla_orders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Admin and accountant can update salla orders" ON salla_orders;
CREATE POLICY "Admin and accountant can update salla orders" ON salla_orders
  FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Only admin can delete salla orders" ON salla_orders;
CREATE POLICY "Only admin can delete salla orders" ON salla_orders
  FOR DELETE
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  );

-- Salla order items table
DROP POLICY IF EXISTS "Admin and accountant can insert salla order items" ON salla_order_items;
CREATE POLICY "Admin and accountant can insert salla order items" ON salla_order_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Admin and accountant can update salla order items" ON salla_order_items;
CREATE POLICY "Admin and accountant can update salla order items" ON salla_order_items
  FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Only admin can delete salla order items" ON salla_order_items;
CREATE POLICY "Only admin can delete salla order items" ON salla_order_items
  FOR DELETE
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  );

-- Wastage table
DROP POLICY IF EXISTS "Admin and accountant can insert wastage" ON wastage;
CREATE POLICY "Admin and accountant can insert wastage" ON wastage
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Admin and accountant can update wastage" ON wastage;
CREATE POLICY "Admin and accountant can update wastage" ON wastage
  FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'accountant', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Only admin can delete wastage" ON wastage;
CREATE POLICY "Only admin can delete wastage" ON wastage
  FOR DELETE
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  );

-- Partner settlements table
DROP POLICY IF EXISTS "Admins can view partner settlements" ON partner_settlements;
CREATE POLICY "Admins can view partner settlements" ON partner_settlements
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Admins can insert partner settlements" ON partner_settlements;
CREATE POLICY "Admins can insert partner settlements" ON partner_settlements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Admins can update partner settlements" ON partner_settlements;
CREATE POLICY "Admins can update partner settlements" ON partner_settlements
  FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Admins can delete partner settlements" ON partner_settlements;
CREATE POLICY "Admins can delete partner settlements" ON partner_settlements
  FOR DELETE
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    )
  );

-- SMS logs table
DROP POLICY IF EXISTS "Authenticated users can insert SMS logs" ON sms_logs;
CREATE POLICY "Authenticated users can insert SMS logs" ON sms_logs
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);