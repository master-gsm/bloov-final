/*
  # إنشاء جدول دفعات التصفية بين الشركاء

  ## الجداول الجديدة
    - `partner_settlements` - جدول دفعات التصفية بين الشركاء
      - `id` (uuid, primary key)
      - `from_partner_id` (uuid, foreign key to partners)
      - `to_partner_id` (uuid, foreign key to partners)
      - `amount` (numeric, المبلغ)
      - `description` (text, الوصف)
      - `description_ar` (text, الوصف بالعربي)
      - `settlement_date` (date, تاريخ الدفعة)
      - `created_by` (uuid, foreign key to auth.users)
      - `created_at` (timestamptz)

  ## الأمان
    - تفعيل RLS على الجدول
    - إضافة صلاحيات للمسؤول فقط
*/

-- إنشاء جدول دفعات التصفية بين الشركاء
CREATE TABLE IF NOT EXISTS partner_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  to_partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  description_ar text,
  settlement_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT different_partners CHECK (from_partner_id != to_partner_id)
);

-- إضافة فهرس على from_partner_id
CREATE INDEX IF NOT EXISTS idx_partner_settlements_from_partner 
  ON partner_settlements(from_partner_id);

-- إضافة فهرس على to_partner_id
CREATE INDEX IF NOT EXISTS idx_partner_settlements_to_partner 
  ON partner_settlements(to_partner_id);

-- إضافة فهرس على تاريخ التصفية
CREATE INDEX IF NOT EXISTS idx_partner_settlements_date 
  ON partner_settlements(settlement_date);

-- تفعيل RLS
ALTER TABLE partner_settlements ENABLE ROW LEVEL SECURITY;

-- صلاحية القراءة للمسؤول فقط
CREATE POLICY "Admins can view partner settlements"
  ON partner_settlements FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- صلاحية الإضافة للمسؤول فقط
CREATE POLICY "Admins can insert partner settlements"
  ON partner_settlements FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- صلاحية التحديث للمسؤول فقط
CREATE POLICY "Admins can update partner settlements"
  ON partner_settlements FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- صلاحية الحذف للمسؤول فقط
CREATE POLICY "Admins can delete partner settlements"
  ON partner_settlements FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );