/*
  # إصلاح عرض البيانات للسوبر أدمن
  
  ## المشكلة:
  - السوبر أدمن لا يرى البيانات بسبب تعارض في RLS Policies
  
  ## الحل:
  - تحديث جميع الـ SELECT policies لإعطاء السوبر أدمن والمراقب أولوية في المشاهدة
  - تبسيط الـ policies وإزالة التعقيد
*/

-- =====================================================
-- 1. إصلاح policies جدول Sales
-- =====================================================

-- حذف الـ policies الزائدة
DROP POLICY IF EXISTS "Authenticated users can view sales" ON sales;
DROP POLICY IF EXISTS "Observer can view sales" ON sales;

-- تحديث policy المشاهدة الأساسية
DROP POLICY IF EXISTS "Users can view sales from their branch" ON sales;
CREATE POLICY "Users can view sales from their branch"
  ON sales FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('super_admin', 'observer', 'viewer')
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
    OR branch_id IS NULL
  );

-- =====================================================
-- 2. إصلاح policies جدول Products
-- =====================================================

DROP POLICY IF EXISTS "Users can view products" ON products;
DROP POLICY IF EXISTS "Observer can view products" ON products;

CREATE POLICY "Users can view products"
  ON products FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- =====================================================
-- 3. إصلاح policies جدول Customers  
-- =====================================================

DROP POLICY IF EXISTS "Users can view customers" ON customers;
DROP POLICY IF EXISTS "Observer can view customers" ON customers;

CREATE POLICY "Users can view customers"
  ON customers FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('super_admin', 'observer', 'viewer')
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
    OR branch_id IS NULL
  );

-- =====================================================
-- 4. إصلاح policies جدول Purchases
-- =====================================================

DROP POLICY IF EXISTS "Users can view purchases from their branch" ON purchases;
DROP POLICY IF EXISTS "Observer can view purchases" ON purchases;

CREATE POLICY "Users can view purchases from their branch"
  ON purchases FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('super_admin', 'observer', 'viewer')
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
    OR branch_id IS NULL
  );

-- =====================================================
-- 5. إصلاح policies جدول Inventory
-- =====================================================

DROP POLICY IF EXISTS "Users can view inventory in their branch" ON inventory;
DROP POLICY IF EXISTS "Observer can view inventory" ON inventory;

CREATE POLICY "Users can view inventory in their branch"
  ON inventory FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('super_admin', 'observer', 'viewer')
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
    OR branch_id IS NULL
  );

-- =====================================================
-- 6. إصلاح policies جدول Suppliers
-- =====================================================

DROP POLICY IF EXISTS "Users can view suppliers" ON suppliers;
DROP POLICY IF EXISTS "Observer can view suppliers" ON suppliers;

CREATE POLICY "Users can view suppliers"
  ON suppliers FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- =====================================================
-- 7. إصلاح policies جدول Operating Expenses
-- =====================================================

DROP POLICY IF EXISTS "Users can view operating expenses in their branch" ON operating_expenses;
DROP POLICY IF EXISTS "Observer can view expenses" ON operating_expenses;

CREATE POLICY "Users can view operating expenses in their branch"
  ON operating_expenses FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('super_admin', 'observer', 'viewer')
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
    OR branch_id IS NULL
  );

-- =====================================================
-- 8. إصلاح policies جدول Partners
-- =====================================================

DROP POLICY IF EXISTS "Authenticated users can view partners" ON partners;
DROP POLICY IF EXISTS "Observer can view partners" ON partners;

CREATE POLICY "Users can view partners"
  ON partners FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- =====================================================
-- 9. إصلاح policies جدول Branches
-- =====================================================

DROP POLICY IF EXISTS "Users can view branches" ON branches;
DROP POLICY IF EXISTS "Observer can view branches" ON branches;

CREATE POLICY "Users can view branches"
  ON branches FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('super_admin', 'observer', 'admin')
    OR id = (SELECT branch_id FROM users WHERE id = auth.uid())
  );

-- =====================================================
-- 10. إصلاح policies جدول Settings
-- =====================================================

DROP POLICY IF EXISTS "Admins can view settings" ON settings;
DROP POLICY IF EXISTS "Observer can view settings" ON settings;

CREATE POLICY "Users can view settings"
  ON settings FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- =====================================================
-- 11. إصلاح policies جدول Cash Shifts
-- =====================================================

DROP POLICY IF EXISTS "Users can view cash shifts in their branch" ON cash_shifts;
DROP POLICY IF EXISTS "Observer can view cash shifts" ON cash_shifts;

CREATE POLICY "Users can view cash shifts in their branch"
  ON cash_shifts FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('super_admin', 'observer', 'viewer')
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
    OR branch_id IS NULL
  );

-- =====================================================
-- 12. إصلاح policies جدول Cash Transactions
-- =====================================================

DROP POLICY IF EXISTS "Users can view cash transactions in their branch" ON cash_transactions;
DROP POLICY IF EXISTS "Observer can view cash transactions" ON cash_transactions;

CREATE POLICY "Users can view cash transactions in their branch"
  ON cash_transactions FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('super_admin', 'observer', 'viewer')
    OR branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
    OR branch_id IS NULL
  );
