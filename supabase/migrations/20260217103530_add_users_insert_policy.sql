/*
  # إضافة INSERT policy على users

  1. المشكلة
    - لا يوجد INSERT policy على users table
    - Edge functions تحتاج INSERT للـ users table

  2. الإصلاح
    - إضافة INSERT policy للـ service role فقط
*/

-- ═══════════════════════════════════════════════════════════
-- Allow service_role to insert users
-- ═══════════════════════════════════════════════════════════

CREATE POLICY "Allow service role to insert users"
  ON users FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════
-- إضافة DELETE policy للـ service role (للتنظيف في حالة الفشل)
-- ═══════════════════════════════════════════════════════════

CREATE POLICY "Allow service role to delete users"
  ON users FOR DELETE
  TO service_role
  USING (true);
