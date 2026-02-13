/*
  # إنشاء نظام الصندوق والورديات (Cash Register & Shifts System)

  ## الوصف
  هذا الـ migration ينشئ البنية الكاملة لنظام الصندوق ونظام الورديات لتتبع المبيعات النقدية والمعاملات.

  ## الجداول الجديدة

  ### 1. `cash_shifts` - جدول الورديات
  يحتوي على:
  - `id` - معرف فريد
  - `shift_number` - رقم الوردية (تسلسلي)
  - `user_id` - المستخدم الذي فتح الوردية
  - `opening_balance` - الرصيد الافتتاحي
  - `expected_balance` - الرصيد المتوقع (محسوب)
  - `actual_balance` - الرصيد الفعلي (عند الإغلاق)
  - `difference` - الفرق بين المتوقع والفعلي
  - `status` - حالة الوردية (open/closed)
  - `opened_at` - وقت الفتح
  - `closed_at` - وقت الإغلاق
  - `notes` - ملاحظات

  ### 2. `cash_transactions` - جدول المعاملات النقدية
  يحتوي على:
  - `id` - معرف فريد
  - `shift_id` - ربط مع الوردية
  - `transaction_type` - نوع المعاملة (sale/withdrawal/deposit/expense)
  - `amount` - المبلغ
  - `reference_id` - معرف مرجعي (مثل sale_id)
  - `reference_type` - نوع المرجع (sales/expenses/manual)
  - `description` - الوصف
  - `created_by` - المستخدم الذي أنشأ المعاملة
  - `created_at` - وقت الإنشاء

  ## الأمان (RLS)
  - Admin والـ Accountant يمكنهم إدارة الورديات
  - Viewer يمكنه القراءة فقط
  - كل المستخدمين يمكنهم رؤية البيانات
*/

-- إنشاء جدول الورديات
CREATE TABLE IF NOT EXISTS cash_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_number TEXT UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  opening_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  expected_balance DECIMAL(12,2) DEFAULT 0,
  actual_balance DECIMAL(12,2) DEFAULT NULL,
  difference DECIMAL(12,2) DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ DEFAULT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- إنشاء جدول المعاملات النقدية
CREATE TABLE IF NOT EXISTS cash_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES cash_shifts(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('sale', 'withdrawal', 'deposit', 'expense')),
  amount DECIMAL(12,2) NOT NULL,
  reference_id UUID DEFAULT NULL,
  reference_type TEXT DEFAULT NULL CHECK (reference_type IS NULL OR reference_type IN ('sales', 'expenses', 'manual')),
  description TEXT,
  description_ar TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- إنشاء الفهارس لتحسين الأداء
CREATE INDEX IF NOT EXISTS idx_cash_shifts_user_id ON cash_shifts(user_id);
CREATE INDEX IF NOT EXISTS idx_cash_shifts_status ON cash_shifts(status);
CREATE INDEX IF NOT EXISTS idx_cash_shifts_opened_at ON cash_shifts(opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_shift_id ON cash_transactions(shift_id);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_reference ON cash_transactions(reference_id, reference_type);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_created_at ON cash_transactions(created_at DESC);

-- تفعيل Row Level Security
ALTER TABLE cash_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_transactions ENABLE ROW LEVEL SECURITY;

-- سياسات الوصول لجدول cash_shifts

-- القراءة: جميع المستخدمين المصرح لهم
CREATE POLICY "Authenticated users can view cash shifts"
  ON cash_shifts FOR SELECT
  TO authenticated
  USING (true);

-- الإدخال: Admin و Accountant فقط
CREATE POLICY "Admin and accountant can insert cash shifts"
  ON cash_shifts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'accountant')
    )
  );

-- التحديث: Admin و Accountant فقط
CREATE POLICY "Admin and accountant can update cash shifts"
  ON cash_shifts FOR UPDATE
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

-- الحذف: Admin فقط
CREATE POLICY "Only admin can delete cash shifts"
  ON cash_shifts FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- سياسات الوصول لجدول cash_transactions

-- القراءة: جميع المستخدمين المصرح لهم
CREATE POLICY "Authenticated users can view cash transactions"
  ON cash_transactions FOR SELECT
  TO authenticated
  USING (true);

-- الإدخال: Admin و Accountant فقط
CREATE POLICY "Admin and accountant can insert cash transactions"
  ON cash_transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'accountant')
    )
  );

-- التحديث: Admin و Accountant فقط
CREATE POLICY "Admin and accountant can update cash transactions"
  ON cash_transactions FOR UPDATE
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

-- الحذف: Admin فقط
CREATE POLICY "Only admin can delete cash transactions"
  ON cash_transactions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- دالة لتوليد رقم الوردية التلقائي
CREATE OR REPLACE FUNCTION generate_shift_number()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  shift_num TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(shift_number FROM 'SH-([0-9]+)') AS INTEGER)), 0) + 1
  INTO next_num
  FROM cash_shifts;
  
  shift_num := 'SH-' || LPAD(next_num::TEXT, 6, '0');
  RETURN shift_num;
END;
$$ LANGUAGE plpgsql;

-- دالة لحساب الرصيد المتوقع للوردية
CREATE OR REPLACE FUNCTION calculate_shift_expected_balance(shift_id_param UUID)
RETURNS DECIMAL AS $$
DECLARE
  opening_bal DECIMAL;
  transactions_sum DECIMAL;
BEGIN
  SELECT opening_balance INTO opening_bal
  FROM cash_shifts
  WHERE id = shift_id_param;
  
  SELECT COALESCE(
    SUM(CASE
      WHEN transaction_type IN ('sale', 'deposit') THEN amount
      WHEN transaction_type IN ('withdrawal', 'expense') THEN -amount
      ELSE 0
    END), 0
  ) INTO transactions_sum
  FROM cash_transactions
  WHERE shift_id = shift_id_param;
  
  RETURN opening_bal + transactions_sum;
END;
$$ LANGUAGE plpgsql;

-- Trigger لتحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION update_cash_shifts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cash_shifts_updated_at
  BEFORE UPDATE ON cash_shifts
  FOR EACH ROW
  EXECUTE FUNCTION update_cash_shifts_updated_at();
