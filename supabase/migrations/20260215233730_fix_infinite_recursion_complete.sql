/*
  # إصلاح Infinite Recursion - حل نهائي
  
  ## المشكلة:
  - infinite recursion في policies جدول users
  
  ## الحل:
  1. حذف جميع الدوال والـ policies القديمة
  2. إنشاء دوال جديدة مع SECURITY DEFINER
  3. إعادة بناء جميع الـ policies بشكل صحيح
*/

-- =====================================================
-- الخطوة 1: حذف الدوال القديمة (مع CASCADE)
-- =====================================================

DROP FUNCTION IF EXISTS get_my_role() CASCADE;
DROP FUNCTION IF EXISTS is_super_admin() CASCADE;
DROP FUNCTION IF EXISTS get_user_branch_id() CASCADE;

-- =====================================================
-- الخطوة 2: حذف جميع policies الموجودة
-- =====================================================

-- Users policies
DROP POLICY IF EXISTS "Anyone authenticated can view users" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;

-- Sales policies
DROP POLICY IF EXISTS "Users can view sales from their branch" ON sales;

-- Products policies
DROP POLICY IF EXISTS "Users can view products" ON products;

-- Customers policies
DROP POLICY IF EXISTS "Users can view customers" ON customers;

-- Purchases policies
DROP POLICY IF EXISTS "Users can view purchases from their branch" ON purchases;

-- Inventory policies
DROP POLICY IF EXISTS "Users can view inventory in their branch" ON inventory;

-- Suppliers policies
DROP POLICY IF EXISTS "Users can view suppliers" ON suppliers;

-- Operating Expenses policies
DROP POLICY IF EXISTS "Users can view operating expenses in their branch" ON operating_expenses;

-- Partners policies
DROP POLICY IF EXISTS "Users can view partners" ON partners;

-- Branches policies
DROP POLICY IF EXISTS "Users can view branches" ON branches;

-- Settings policies
DROP POLICY IF EXISTS "Users can view settings" ON settings;

-- Cash Shifts policies
DROP POLICY IF EXISTS "Users can view cash shifts in their branch" ON cash_shifts;

-- Cash Transactions policies
DROP POLICY IF EXISTS "Users can view cash transactions in their branch" ON cash_transactions;

-- =====================================================
-- الخطوة 3: إنشاء الدوال الجديدة مع SECURITY DEFINER
-- =====================================================

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM users WHERE id = auth.uid() AND is_active = true LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'super_admin'
    AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION get_user_branch_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT branch_id FROM users WHERE id = auth.uid() AND is_active = true LIMIT 1;
$$;

-- =====================================================
-- الخطوة 4: إنشاء policies جدول Users (بسيطة بدون تكرار!)
-- =====================================================

-- السماح لجميع المستخدمين برؤية بيانات Users
CREATE POLICY "Anyone authenticated can view users"
  ON users FOR SELECT
  TO authenticated
  USING (true);

-- السماح للمستخدمين بتحديث ملفهم الشخصي فقط
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- =====================================================
-- الخطوة 5: إنشاء policies باقي الجداول
-- =====================================================

-- ========== SALES ==========
CREATE POLICY "Users can view sales from their branch"
  ON sales FOR SELECT
  TO authenticated
  USING (
    get_my_role() IN ('super_admin', 'observer', 'viewer')
    OR branch_id = get_user_branch_id()
    OR branch_id IS NULL
  );

-- ========== PRODUCTS ==========
CREATE POLICY "Users can view products"
  ON products FOR SELECT
  TO authenticated
  USING (true);

-- ========== CUSTOMERS ==========
CREATE POLICY "Users can view customers"
  ON customers FOR SELECT
  TO authenticated
  USING (
    get_my_role() IN ('super_admin', 'observer', 'viewer')
    OR branch_id = get_user_branch_id()
    OR branch_id IS NULL
  );

-- ========== PURCHASES ==========
CREATE POLICY "Users can view purchases from their branch"
  ON purchases FOR SELECT
  TO authenticated
  USING (
    get_my_role() IN ('super_admin', 'observer', 'viewer')
    OR branch_id = get_user_branch_id()
    OR branch_id IS NULL
  );

-- ========== INVENTORY ==========
CREATE POLICY "Users can view inventory in their branch"
  ON inventory FOR SELECT
  TO authenticated
  USING (
    get_my_role() IN ('super_admin', 'observer', 'viewer')
    OR branch_id = get_user_branch_id()
    OR branch_id IS NULL
  );

-- ========== SUPPLIERS ==========
CREATE POLICY "Users can view suppliers"
  ON suppliers FOR SELECT
  TO authenticated
  USING (true);

-- ========== OPERATING EXPENSES ==========
CREATE POLICY "Users can view operating expenses in their branch"
  ON operating_expenses FOR SELECT
  TO authenticated
  USING (
    get_my_role() IN ('super_admin', 'observer', 'viewer')
    OR branch_id = get_user_branch_id()
    OR branch_id IS NULL
  );

-- ========== PARTNERS ==========
CREATE POLICY "Users can view partners"
  ON partners FOR SELECT
  TO authenticated
  USING (true);

-- ========== BRANCHES ==========
CREATE POLICY "Users can view branches"
  ON branches FOR SELECT
  TO authenticated
  USING (
    get_my_role() IN ('super_admin', 'observer', 'admin')
    OR id = get_user_branch_id()
  );

-- ========== SETTINGS ==========
CREATE POLICY "Users can view settings"
  ON settings FOR SELECT
  TO authenticated
  USING (true);

-- ========== CASH SHIFTS ==========
CREATE POLICY "Users can view cash shifts in their branch"
  ON cash_shifts FOR SELECT
  TO authenticated
  USING (
    get_my_role() IN ('super_admin', 'observer', 'viewer')
    OR branch_id = get_user_branch_id()
    OR branch_id IS NULL
  );

-- ========== CASH TRANSACTIONS ==========
CREATE POLICY "Users can view cash transactions in their branch"
  ON cash_transactions FOR SELECT
  TO authenticated
  USING (
    get_my_role() IN ('super_admin', 'observer', 'viewer')
    OR branch_id = get_user_branch_id()
    OR branch_id IS NULL
  );
