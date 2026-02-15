/*
  # إزالة Policies المسببة للتكرار اللانهائي في جدول Users
  
  ## المشكلة:
  - Policy "Observer can view users" تستعلم عن جدول users داخل policy الـ users
  - هذا يسبب infinite recursion
  
  ## الحل:
  - حذف جميع الـ policies الزائدة والمتعارضة
  - الإبقاء فقط على policy واحدة بسيطة
*/

-- حذف جميع policies جدول users
DROP POLICY IF EXISTS "Anyone authenticated can view users" ON users;
DROP POLICY IF EXISTS "Anyone can check if users exist" ON users;
DROP POLICY IF EXISTS "Observer can view users" ON users;
DROP POLICY IF EXISTS "Users can view own profile v2" ON users;
DROP POLICY IF EXISTS "Users can update own profile v2" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;

-- إنشاء policy واحدة بسيطة بدون تكرار
CREATE POLICY "Allow all authenticated users to view users"
  ON users FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile only"
  ON users FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
