/*
  # إضافة جدول دفعات التصفية بين الشركاء
  
  ## الوصف
  هذا الجدول يسجل دفعات التصفية المباشرة بين الشركاء لتسوية الأرصدة.
  على سبيل المثال: عندما يدين أنس لسامي بمبلغ 9.20 ريال، يمكن لأنس دفع هذا المبلغ مباشرة لسامي.
  
  ## الجداول الجديدة
  
  ### `partner_settlements`
  - `id` (uuid, primary key): معرف فريد للدفعة
  - `from_partner_id` (uuid, foreign key): الشريك الذي يدفع المبلغ
  - `to_partner_id` (uuid, foreign key): الشريك الذي يستلم المبلغ
  - `amount` (numeric): المبلغ المدفوع
  - `settlement_date` (date): تاريخ التصفية
  - `description` (text): وصف الدفعة
  - `description_ar` (text, optional): وصف الدفعة بالعربية
  - `created_by` (uuid, foreign key): المستخدم الذي أضاف الدفعة
  - `created_at` (timestamp): تاريخ الإنشاء
  
  ## الأمان
  - تفعيل RLS على الجدول
  - سياسات للقراءة والإضافة والحذف للمستخدمين المصرح لهم
*/

-- إنشاء جدول دفعات التصفية بين الشركاء
CREATE TABLE IF NOT EXISTS partner_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  to_partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  amount numeric(15,2) NOT NULL CHECK (amount > 0),
  settlement_date date NOT NULL DEFAULT CURRENT_DATE,
  description text NOT NULL,
  description_ar text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT different_partners CHECK (from_partner_id != to_partner_id)
);

-- تفعيل RLS
ALTER TABLE partner_settlements ENABLE ROW LEVEL SECURITY;

-- سياسة القراءة: جميع المستخدمين المصادقين يمكنهم قراءة دفعات التصفية
CREATE POLICY "Authenticated users can view partner settlements"
  ON partner_settlements
  FOR SELECT
  TO authenticated
  USING (true);

-- سياسة الإضافة: المستخدمون الذين لديهم صلاحية إدارة الشركاء يمكنهم إضافة دفعات تصفية
CREATE POLICY "Users with partners permission can add settlements"
  ON partner_settlements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND (users.role = 'admin' OR users.permissions->>'manage_partners' = 'true')
    )
  );

-- سياسة الحذف: فقط المسؤولون يمكنهم حذف دفعات التصفية
CREATE POLICY "Admins can delete partner settlements"
  ON partner_settlements
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- إنشاء فهرس لتحسين الأداء
CREATE INDEX IF NOT EXISTS idx_partner_settlements_from_partner ON partner_settlements(from_partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_settlements_to_partner ON partner_settlements(to_partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_settlements_date ON partner_settlements(settlement_date);