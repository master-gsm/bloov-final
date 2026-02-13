/*
  # إضافة جدول المصاريف التشغيلية وتصنيف دفعات الشركاء

  ## الجداول الجديدة
    - `operating_expenses` - جدول المصاريف التشغيلية (غير المشتريات)
      - `id` (uuid, primary key)
      - `expense_number` (text, رقم المصروف)
      - `expense_type` (text, نوع المصروف: إقامات، كفالات، فواتير، مخالفات، إلخ)
      - `description` (text, الوصف)
      - `description_ar` (text, الوصف بالعربي)
      - `amount` (numeric, المبلغ)
      - `expense_date` (date, تاريخ المصروف)
      - `payment_method` (text, طريقة الدفع)
      - `notes` (text, ملاحظات)
      - `notes_ar` (text, ملاحظات بالعربي)
      - `created_by` (uuid, foreign key to auth.users)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  ## التعديلات على الجداول الموجودة
    - إضافة عمود `contribution_type` إلى جدول `partner_contributions`
      - الأنواع: حكومي، أصول، تشغيلي، آخر

  ## الأمان
    - تفعيل RLS على جدول `operating_expenses`
    - إضافة صلاحيات للمسؤولين والمحاسبين
*/

-- إنشاء جدول المصاريف التشغيلية
CREATE TABLE IF NOT EXISTS operating_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_number text NOT NULL UNIQUE,
  expense_type text NOT NULL,
  description text NOT NULL,
  description_ar text,
  amount numeric NOT NULL DEFAULT 0,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text,
  notes text,
  notes_ar text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- إضافة فهرس على تاريخ المصروف
CREATE INDEX IF NOT EXISTS idx_operating_expenses_expense_date ON operating_expenses(expense_date);

-- إضافة فهرس على نوع المصروف
CREATE INDEX IF NOT EXISTS idx_operating_expenses_expense_type ON operating_expenses(expense_type);

-- إضافة فهرس على رقم المصروف
CREATE INDEX IF NOT EXISTS idx_operating_expenses_expense_number ON operating_expenses(expense_number);

-- إضافة عمود contribution_type إلى جدول partner_contributions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partner_contributions' AND column_name = 'contribution_type'
  ) THEN
    ALTER TABLE partner_contributions ADD COLUMN contribution_type text DEFAULT 'operational';
  END IF;
END $$;

-- تفعيل RLS على جدول operating_expenses
ALTER TABLE operating_expenses ENABLE ROW LEVEL SECURITY;

-- صلاحية القراءة للجميع المصادقين
CREATE POLICY "Authenticated users can view operating expenses"
  ON operating_expenses FOR SELECT
  TO authenticated
  USING (true);

-- صلاحية الإضافة للمسؤول والمحاسب
CREATE POLICY "Admin and accountant can insert operating expenses"
  ON operating_expenses FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'accountant')
    )
  );

-- صلاحية التحديث للمسؤول والمحاسب
CREATE POLICY "Admin and accountant can update operating expenses"
  ON operating_expenses FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'accountant')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'accountant')
    )
  );

-- صلاحية الحذف للمسؤول فقط
CREATE POLICY "Admin can delete operating expenses"
  ON operating_expenses FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- إنشاء دالة لتحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION update_operating_expenses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- إنشاء trigger لتحديث updated_at
DROP TRIGGER IF EXISTS operating_expenses_updated_at ON operating_expenses;
CREATE TRIGGER operating_expenses_updated_at
  BEFORE UPDATE ON operating_expenses
  FOR EACH ROW
  EXECUTE FUNCTION update_operating_expenses_updated_at();

-- إنشاء دالة لتوليد رقم المصروف التلقائي
CREATE OR REPLACE FUNCTION generate_expense_number()
RETURNS text AS $$
DECLARE
  next_num integer;
  expense_num text;
BEGIN
  SELECT COUNT(*) + 1 INTO next_num FROM operating_expenses;
  expense_num := 'EXP-' || LPAD(next_num::text, 6, '0');
  RETURN expense_num;
END;
$$ LANGUAGE plpgsql;