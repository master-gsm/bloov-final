/*
  # إنشاء نظام الربط مع سلة (Salla Integration System)

  ## الوصف
  هذا الـ migration ينشئ البنية الكاملة لمزامنة مبيعات متجر سلة مع نظام BLOOV.

  ## الجداول الجديدة

  ### 1. `salla_orders` - جدول طلبات سلة
  يحتوي على:
  - `id` - معرف فريد
  - `salla_order_id` - معرف الطلب في سلة
  - `order_number` - رقم الطلب
  - `customer_name` - اسم العميل
  - `customer_phone` - رقم هاتف العميل
  - `customer_email` - بريد العميل
  - `status` - حالة الطلب
  - `subtotal` - المجموع قبل الضريبة
  - `tax` - الضريبة
  - `shipping` - رسوم التوصيل
  - `total` - المجموع الكلي
  - `payment_method` - طريقة الدفع
  - `payment_status` - حالة الدفع
  - `order_date` - تاريخ الطلب
  - `synced_at` - وقت المزامنة
  - `synced` - هل تمت المزامنة مع المخزون

  ### 2. `salla_order_items` - جدول عناصر طلبات سلة
  يحتوي على:
  - `id` - معرف فريد
  - `salla_order_id` - ربط مع الطلب
  - `product_id` - ربط مع المنتج المحلي
  - `product_name` - اسم المنتج
  - `quantity` - الكمية
  - `unit_price` - سعر الوحدة
  - `total` - المجموع

  ## المزامنة
  - عند إضافة طلب جديد، يمكن مزامنة المخزون تلقائياً
  - التقارير تشمل مقارنة بين مبيعات المحل ومبيعات سلة

  ## الأمان (RLS)
  - Admin والـ Accountant يمكنهم إدارة الطلبات
  - Viewer يمكنه القراءة فقط
*/

-- إنشاء جدول طلبات سلة
CREATE TABLE IF NOT EXISTS salla_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salla_order_id TEXT UNIQUE NOT NULL,
  order_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  customer_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'cancelled', 'refunded')),
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax DECIMAL(12,2) NOT NULL DEFAULT 0,
  shipping DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT,
  payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'refunded')),
  shipping_address TEXT,
  shipping_city TEXT,
  notes TEXT,
  order_date TIMESTAMPTZ NOT NULL,
  synced BOOLEAN DEFAULT false,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- إنشاء جدول عناصر طلبات سلة
CREATE TABLE IF NOT EXISTS salla_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salla_order_id UUID NOT NULL REFERENCES salla_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  salla_product_id TEXT,
  product_name TEXT NOT NULL,
  product_name_ar TEXT,
  quantity DECIMAL(12,3) NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(12,2) NOT NULL,
  total DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- إنشاء الفهارس لتحسين الأداء
CREATE INDEX IF NOT EXISTS idx_salla_orders_salla_order_id ON salla_orders(salla_order_id);
CREATE INDEX IF NOT EXISTS idx_salla_orders_status ON salla_orders(status);
CREATE INDEX IF NOT EXISTS idx_salla_orders_order_date ON salla_orders(order_date DESC);
CREATE INDEX IF NOT EXISTS idx_salla_orders_synced ON salla_orders(synced);
CREATE INDEX IF NOT EXISTS idx_salla_order_items_order_id ON salla_order_items(salla_order_id);
CREATE INDEX IF NOT EXISTS idx_salla_order_items_product_id ON salla_order_items(product_id);

-- تفعيل Row Level Security
ALTER TABLE salla_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE salla_order_items ENABLE ROW LEVEL SECURITY;

-- سياسات الوصول لجدول salla_orders

-- القراءة: جميع المستخدمين المصرح لهم
CREATE POLICY "Authenticated users can view salla orders"
  ON salla_orders FOR SELECT
  TO authenticated
  USING (true);

-- الإدخال: Admin و Accountant فقط
CREATE POLICY "Admin and accountant can insert salla orders"
  ON salla_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'accountant')
    )
  );

-- التحديث: Admin و Accountant فقط
CREATE POLICY "Admin and accountant can update salla orders"
  ON salla_orders FOR UPDATE
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
CREATE POLICY "Only admin can delete salla orders"
  ON salla_orders FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- سياسات الوصول لجدول salla_order_items

-- القراءة: جميع المستخدمين المصرح لهم
CREATE POLICY "Authenticated users can view salla order items"
  ON salla_order_items FOR SELECT
  TO authenticated
  USING (true);

-- الإدخال: Admin و Accountant فقط
CREATE POLICY "Admin and accountant can insert salla order items"
  ON salla_order_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'accountant')
    )
  );

-- التحديث: Admin و Accountant فقط
CREATE POLICY "Admin and accountant can update salla order items"
  ON salla_order_items FOR UPDATE
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
CREATE POLICY "Only admin can delete salla order items"
  ON salla_order_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- دالة لمزامنة المخزون عند تأكيد طلب سلة
CREATE OR REPLACE FUNCTION sync_salla_order_to_inventory()
RETURNS TRIGGER AS $$
BEGIN
  -- التحقق من أن الطلب تم تأكيده ولم تتم مزامنته بعد
  IF NEW.status = 'completed' AND NEW.synced = false THEN
    -- خصم الكميات من المخزون لكل منتج في الطلب
    UPDATE inventory i
    SET quantity = i.quantity - soi.quantity
    FROM salla_order_items soi
    WHERE soi.salla_order_id = NEW.id
      AND soi.product_id = i.product_id
      AND soi.product_id IS NOT NULL;
    
    -- تحديث حالة المزامنة
    NEW.synced := true;
    NEW.synced_at := now();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER salla_order_sync_inventory
  BEFORE UPDATE ON salla_orders
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.synced = false)
  EXECUTE FUNCTION sync_salla_order_to_inventory();

-- Trigger لتحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION update_salla_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER salla_orders_updated_at
  BEFORE UPDATE ON salla_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_salla_orders_updated_at();

-- دالة لحساب إجمالي مبيعات سلة لفترة معينة
CREATE OR REPLACE FUNCTION calculate_salla_sales(start_date DATE, end_date DATE)
RETURNS TABLE(
  total_orders BIGINT,
  total_revenue DECIMAL,
  completed_orders BIGINT,
  pending_orders BIGINT,
  cancelled_orders BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_orders,
    COALESCE(SUM(total), 0) AS total_revenue,
    COUNT(*) FILTER (WHERE status = 'completed')::BIGINT AS completed_orders,
    COUNT(*) FILTER (WHERE status IN ('pending', 'processing'))::BIGINT AS pending_orders,
    COUNT(*) FILTER (WHERE status = 'cancelled')::BIGINT AS cancelled_orders
  FROM salla_orders
  WHERE DATE(order_date) >= start_date
    AND DATE(order_date) <= end_date;
END;
$$ LANGUAGE plpgsql;
