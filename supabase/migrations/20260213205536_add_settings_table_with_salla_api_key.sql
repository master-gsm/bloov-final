/*
  # إنشاء جدول الإعدادات العامة

  1. جدول جديد
    - `settings` - جدول لتخزين الإعدادات العامة للنظام
      - `id` (integer, primary key) - مفتاح أساسي ثابت = 1
      - `salla_api_key` (text, nullable) - مفتاح API لربط متجر سلة
      - `created_at` (timestamptz) - تاريخ الإنشاء
      - `updated_at` (timestamptz) - تاريخ آخر تحديث

  2. الأمان
    - تفعيل RLS على جدول settings
    - سياسات قراءة للمستخدمين المصرح لهم (admin, accountant)
    - سياسات تحديث للمسؤولين فقط (admin)
    - استخدام check constraint للتأكد من وجود صف واحد فقط

  3. ملاحظات مهمة
    - يحتوي الجدول على صف واحد فقط بـ id = 1
    - يتم استخدام upsert لتحديث الإعدادات
*/

-- إنشاء جدول الإعدادات
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  salla_api_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- إدراج صف افتراضي
INSERT INTO settings (id, salla_api_key)
VALUES (1, NULL)
ON CONFLICT (id) DO NOTHING;

-- تفعيل Row Level Security
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- سياسة القراءة: Admin و Accountant فقط
CREATE POLICY "Admin and accountant can view settings"
  ON settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'accountant')
    )
  );

-- سياسة التحديث: Admin فقط
CREATE POLICY "Admin can update settings"
  ON settings FOR UPDATE
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

-- Trigger لتحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION update_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW
  EXECUTE FUNCTION update_settings_updated_at();
