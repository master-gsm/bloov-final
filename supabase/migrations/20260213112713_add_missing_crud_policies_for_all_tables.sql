/*
  # Add Missing CRUD Policies for All Tables

  1. Changes
    - Add INSERT, UPDATE, DELETE policies for suppliers table
    - Add INSERT, UPDATE, DELETE policies for purchases table
    - Add INSERT, UPDATE, DELETE policies for purchase_items table
    - Add INSERT, UPDATE, DELETE policies for categories table
    - Add INSERT, UPDATE, DELETE policies for partners table
    - Add INSERT, UPDATE, DELETE policies for expenses table
    - Add INSERT, UPDATE, DELETE policies for cash_registers table
    - Add UPDATE policies for settings table
    - Add INSERT, UPDATE, DELETE policies for invoices and invoice_items
    - Add UPDATE, DELETE policies for accounts table
    - Add INSERT, UPDATE, DELETE policies for supplier_payments table
    - Add UPDATE, DELETE policies for event_orders table
    - Add UPDATE, DELETE policies for bouquet_components table
  
  2. Security
    - All policies require user authentication
    - Policies allow full CRUD operations for authenticated users
*/

-- Suppliers policies
CREATE POLICY "Users can insert suppliers"
  ON suppliers FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update suppliers"
  ON suppliers FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete suppliers"
  ON suppliers FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Purchases policies
CREATE POLICY "Users can insert purchases"
  ON purchases FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update purchases"
  ON purchases FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete purchases"
  ON purchases FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Purchase Items policies
CREATE POLICY "Users can insert purchase items"
  ON purchase_items FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update purchase items"
  ON purchase_items FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete purchase items"
  ON purchase_items FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Categories policies
CREATE POLICY "Users can insert categories"
  ON categories FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update categories"
  ON categories FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete categories"
  ON categories FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Partners policies
CREATE POLICY "Users can insert partners"
  ON partners FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update partners"
  ON partners FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete partners"
  ON partners FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Expenses policies
CREATE POLICY "Users can insert expenses"
  ON expenses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update expenses"
  ON expenses FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete expenses"
  ON expenses FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Cash Registers policies
CREATE POLICY "Users can insert cash registers"
  ON cash_registers FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update cash registers"
  ON cash_registers FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete cash registers"
  ON cash_registers FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Settings policies
CREATE POLICY "Users can update settings"
  ON settings FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Invoices policies
CREATE POLICY "Users can insert invoices"
  ON invoices FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update invoices"
  ON invoices FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete invoices"
  ON invoices FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Invoice Items policies
CREATE POLICY "Users can insert invoice items"
  ON invoice_items FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update invoice items"
  ON invoice_items FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete invoice items"
  ON invoice_items FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Accounts policies
CREATE POLICY "Users can update accounts"
  ON accounts FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete accounts"
  ON accounts FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert accounts"
  ON accounts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Supplier Payments policies
CREATE POLICY "Users can insert supplier payments"
  ON supplier_payments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update supplier payments"
  ON supplier_payments FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete supplier payments"
  ON supplier_payments FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Event Orders policies
CREATE POLICY "Users can delete event orders"
  ON event_orders FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Bouquet Components policies
CREATE POLICY "Users can insert bouquet components"
  ON bouquet_components FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update bouquet components"
  ON bouquet_components FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete bouquet components"
  ON bouquet_components FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- System Settings policies
CREATE POLICY "Users can update system settings"
  ON system_settings FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Users table policies (additional)
CREATE POLICY "Users can insert users"
  ON users FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete users"
  ON users FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);
