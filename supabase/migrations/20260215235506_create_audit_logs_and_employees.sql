/*
  # إنشاء نظام تسجيل الأحداث (Audit Logs) ونظام الموظفين والرواتب

  1. جداول جديدة
    - `audit_logs`: تسجيل جميع الأحداث المهمة (reset, delete, critical changes)
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to users)
      - `action` (text): نوع العملية (reset_database, delete_sale, etc.)
      - `table_name` (text): اسم الجدول المتأثر
      - `record_id` (uuid): معرف السجل المتأثر
      - `branch_id` (uuid): الفرع
      - `old_data` (jsonb): البيانات القديمة
      - `new_data` (jsonb): البيانات الجديدة
      - `records_affected` (integer): عدد السجلات المتأثرة
      - `ip_address` (text): عنوان IP
      - `metadata` (jsonb): بيانات إضافية
      - `created_at` (timestamptz)

    - `employees`: بيانات الموظفين
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to users - optional)
      - `full_name` (text)
      - `phone` (text)
      - `email` (text)
      - `national_id` (text)
      - `position` (text): المنصب
      - `department` (text): القسم
      - `branch_id` (uuid, foreign key to branches)
      - `hire_date` (date)
      - `basic_salary` (decimal)
      - `commission_rate` (decimal): نسبة العمولة من المبيعات
      - `is_active` (boolean)
      - `employment_type` (text): full_time, part_time, contract
      - `notes` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `salary_payments`: دفعات الرواتب
      - `id` (uuid, primary key)
      - `employee_id` (uuid, foreign key to employees)
      - `branch_id` (uuid)
      - `payment_date` (date)
      - `period_start` (date): بداية فترة الراتب
      - `period_end` (date): نهاية فترة الراتب
      - `basic_amount` (decimal): الراتب الأساسي
      - `commission_amount` (decimal): العمولات
      - `bonus` (decimal): مكافآت
      - `deductions` (decimal): خصومات
      - `total_amount` (decimal): الإجمالي
      - `payment_method` (text): cash, bank_transfer, check
      - `notes` (text)
      - `created_by` (uuid)
      - `created_at` (timestamptz)

    - `employee_commissions`: تفاصيل العمولات
      - `id` (uuid, primary key)
      - `employee_id` (uuid)
      - `sale_id` (uuid, foreign key to sales)
      - `commission_rate` (decimal)
      - `sale_amount` (decimal)
      - `commission_amount` (decimal)
      - `payment_id` (uuid, foreign key to salary_payments - nullable)
      - `is_paid` (boolean)
      - `created_at` (timestamptz)

  2. Security
    - تفعيل RLS على جميع الجداول
    - صلاحيات Admin للقراءة والكتابة
    - صلاحيات محدودة للأدوار الأخرى
*/

-- جدول تسجيل الأحداث (Audit Logs)
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  table_name text,
  record_id uuid,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  old_data jsonb,
  new_data jsonb,
  records_affected integer DEFAULT 0,
  ip_address text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_branch ON audit_logs(branch_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Admin و Accountant يشوفون جميع السجلات
CREATE POLICY "Admins and accountants can view all audit logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'accountant')
    )
  );

-- فقط الـ Admin يقدر يضيف سجلات
CREATE POLICY "Only admins can insert audit logs"
  ON audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- جدول الموظفين
CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL UNIQUE,
  full_name text NOT NULL,
  phone text,
  email text,
  national_id text,
  position text,
  department text,
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE NOT NULL,
  hire_date date DEFAULT CURRENT_DATE,
  basic_salary decimal(15, 2) DEFAULT 0,
  commission_rate decimal(5, 2) DEFAULT 0,
  is_active boolean DEFAULT true,
  employment_type text DEFAULT 'full_time' CHECK (employment_type IN ('full_time', 'part_time', 'contract')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employees_branch ON employees(branch_id);
CREATE INDEX IF NOT EXISTS idx_employees_user ON employees(user_id);
CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(is_active);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- Admin يشوف جميع الموظفين
CREATE POLICY "Admins can view all employees"
  ON employees FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Admin يضيف موظفين
CREATE POLICY "Admins can insert employees"
  ON employees FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Admin يعدل موظفين
CREATE POLICY "Admins can update employees"
  ON employees FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Admin يحذف موظفين
CREATE POLICY "Admins can delete employees"
  ON employees FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- جدول دفعات الرواتب
CREATE TABLE IF NOT EXISTS salary_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE NOT NULL,
  payment_date date DEFAULT CURRENT_DATE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  basic_amount decimal(15, 2) DEFAULT 0,
  commission_amount decimal(15, 2) DEFAULT 0,
  bonus decimal(15, 2) DEFAULT 0,
  deductions decimal(15, 2) DEFAULT 0,
  total_amount decimal(15, 2) NOT NULL,
  payment_method text DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank_transfer', 'check')),
  notes text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_salary_payments_employee ON salary_payments(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_payments_branch ON salary_payments(branch_id);
CREATE INDEX IF NOT EXISTS idx_salary_payments_date ON salary_payments(payment_date DESC);

ALTER TABLE salary_payments ENABLE ROW LEVEL SECURITY;

-- Admin يشوف جميع الرواتب
CREATE POLICY "Admins can view all salary payments"
  ON salary_payments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Admin يضيف رواتب
CREATE POLICY "Admins can insert salary payments"
  ON salary_payments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Admin يعدل رواتب
CREATE POLICY "Admins can update salary payments"
  ON salary_payments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- جدول عمولات الموظفين
CREATE TABLE IF NOT EXISTS employee_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
  sale_id uuid REFERENCES sales(id) ON DELETE CASCADE NOT NULL,
  commission_rate decimal(5, 2) NOT NULL,
  sale_amount decimal(15, 2) NOT NULL,
  commission_amount decimal(15, 2) NOT NULL,
  payment_id uuid REFERENCES salary_payments(id) ON DELETE SET NULL,
  is_paid boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_commissions_employee ON employee_commissions(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_commissions_sale ON employee_commissions(sale_id);
CREATE INDEX IF NOT EXISTS idx_employee_commissions_payment ON employee_commissions(payment_id);
CREATE INDEX IF NOT EXISTS idx_employee_commissions_paid ON employee_commissions(is_paid);

ALTER TABLE employee_commissions ENABLE ROW LEVEL SECURITY;

-- Admin يشوف جميع العمولات
CREATE POLICY "Admins can view all employee commissions"
  ON employee_commissions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Admin يضيف عمولات
CREATE POLICY "Admins can insert employee commissions"
  ON employee_commissions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Admin يعدل عمولات
CREATE POLICY "Admins can update employee commissions"
  ON employee_commissions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Trigger لتحديث updated_at
CREATE OR REPLACE FUNCTION update_employees_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS employees_updated_at_trigger ON employees;
CREATE TRIGGER employees_updated_at_trigger
  BEFORE UPDATE ON employees
  FOR EACH ROW
  EXECUTE FUNCTION update_employees_updated_at();
