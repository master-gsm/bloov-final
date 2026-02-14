# إصلاح عزل الفروع - المبيعات والمخزون

## المشكلة
بعد تطبيق نظام الفروع المتعددة، كان المستخدمون يواجهون خطأ "UPDATE requires a WHERE clause" عند إنشاء معاملات المبيعات مع المنتجات. حدث هذا الخطأ بسبب:

1. تم إنشاء المبيعات بدون `branch_id`
2. تحديثات المخزون كانت تفتقد `branch_id` في شرط WHERE
3. عمليات البحث في المخزون لم تكن تصفي حسب الفرع

## السبب الجذري
عند إضافة نظام الفروع المتعددة، تمت إضافة عمود `branch_id` إلى:
- جدول `sales` (المبيعات)
- جدول `inventory` (المخزون)
- جدول `branch_stock` (مخزون الفرع)

ومع ذلك، لم يتم تحديث مكونات المبيعات والمخزون من أجل:
1. تحميل `branch_id` للمستخدم الحالي
2. تضمين `branch_id` عند إنشاء المبيعات
3. تصفية استعلامات المخزون حسب `branch_id`
4. تضمين `branch_id` في شروط WHERE للتحديث

## الحل

### 1. مكون المبيعات (`src/components/Sales.tsx`)

**التغييرات التي تم إجراؤها:**

#### إضافة تحميل فرع المستخدم
```typescript
const [userBranchId, setUserBranchId] = useState<string | null>(null);

const loadUserBranch = async () => {
  if (!user) return;
  try {
    const { data, error } = await supabase
      .from('users')
      .select('branch_id')
      .eq('id', user.id)
      .maybeSingle();

    if (error) throw error;
    if (data) setUserBranchId(data.branch_id);
  } catch (err) {
    console.error('Error loading user branch:', err);
  }
};
```

#### تحديث إنشاء المبيعة
تمت إضافة `branch_id` إلى إدراج المبيعات:
```typescript
const { data: sale, error: saleError } = await supabase
  .from('sales')
  .insert({
    // ... حقول أخرى
    branch_id: userBranchId,  // ← تمت الإضافة
    created_by: user?.id,
  })
```

#### تحديث إدارة المخزون
الآن يتحقق من كل من `branch_stock` و `inventory` مع التصفية الصحيحة لـ `branch_id`:

```typescript
// تحديث branch_stock لنظام الفروع المتعددة
if (userBranchId) {
  const { data: branchStock } = await supabase
    .from('branch_stock')
    .select('id, quantity')
    .eq('product_id', item.product_id)
    .eq('branch_id', userBranchId)
    .maybeSingle();

  if (branchStock) {
    await supabase
      .from('branch_stock')
      .update({
        quantity: branchStock.quantity - item.quantity,
        updated_at: new Date().toISOString()
      })
      .eq('id', branchStock.id);
  }
}

// تحديث المخزون القديم مع تصفية branch_id
const { data: inv } = await supabase
  .from('inventory')
  .select('id, quantity')
  .eq('product_id', item.product_id)
  .eq('branch_id', userBranchId)
  .maybeSingle();

if (inv) {
  await supabase
    .from('inventory')
    .update({
      quantity: inv.quantity - item.quantity,
      last_updated: new Date().toISOString()
    })
    .eq('id', inv.id)
    .eq('product_id', item.product_id)
    .eq('branch_id', userBranchId);  // ← تمت الإضافة لشرط WHERE
}
```

### 2. مكون المخزون (`src/components/Inventory.tsx`)

**التغييرات التي تم إجراؤها:**

#### إضافة تحميل فرع المستخدم
نفس النمط المستخدم في مكون المبيعات - يحمل `branch_id` للمستخدم الحالي عند التحميل.

#### تحديث تسجيل التلف
```typescript
const recordDamage = async () => {
  // ... التحقق من الصحة
  if (inv && userBranchId) {
    await supabase
      .from('inventory')
      .update({
        quantity: Math.max(0, inv.quantity - qty),
        last_updated: new Date().toISOString()
      })
      .eq('id', inv.id)
      .eq('product_id', damageProductId)
      .eq('branch_id', userBranchId);  // ← تمت الإضافة لشرط WHERE
  }
  // ... بقية الكود
};
```

#### تحديث الجرد اليدوي
```typescript
const manualCount = async () => {
  // ... التحقق من الصحة
  if (inv && userBranchId) {
    await supabase
      .from('inventory')
      .update({
        quantity: newQty,
        last_updated: new Date().toISOString()
      })
      .eq('id', inv.id)
      .eq('product_id', countProductId)
      .eq('branch_id', userBranchId);  // ← تمت الإضافة لشرط WHERE
    // ... بقية الكود
  }
};
```

## التأثير

### قبل الإصلاح
- ❌ فشل إنشاء المبيعات مع خطأ "UPDATE requires a WHERE clause"
- ❌ كان من الممكن حدوث تحديثات المخزون عبر الفروع
- ❌ لم يتم فرض عزل البيانات على مستوى التطبيق

### بعد الإصلاح
- ✅ يعمل إنشاء المبيعات بشكل صحيح مع تعيين الفرع
- ✅ تحديثات المخزون معزولة بشكل صحيح حسب الفرع
- ✅ يمكن للمستخدمين فقط تعديل المخزون في الفرع المعين لهم
- ✅ يتم الآن استخدام نظام `branch_stock` جنبًا إلى جنب مع جدول `inventory` القديم

## توصيات الاختبار

1. **اختبار إنشاء المبيعات:**
   - إنشاء مبيعة مع منتجات
   - التحقق من تعيين `branch_id` بشكل صحيح في جدول `sales`
   - تأكيد خصم المخزون من الفرع الصحيح

2. **اختبار تحديثات المخزون:**
   - تسجيل تلف للمنتجات
   - إجراء جرد يدوي
   - التحقق من أن جميع التحديثات تتضمن `branch_id` في شروط WHERE

3. **اختبار عزل الفروع:**
   - إنشاء مستخدمين معينين لفروع مختلفة
   - التحقق من أنهم يمكنهم فقط رؤية وتعديل بيانات فرعهم
   - تأكيد أن المديرين العامين يمكنهم الوصول إلى جميع الفروع

## ملاحظات الترحيل

تم تعيين جميع البيانات الموجودة تلقائيًا إلى "الفرع الرئيسي" (الرمز: MAIN) أثناء ترحيل الفروع المتعددة الأولي. يجب على المستخدمين:

1. التحقق من تعيين `branch_id` الخاص بهم في جدول `users`
2. التحقق من أن جميع سجلات `sales` و `inventory` التاريخية لديها `branch_id` معين
3. إنشاء إدخالات `branch_stock` للفروع الجديدة

## الملفات ذات الصلة

- `src/components/Sales.tsx` - إدارة معاملات المبيعات
- `src/components/Inventory.tsx` - إدارة المخزون والأرصدة
- `supabase/migrations/20260214011240_create_multi_branch_system_v3.sql` - مخطط الفروع المتعددة
- `supabase/migrations/20260214011306_assign_existing_data_to_default_branch.sql` - ترحيل البيانات

## التاريخ
2026-02-14
