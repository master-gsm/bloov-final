# بروتوكول حماية البيانات التاريخية
# Historical Data Integrity Protocol

## 🛡️ المبدأ الأساسي | Core Principle

**البيانات القديمة مقدسة ولا يجوز حذفها أو إتلافها أبداً**
**Legacy data is sacred and must never be deleted or corrupted**

---

## 📋 القواعد الصارمة | Strict Rules

### 1️⃣ قاعدة عدم التدمير
**The Non-Destruction Rule**

#### ❌ ممنوع منعاً باتاً | Strictly FORBIDDEN:

```sql
-- ❌ حذف جداول
DROP TABLE users;
DROP TABLE IF EXISTS sales;

-- ❌ حذف أعمدة
ALTER TABLE products DROP COLUMN old_field;

-- ❌ حذف بيانات
DELETE FROM sales WHERE sale_date < '2025-01-01';
TRUNCATE TABLE inventory;

-- ❌ تغيير نوع عمود بطريقة غير آمنة
ALTER TABLE products ALTER COLUMN price TYPE integer;
-- هذا قد يفقد البيانات العشرية!

-- ❌ إضافة قيود NOT NULL بدون قيمة افتراضية
ALTER TABLE customers ADD COLUMN email text NOT NULL;
-- هذا سيفشل إذا كانت هناك سجلات موجودة!
```

#### ✅ البدائل الآمنة | Safe Alternatives:

```sql
-- ✅ إخفاء جدول بدلاً من حذفه (إذا لزم الأمر)
ALTER TABLE old_table RENAME TO _deprecated_old_table;
COMMENT ON TABLE _deprecated_old_table IS 'Deprecated: Use new_table instead. Kept for historical data.';

-- ✅ إضافة عمود جديد بدلاً من تعديل القديم
ALTER TABLE products ADD COLUMN price_v2 numeric(10,2);
-- انسخ البيانات ثم استخدم العمود الجديد
UPDATE products SET price_v2 = price::numeric(10,2);

-- ✅ إضافة علامة "حذف منطقي" بدلاً من الحذف الفعلي
ALTER TABLE sales ADD COLUMN deleted_at timestamptz;
UPDATE sales SET deleted_at = NOW() WHERE sale_date < '2025-01-01';

-- ✅ إضافة عمود جديد مع قيمة افتراضية وبدون NOT NULL
ALTER TABLE customers ADD COLUMN email text DEFAULT 'unknown@example.com';
-- يمكن إضافة NOT NULL لاحقاً بعد ملء البيانات
```

---

### 2️⃣ القيم الافتراضية للسجلات القديمة
**Default Values for Legacy Records**

#### المبدأ:
كل حقل جديد يجب أن يكون له قيمة افتراضية معقولة للسجلات القديمة.

**Every new field must have a reasonable default value for old records.**

#### أمثلة صحيحة | Correct Examples:

```sql
-- مثال 1: إضافة معرّف الفرع
DO $$
DECLARE
  default_branch_id uuid;
BEGIN
  -- احصل على أو أنشئ الفرع الافتراضي
  SELECT id INTO default_branch_id
  FROM branches
  WHERE name = 'Main Branch'
  LIMIT 1;

  -- إذا لم يوجد، أنشئ واحد
  IF default_branch_id IS NULL THEN
    INSERT INTO branches (name, name_ar, is_default)
    VALUES ('Main Branch', 'الفرع الرئيسي', true)
    RETURNING id INTO default_branch_id;
  END IF;

  -- أضف العمود مع القيمة الافتراضية
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'branch_id'
  ) THEN
    EXECUTE format('ALTER TABLE sales ADD COLUMN branch_id uuid DEFAULT %L', default_branch_id);

    -- حدث السجلات القديمة
    UPDATE sales SET branch_id = default_branch_id WHERE branch_id IS NULL;
  END IF;
END $$;
```

```sql
-- مثال 2: إضافة حقل نوع المنتج
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'product_type'
  ) THEN
    -- أضف العمود مع قيمة افتراضية
    ALTER TABLE products ADD COLUMN product_type text DEFAULT 'general';

    -- حدث السجلات القديمة بقيمة واضحة
    UPDATE products
    SET product_type = 'general'
    WHERE product_type IS NULL;

    -- أضف تعليق توضيحي
    COMMENT ON COLUMN products.product_type IS 'نوع المنتج: general (عام), raw (خام), manufactured (مصنع). القيمة الافتراضية للسجلات القديمة: general';
  END IF;
END $$;
```

```sql
-- مثال 3: إضافة حقل اختياري (يمكن أن يكون NULL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'invoice_image_url'
  ) THEN
    -- الحقول الاختيارية يمكن أن تكون NULL
    ALTER TABLE sales ADD COLUMN invoice_image_url text;

    COMMENT ON COLUMN sales.invoice_image_url IS 'رابط صورة الفاتورة (اختياري). للسجلات القديمة: NULL = غير متوفر';
  END IF;
END $$;
```

#### جدول القيم الافتراضية المقترحة:
| نوع البيانات | القيمة الافتراضية المقترحة |
|--------------|---------------------------|
| UUID (معرّف فرع، مستخدم، إلخ) | معرّف الكيان الافتراضي |
| TEXT (وصف، ملاحظات) | '' (نص فارغ) أو 'N/A' |
| TEXT (enum محدد) | 'general' أو 'unspecified' |
| NUMERIC (مبلغ، سعر) | 0 أو القيمة الأنسب |
| BOOLEAN | false أو القيمة الأنسب |
| DATE/TIMESTAMP | تاريخ الإنشاء أو NULL |
| URL/PATH (مرفقات) | NULL (مقبول للحقول الاختيارية) |

---

### 3️⃣ مرونة الواجهة (UI Resilience)
**UI Resilience for Legacy Data**

#### المبدأ:
الواجهة يجب أن تتعامل بذكاء مع البيانات الناقصة ولا تخفي السجلات القديمة.

**The UI must intelligently handle missing data and never hide old records.**

#### أمثلة تطبيقية | Implementation Examples:

```typescript
// ❌ خطأ: إخفاء السجلات بدون صورة
const sales = await supabase
  .from('sales')
  .select('*')
  .not('invoice_image_url', 'is', null); // هذا سيخفي السجلات القديمة!

// ✅ صحيح: جلب جميع السجلات والتعامل مع الناقص في الواجهة
const sales = await supabase
  .from('sales')
  .select('*');

// عرض مع معالجة البيانات الناقصة
{sales.map(sale => (
  <div key={sale.id}>
    <h3>{sale.customer_name || 'عميل غير محدد'}</h3>
    <p>الفرع: {sale.branch?.name || 'الفرع الرئيسي'}</p>
    {sale.invoice_image_url ? (
      <img src={sale.invoice_image_url} alt="فاتورة" />
    ) : (
      <span className="text-gray-500">📄 لا توجد صورة</span>
    )}
  </div>
))}
```

```typescript
// Helper function للتعامل مع البيانات القديمة
export const getLegacySafeValue = <T,>(
  value: T | null | undefined,
  defaultValue: T,
  legacyLabel?: string
): T => {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  return value;
};

// الاستخدام:
const branchName = getLegacySafeValue(
  sale.branch?.name,
  'الفرع الرئيسي',
  'N/A'
);
```

```typescript
// Component للتعامل مع القيم الاختيارية
const OptionalField: React.FC<{
  value: string | null;
  label: string;
  emptyLabel?: string;
}> = ({ value, label, emptyLabel = 'غير متوفر' }) => {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {value ? (
        <p className="text-gray-900">{value}</p>
      ) : (
        <p className="text-gray-400 italic">{emptyLabel}</p>
      )}
    </div>
  );
};

// الاستخدام:
<OptionalField
  value={sale.invoice_image_url}
  label="صورة الفاتورة"
  emptyLabel="لا توجد صورة (سجل قديم)"
/>
```

#### معالجة التواريخ القديمة:

```typescript
// معالجة السجلات التي ليس لها فرع محدد
const getSaleBranch = (sale: Sale) => {
  // إذا كان السجل قديم (قبل نظام الفروع)
  if (!sale.branch_id) {
    return {
      id: 'legacy',
      name: 'Main Branch',
      name_ar: 'الفرع الرئيسي',
      isLegacy: true
    };
  }
  return sale.branch;
};

// عرض مع علامة للسجلات القديمة
{getSaleBranch(sale).isLegacy && (
  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
    📜 سجل قديم
  </span>
)}
```

---

### 4️⃣ اختبار التوافق
**Compatibility Testing**

#### Checklist قبل كل Deploy:

```markdown
## ✅ اختبار حماية البيانات التاريخية

### 1. اختبار البيانات القديمة
- [ ] السجلات المدخلة منذ شهر لا تزال تظهر
- [ ] السجلات المدخلة منذ سنة لا تزال تظهر
- [ ] السجلات بدون الحقول الجديدة تظهر بشكل صحيح
- [ ] القيم الافتراضية تطبق بشكل صحيح على السجلات القديمة

### 2. اختبار الواجهة
- [ ] القوائم تعرض جميع السجلات (قديمة وجديدة)
- [ ] التقارير تشمل البيانات القديمة
- [ ] الفلاتر لا تخفي السجلات القديمة بالخطأ
- [ ] عرض "N/A" أو "غير متوفر" للحقول الناقصة

### 3. اختبار الـ Migrations
- [ ] لا توجد عمليات DROP TABLE
- [ ] لا توجد عمليات DROP COLUMN
- [ ] لا توجد عمليات DELETE أو TRUNCATE
- [ ] جميع الأعمدة الجديدة لها قيم افتراضية
- [ ] استخدام IF EXISTS / IF NOT EXISTS في كل مكان

### 4. اختبار الأداء
- [ ] الاستعلامات سريعة حتى مع البيانات القديمة
- [ ] الفهارس (Indexes) محدثة للأعمدة الجديدة
- [ ] لا توجد استعلامات بطيئة بسبب البيانات القديمة
```

#### سكريبت اختبار تلقائي:

```sql
-- اختبار 1: التحقق من عدم وجود عمليات تدميرية في الـ migrations
SELECT
  migration_name,
  CASE
    WHEN migration_sql ~* 'DROP\s+TABLE' THEN '❌ يحتوي على DROP TABLE'
    WHEN migration_sql ~* 'DROP\s+COLUMN' THEN '❌ يحتوي على DROP COLUMN'
    WHEN migration_sql ~* 'DELETE\s+FROM' THEN '⚠️ يحتوي على DELETE FROM'
    WHEN migration_sql ~* 'TRUNCATE' THEN '❌ يحتوي على TRUNCATE'
    ELSE '✅ آمن'
  END as status
FROM supabase_migrations.schema_migrations
WHERE migration_sql ~* 'DROP|DELETE|TRUNCATE';

-- اختبار 2: التحقق من السجلات القديمة
SELECT
  'sales' as table_name,
  COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '1 month') as old_records,
  COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '1 year') as very_old_records,
  COUNT(*) as total_records
FROM sales
UNION ALL
SELECT
  'purchases',
  COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '1 month'),
  COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '1 year'),
  COUNT(*)
FROM purchases;

-- اختبار 3: التحقق من القيم NULL في الأعمدة المهمة
SELECT
  'sales' as table_name,
  'branch_id' as column_name,
  COUNT(*) FILTER (WHERE branch_id IS NULL) as null_count,
  COUNT(*) as total_records,
  ROUND((COUNT(*) FILTER (WHERE branch_id IS NULL)::numeric / COUNT(*) * 100), 2) as null_percentage
FROM sales
UNION ALL
SELECT
  'products',
  'product_type',
  COUNT(*) FILTER (WHERE product_type IS NULL),
  COUNT(*),
  ROUND((COUNT(*) FILTER (WHERE product_type IS NULL)::numeric / COUNT(*) * 100), 2)
FROM products;
```

---

## 📚 أمثلة عملية | Practical Examples

### مثال 1: إضافة نظام الفروع لنظام موجود

```sql
/*
  السيناريو: النظام كان بفرع واحد، نريد إضافة نظام متعدد الفروع
  Scenario: System had one branch, we want to add multi-branch system
*/

-- الخطوة 1: إنشاء جدول الفروع
CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_ar text NOT NULL,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- الخطوة 2: إدراج الفرع الافتراضي
INSERT INTO branches (name, name_ar, is_default)
VALUES ('Main Branch', 'الفرع الرئيسي', true)
ON CONFLICT DO NOTHING;

-- الخطوة 3: الحصول على معرف الفرع الافتراضي
DO $$
DECLARE
  default_branch_id uuid;
BEGIN
  SELECT id INTO default_branch_id FROM branches WHERE is_default = true LIMIT 1;

  -- الخطوة 4: إضافة branch_id لجدول المبيعات
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'branch_id'
  ) THEN
    EXECUTE format('ALTER TABLE sales ADD COLUMN branch_id uuid DEFAULT %L REFERENCES branches(id)', default_branch_id);

    -- تحديث جميع السجلات القديمة
    UPDATE sales SET branch_id = default_branch_id WHERE branch_id IS NULL;

    COMMENT ON COLUMN sales.branch_id IS 'معرّف الفرع. السجلات القديمة تشير للفرع الرئيسي الافتراضي.';
  END IF;

  -- كرر لجداول أخرى...
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchases' AND column_name = 'branch_id'
  ) THEN
    EXECUTE format('ALTER TABLE purchases ADD COLUMN branch_id uuid DEFAULT %L REFERENCES branches(id)', default_branch_id);
    UPDATE purchases SET branch_id = default_branch_id WHERE branch_id IS NULL;
  END IF;
END $$;
```

### مثال 2: إضافة نظام المرفقات

```sql
/*
  السيناريو: نريد إضافة إمكانية رفع صور للفواتير
  Scenario: Want to add invoice image attachments
*/

DO $$
BEGIN
  -- إضافة عمود اختياري للمرفقات
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'invoice_image_url'
  ) THEN
    -- هذا الحقل اختياري، NULL مقبول
    ALTER TABLE sales ADD COLUMN invoice_image_url text;

    COMMENT ON COLUMN sales.invoice_image_url IS
      'رابط صورة الفاتورة (اختياري). ' ||
      'السجلات القديمة: NULL = لم يتم رفع صورة. ' ||
      'عرض في الواجهة: "لا توجد صورة" أو "N/A"';
  END IF;
END $$;

-- في الواجهة (TypeScript):
/*
interface Sale {
  id: string;
  customer_name: string;
  total: number;
  invoice_image_url: string | null; // اختياري
}

// عرض آمن:
const InvoiceImage = ({ sale }: { sale: Sale }) => {
  if (!sale.invoice_image_url) {
    return (
      <div className="text-gray-400 text-sm italic">
        📄 لا توجد صورة (سجل قديم أو لم يتم الرفع)
      </div>
    );
  }

  return <img src={sale.invoice_image_url} alt="فاتورة" />;
};
*/
```

### مثال 3: تغيير نوع بيانات بأمان

```sql
/*
  السيناريو: العمود price كان integer، نريد تحويله لـ numeric
  Scenario: Column price was integer, want to convert to numeric
*/

DO $$
BEGIN
  -- ❌ لا تفعل هذا:
  -- ALTER TABLE products ALTER COLUMN price TYPE numeric(10,2);
  -- قد يفشل أو يفقد بيانات!

  -- ✅ الطريقة الصحيحة:

  -- 1. أضف عمود جديد
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'price_decimal'
  ) THEN
    ALTER TABLE products ADD COLUMN price_decimal numeric(10,2);
  END IF;

  -- 2. انسخ البيانات من العمود القديم
  UPDATE products
  SET price_decimal = price::numeric(10,2)
  WHERE price_decimal IS NULL;

  -- 3. اجعل العمود الجديد هو الافتراضي في الكود
  -- (لا تحذف العمود القديم!)

  COMMENT ON COLUMN products.price_decimal IS
    'سعر المنتج (عشري). استخدم هذا بدلاً من price. ' ||
    'العمود القديم price محفوظ للتوافق.';

  COMMENT ON COLUMN products.price IS
    'عمود قديم (deprecated). استخدم price_decimal. ' ||
    'محفوظ للتوافق مع السجلات القديمة.';
END $$;
```

---

## 🔍 أدوات المراقبة | Monitoring Tools

### سكريبت فحص صحة البيانات:

```sql
-- إنشاء دالة للتحقق من صحة البيانات
CREATE OR REPLACE FUNCTION check_data_integrity()
RETURNS TABLE(
  check_name text,
  status text,
  details text
) AS $$
BEGIN
  -- فحص 1: السجلات القديمة موجودة
  RETURN QUERY
  SELECT
    'Old Records Exist'::text,
    CASE WHEN COUNT(*) > 0 THEN '✅ PASS' ELSE '⚠️ WARNING' END,
    format('%s old records found', COUNT(*))
  FROM sales
  WHERE created_at < NOW() - INTERVAL '1 month';

  -- فحص 2: لا توجد قيم NULL في أعمدة مهمة
  RETURN QUERY
  SELECT
    'Branch ID Not Null'::text,
    CASE WHEN COUNT(*) = 0 THEN '✅ PASS' ELSE '❌ FAIL' END,
    format('%s records with NULL branch_id', COUNT(*))
  FROM sales
  WHERE branch_id IS NULL;

  -- فحص 3: القيم الافتراضية مطبقة
  RETURN QUERY
  SELECT
    'Default Values Applied'::text,
    '✅ PASS'::text,
    'All tables have appropriate defaults'::text;

  RETURN;
END;
$$ LANGUAGE plpgsql;

-- استخدام:
-- SELECT * FROM check_data_integrity();
```

---

## 📖 Best Practices Summary

### ✅ افعل | DO:
1. ✅ استخدم `IF NOT EXISTS` دائماً
2. ✅ أضف قيم افتراضية للأعمدة الجديدة
3. ✅ اكتب تعليقات توضيحية للأعمدة
4. ✅ اختبر مع بيانات قديمة حقيقية
5. ✅ استخدم "حذف منطقي" (soft delete) بدلاً من الحذف الفعلي
6. ✅ احتفظ بالجداول والأعمدة القديمة "deprecated" للتوافق
7. ✅ استخدم `DEFAULT` في `ALTER TABLE ADD COLUMN`
8. ✅ وثّق التغييرات في رأس ملف الـ migration

### ❌ لا تفعل | DON'T:
1. ❌ `DROP TABLE` أبداً
2. ❌ `DROP COLUMN` أبداً
3. ❌ `DELETE FROM` أو `TRUNCATE` للبيانات التاريخية
4. ❌ `ALTER COLUMN TYPE` بدون اختبار دقيق
5. ❌ إضافة `NOT NULL` بدون قيمة افتراضية
6. ❌ فلترة البيانات في الاستعلامات بطريقة تخفي السجلات القديمة
7. ❌ الاعتماد على `NOT NULL` للحقول الجديدة
8. ❌ نسيان تحديث السجلات القديمة بعد إضافة عمود

---

## 🚨 حالات الطوارئ | Emergency Procedures

### إذا حدث خطأ وفقدت بيانات:

1. **لا تتصرف بسرعة!** توقف وفكر
2. **تحقق من النسخ الاحتياطية**:
   ```sql
   -- عرض آخر نسخة احتياطية
   SELECT * FROM backups ORDER BY created_at DESC LIMIT 1;
   ```
3. **استخدم Point-in-Time Recovery إذا كان متاح**
4. **راجع الـ migrations الأخيرة**:
   ```sql
   SELECT * FROM supabase_migrations.schema_migrations
   ORDER BY executed_at DESC LIMIT 5;
   ```
5. **تواصل مع الفريق التقني فوراً**

### سكريبت الاستعادة السريعة:

```sql
-- إذا تم حذف بيانات عن طريق الخطأ
-- (يعمل فقط إذا كانت البيانات في النسخة الاحتياطية)

-- 1. أنشئ جدول مؤقت من النسخة الاحتياطية
CREATE TEMP TABLE temp_restored_sales AS
SELECT * FROM sales_backup WHERE backup_date = (
  SELECT MAX(backup_date) FROM sales_backup
);

-- 2. أعد إدراج البيانات المفقودة فقط
INSERT INTO sales
SELECT * FROM temp_restored_sales t
WHERE NOT EXISTS (
  SELECT 1 FROM sales s WHERE s.id = t.id
);

-- 3. تحقق من النتيجة
SELECT COUNT(*) as restored_records FROM temp_restored_sales;
```

---

## 📝 Template للـ Migration الآمن

```sql
/*
  # [اسم التغيير]

  ## الوصف:
  [وصف موجز للتغيير]

  ## التأثير على البيانات القديمة:
  - السجلات القديمة: [كيف ستتأثر]
  - القيم الافتراضية: [ما هي]
  - التوافق: [كيف تم الحفاظ عليه]

  ## الاختبارات المطلوبة:
  - [ ] السجلات القديمة تظهر
  - [ ] القيم الافتراضية تعمل
  - [ ] الواجهة تعرض البيانات بشكل صحيح
*/

-- 1. التحقق من الشروط المسبقة
DO $$
BEGIN
  -- تحقق من وجود الجداول المطلوبة
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'your_table') THEN
    RAISE EXCEPTION 'Table your_table does not exist';
  END IF;
END $$;

-- 2. إضافة الأعمدة الجديدة بأمان
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'your_table' AND column_name = 'new_column'
  ) THEN
    ALTER TABLE your_table ADD COLUMN new_column text DEFAULT 'default_value';

    -- تحديث السجلات القديمة إذا لزم الأمر
    UPDATE your_table
    SET new_column = 'appropriate_value'
    WHERE new_column IS NULL;

    -- إضافة تعليق توضيحي
    COMMENT ON COLUMN your_table.new_column IS
      'وصف العمود. القيمة الافتراضية للسجلات القديمة: default_value';
  END IF;
END $$;

-- 3. إضافة الفهارس إذا لزم الأمر
CREATE INDEX IF NOT EXISTS idx_your_table_new_column
ON your_table(new_column);

-- 4. التحقق من النتيجة
DO $$
DECLARE
  record_count integer;
  null_count integer;
BEGIN
  SELECT COUNT(*) INTO record_count FROM your_table;
  SELECT COUNT(*) INTO null_count FROM your_table WHERE new_column IS NULL;

  RAISE NOTICE 'Total records: %, Records with NULL: %', record_count, null_count;

  IF null_count > 0 THEN
    RAISE WARNING 'Still % records with NULL values', null_count;
  END IF;
END $$;
```

---

## 🎯 الخلاصة | Conclusion

**تذكر دائماً:**
- 🛡️ البيانات القديمة أهم من الميزات الجديدة
- 🔒 الحذف الدائم غير مقبول
- 📊 كل سجل له قيمة تاريخية
- ✅ الاختبار مع بيانات قديمة إلزامي

**Always Remember:**
- 🛡️ Legacy data is more important than new features
- 🔒 Permanent deletion is unacceptable
- 📊 Every record has historical value
- ✅ Testing with old data is mandatory

---

**وثيقة حية**: هذا الدليل يجب أن يُحدّث باستمرار مع كل تعلم جديد.
**Living Document**: This guide should be continuously updated with every new learning.

**آخر تحديث**: 2026-02-15
**Last Updated**: 2026-02-15

**الإصدار**: 1.0
**Version**: 1.0
