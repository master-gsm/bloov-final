/*
  # إنشاء نظام إدارة الهالك (Wastage Management System)

  ## الوصف
  هذا الـ migration ينشئ نظام إدارة الهالك لتسجيل المنتجات التالفة أو غير القابلة للبيع.

  ## الجدول الجديد

  ### `wastage` - جدول الهالك
  يحتوي على:
  - `id` - معرف فريد
  - `wastage_number` - رقم الهالك (تسلسلي)
  - `product_id` - المنتج
  - `quantity` - الكمية التالفة
  - `unit_cost` - تكلفة الوحدة (من سعر الشراء)
  - `total_cost` - التكلفة الإجمالية
  - `reason` - سبب الهالك
  - `reason_ar` - سبب الهالك بالعربية
  - `notes` - ملاحظات
  - `recorded_by` - المستخدم الذي سجل الهالك
  - `recorded_at` - تاريخ التسجيل

  ## التأثير على المخزون
  - عند تسجيل هالك، يتم خصم الكمية تلقائياً من المخزون عبر trigger

  ## التأثير على الأرباح
  - التكلفة الإجمالية للهالك تظهر كخسارة في تقارير الأرباح والخسائر

  ## الأمان (RLS)
  - Admin والـ Accountant يمكنهم إدارة الهالك
  - Viewer يمكنه القراءة فقط
*/

-- إنشاء جدول الهالك
CREATE TABLE IF NOT EXISTS wastage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wastage_number TEXT UNIQUE NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity DECIMAL(12,3) NOT NULL CHECK (quantity > 0),
  unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_cost DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  reason TEXT NOT NULL,
  reason_ar TEXT,
  notes TEXT,
  recorded_by UUID NOT NULL REFERENCES auth.users(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- إنشاء فهارس لتحسين الأداء
CREATE INDEX IF NOT EXISTS idx_wastage_product_id ON wastage(product_id);
CREATE INDEX IF NOT EXISTS idx_wastage_recorded_at ON wastage(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_wastage_recorded_by ON wastage(recorded_by);

-- تفعيل Row Level Security
ALTER TABLE wastage ENABLE ROW LEVEL SECURITY;

-- سياسات الوصول لجدول wastage

-- القراءة: جميع المستخدمين المصرح لهم
CREATE POLICY "Authenticated users can view wastage"
  ON wastage FOR SELECT
  TO authenticated
  USING (true);

-- الإدخال: Admin و Accountant فقط
CREATE POLICY "Admin and accountant can insert wastage"
  ON wastage FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'accountant')
    )
  );

-- التحديث: Admin و Accountant فقط (خلال نفس اليوم فقط)
CREATE POLICY "Admin and accountant can update wastage"
  ON wastage FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'accountant')
    )
    AND DATE(recorded_at) = CURRENT_DATE
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'accountant')
    )
  );

-- الحذف: Admin فقط (خلال نفس اليوم فقط)
CREATE POLICY "Only admin can delete wastage"
  ON wastage FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
    AND DATE(recorded_at) = CURRENT_DATE
  );

-- دالة لتوليد رقم الهالك التلقائي
CREATE OR REPLACE FUNCTION generate_wastage_number()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  wastage_num TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(wastage_number FROM 'WS-([0-9]+)') AS INTEGER)), 0) + 1
  INTO next_num
  FROM wastage;
  
  wastage_num := 'WS-' || LPAD(next_num::TEXT, 6, '0');
  RETURN wastage_num;
END;
$$ LANGUAGE plpgsql;

-- دالة وtrigger لخصم الكمية من المخزون تلقائياً
CREATE OR REPLACE FUNCTION deduct_wastage_from_inventory()
RETURNS TRIGGER AS $$
BEGIN
  -- خصم الكمية من المخزون
  UPDATE inventory
  SET quantity = quantity - NEW.quantity
  WHERE product_id = NEW.product_id;
  
  -- التحقق من أن الكمية لم تصبح سالبة
  IF NOT FOUND OR (SELECT quantity FROM inventory WHERE product_id = NEW.product_id) < 0 THEN
    RAISE EXCEPTION 'Insufficient inventory for product';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER wastage_deduct_inventory
  AFTER INSERT ON wastage
  FOR EACH ROW
  EXECUTE FUNCTION deduct_wastage_from_inventory();

-- دالة لإرجاع الكمية للمخزون عند حذف الهالك
CREATE OR REPLACE FUNCTION restore_wastage_to_inventory()
RETURNS TRIGGER AS $$
BEGIN
  -- إرجاع الكمية للمخزون
  UPDATE inventory
  SET quantity = quantity + OLD.quantity
  WHERE product_id = OLD.product_id;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER wastage_restore_inventory
  BEFORE DELETE ON wastage
  FOR EACH ROW
  EXECUTE FUNCTION restore_wastage_to_inventory();

-- دالة لحساب تكلفة الهالك الإجمالية لفترة معينة
CREATE OR REPLACE FUNCTION calculate_wastage_cost(start_date DATE, end_date DATE)
RETURNS DECIMAL AS $$
DECLARE
  total_wastage_cost DECIMAL;
BEGIN
  SELECT COALESCE(SUM(total_cost), 0)
  INTO total_wastage_cost
  FROM wastage
  WHERE DATE(recorded_at) >= start_date
    AND DATE(recorded_at) <= end_date;
  
  RETURN total_wastage_cost;
END;
$$ LANGUAGE plpgsql;
