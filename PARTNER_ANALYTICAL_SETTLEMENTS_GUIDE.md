# 🤝 نظام التسويات والحساب الجاري التحليلي للشركاء

## 📋 نظرة عامة

تم إنشاء نظام تسويات احترافي وبسيط بين الشركاء يعتمد على:
- **المصاريف المشتركة** المدفوعة من كل شريك
- **نسب الملكية** لحساب الحصة المفترضة لكل شريك
- **التسويات** بين الشركاء لتوازن الحسابات

**ملاحظة مهمة:** هذا نظام **تحليلي فقط** - لا يؤثر على journal_entries أو GL.

---

## 🎯 المعادلة الأساسية

```
رصيد الشريك =
  (إجمالي المصاريف المشتركة × نسبة الملكية / 100)  -- الحصة المفترضة
  - المصاريف المدفوعة فعلياً من الشريك          -- المدفوع
  - التسويات المدفوعة لشركاء آخرين               -- تسويات مدفوعة
  + التسويات المستلمة من شركاء آخرين             -- تسويات مستلمة
```

### 📊 تفسير الرصيد:

| الرصيد | المعنى | التفسير |
|--------|--------|----------|
| **موجب (+)** | **له رصيد** | الشريك دفع **أكثر** من حصته المفترضة |
| **سالب (-)** | **عليه رصيد** | الشريك دفع **أقل** من حصته المفترضة |
| **صفر (0)** | **متوازن** | الشريك دفع بالضبط حصته المفترضة |

---

## 🗄️ الهيكل التقني

### 1️⃣ الجدول: `partner_settlements`

الجدول موجود مسبقاً مع الحقول التالية:

```sql
partner_settlements
├── id                    uuid (PK)
├── from_partner_id       uuid (FK → partners)  -- الشريك الدافع
├── to_partner_id         uuid (FK → partners)  -- الشريك المستلم
├── amount                numeric               -- المبلغ
├── settlement_date       date                  -- تاريخ التسوية
├── description           text                  -- وصف بالإنجليزية
├── description_ar        text                  -- وصف بالعربية
├── notes                 text                  -- ملاحظات إضافية (جديد)
├── status                text                  -- active | voided
├── attachment_url        text                  -- رابط المرفق
├── is_deleted            boolean               -- soft delete
├── voided_at            timestamp
├── voided_by            uuid
├── void_reason          text
├── created_by           uuid (FK → users)
├── created_at           timestamp
├── updated_at           timestamp
└── version              integer               -- optimistic locking
```

**التعديلات:**
- ✅ إضافة حقل `notes` للملاحظات الإضافية

---

### 2️⃣ الـ View: `v_partner_analytical_balances`

هذا الـ View يحسب الرصيد التحليلي لكل شريك:

```sql
CREATE VIEW v_partner_analytical_balances AS
WITH
-- إجمالي المصاريف المشتركة
total_shared_expenses AS (
  SELECT COALESCE(SUM(net_amount), 0) AS total
  FROM operating_expenses
  WHERE is_deleted = false
    AND expense_type IN ('operational', 'marketing', 'administrative')
),

-- المصاريف المدفوعة من كل شريك
partner_expenses AS (
  SELECT
    pc.partner_id,
    COALESCE(SUM(oe.net_amount), 0) AS paid_expenses
  FROM partner_contributions pc
  INNER JOIN operating_expenses oe ON oe.partner_contribution_id = pc.id
  WHERE pc.is_deleted = false
    AND oe.is_deleted = false
    AND pc.contribution_type IN ('operational', 'marketing', 'administrative')
  GROUP BY pc.partner_id
),

-- التسويات المدفوعة
settlements_paid AS (
  SELECT
    from_partner_id AS partner_id,
    COALESCE(SUM(amount), 0) AS total_paid
  FROM partner_settlements
  WHERE is_deleted = false AND status = 'active'
  GROUP BY from_partner_id
),

-- التسويات المستلمة
settlements_received AS (
  SELECT
    to_partner_id AS partner_id,
    COALESCE(SUM(amount), 0) AS total_received
  FROM partner_settlements
  WHERE is_deleted = false AND status = 'active'
  GROUP BY to_partner_id
)

SELECT
  p.id AS partner_id,
  p.name,
  p.name_ar,
  p.ownership_percentage,

  -- إجمالي المصاريف المشتركة
  tse.total AS total_shared_expenses,

  -- الحصة المفترضة
  ROUND((tse.total * p.ownership_percentage / 100), 2) AS expected_share,

  -- المدفوع فعلياً
  COALESCE(pe.paid_expenses, 0) AS paid_expenses,

  -- التسويات
  COALESCE(sp.total_paid, 0) AS settlements_paid,
  COALESCE(sr.total_received, 0) AS settlements_received,

  -- الرصيد النهائي
  ROUND(
    (tse.total * p.ownership_percentage / 100)
    - COALESCE(pe.paid_expenses, 0)
    - COALESCE(sp.total_paid, 0)
    + COALESCE(sr.total_received, 0),
    2
  ) AS current_balance,

  -- حالة الرصيد
  CASE
    WHEN ... > 0 THEN 'له'
    WHEN ... < 0 THEN 'عليه'
    ELSE 'متوازن'
  END AS balance_status,

  -- الرصيد المطلق
  ABS(...) AS balance_absolute

FROM partners p
WHERE p.is_active = true;
```

#### الحقول المُرجعة:

| الحقل | النوع | الوصف |
|-------|------|-------|
| `partner_id` | uuid | معرّف الشريك |
| `name` | text | اسم الشريك (إنجليزي) |
| `name_ar` | text | اسم الشريك (عربي) |
| `ownership_percentage` | numeric | نسبة الملكية (%) |
| `total_shared_expenses` | numeric | إجمالي المصاريف المشتركة |
| `expected_share` | numeric | الحصة المفترضة للشريك |
| `paid_expenses` | numeric | المصاريف المدفوعة فعلياً |
| `settlements_paid` | numeric | التسويات المدفوعة |
| `settlements_received` | numeric | التسويات المستلمة |
| `current_balance` | numeric | الرصيد النهائي |
| `balance_status` | text | حالة الرصيد: 'له' / 'عليه' / 'متوازن' |
| `balance_absolute` | numeric | القيمة المطلقة للرصيد |

---

### 3️⃣ الـ View: `v_partner_settlements_history`

عرض سجل التسويات مع أسماء الشركاء:

```sql
CREATE VIEW v_partner_settlements_history AS
SELECT
  ps.id,
  ps.from_partner_id,
  pf.name AS from_partner_name,
  pf.name_ar AS from_partner_name_ar,
  ps.to_partner_id,
  pt.name AS to_partner_name,
  pt.name_ar AS to_partner_name_ar,
  ps.amount,
  ps.settlement_date,
  ps.description,
  ps.description_ar,
  ps.notes,
  ps.status,
  ps.created_at,
  ps.created_by,
  u.full_name AS created_by_name
FROM partner_settlements ps
INNER JOIN partners pf ON pf.id = ps.from_partner_id
INNER JOIN partners pt ON pt.id = ps.to_partner_id
LEFT JOIN users u ON u.id = ps.created_by
WHERE ps.is_deleted = false
ORDER BY ps.settlement_date DESC;
```

---

## 🎨 الواجهة الجديدة

### 📍 الموقع
صفحة **إدارة الشركاء** → تاب **"الحساب الجاري والتسويات"**

```
Partners Page
├── Tab 1: نظرة عامة (Overview) - الصفحة القديمة
└── Tab 2: الحساب الجاري والتسويات (NEW) ← PartnerSettlements component
```

### 🧩 المكون: `PartnerSettlements.tsx`

الموقع: `src/components/partners/PartnerSettlements.tsx`

#### المميزات:

1. **جدول أرصدة الشركاء**
   - عرض كل شريك مع:
     - نسبة الملكية
     - الحصة المفترضة
     - المدفوع فعلياً
     - الرصيد النهائي (مع لون حسب الحالة)
     - الحالة: له / عليه / متوازن
     - زر "تسوية" للشركاء الذين لديهم رصيد غير متوازن

2. **اقتراحات تسوية سريعة**
   - يعرض تلقائياً اقتراحات لتسوية الأرصدة
   - مثال: "شريك A → شريك B: 15,000 ر.س"
   - زر "تسوية كاملة" لإتمام التسوية المقترحة

3. **سجل التسويات**
   - جدول يعرض جميع التسويات السابقة
   - يحتوي على:
     - التاريخ
     - من الشريك
     - إلى الشريك
     - المبلغ
     - الوصف
     - المستخدم الذي أضاف التسوية

4. **نموذج تسوية جديدة**
   - زر "+ تسوية جديدة"
   - نموذج يحتوي على:
     - من الشريك (dropdown)
     - إلى الشريك (dropdown)
     - المبلغ
     - التاريخ
     - الوصف
     - ملاحظات

5. **أنواع التسوية**
   - **تسوية كاملة**: يملأ المبلغ تلقائياً بالرصيد الكامل
   - **تسوية جزئية**: يسمح بإدخال مبلغ مخصص

6. **Alert توضيحي**
   - شرح مبسط لكيفية عمل الحساب الجاري
   - نقاط رئيسية:
     - كيف يتم حساب الحصة
     - معنى الرصيد الموجب والسالب
     - التسويات لا تؤثر على النسب

---

## 📖 أمثلة عملية

### مثال 1: سيناريو أساسي

#### المعطيات:
- **إجمالي المصاريف المشتركة:** 100,000 ر.س
- **الشركاء:**
  - شريك A: نسبة الملكية 60%
  - شريك B: نسبة الملكية 40%

#### المدفوع فعلياً:
- شريك A دفع: 80,000 ر.س
- شريك B دفع: 20,000 ر.س

#### الحساب:

**شريك A:**
```
الحصة المفترضة = 100,000 × 60% = 60,000 ر.س
المدفوع فعلياً = 80,000 ر.س
الرصيد = 60,000 - 80,000 = -20,000 ر.س
الحالة: له رصيد (+20,000 ر.س)
```

**شريك B:**
```
الحصة المفترضة = 100,000 × 40% = 40,000 ر.س
المدفوع فعلياً = 20,000 ر.س
الرصيد = 40,000 - 20,000 = +20,000 ر.س
الحالة: عليه رصيد (20,000 ر.س)
```

#### التسوية المقترحة:
```
شريك B → شريك A: 20,000 ر.س
```

---

### مثال 2: سيناريو مع تسويات

#### بعد التسوية الأولى:
- شريك B دفع لشريك A: 10,000 ر.س (تسوية جزئية)

#### الحساب الجديد:

**شريك A:**
```
الحصة المفترضة = 60,000 ر.س
المدفوع فعلياً = 80,000 ر.س
التسويات المستلمة = 10,000 ر.س
الرصيد = 60,000 - 80,000 + 10,000 = -10,000 ر.س
الحالة: له رصيد (+10,000 ر.س)
```

**شريك B:**
```
الحصة المفترضة = 40,000 ر.س
المدفوع فعلياً = 20,000 ر.س
التسويات المدفوعة = 10,000 ر.س
الرصيد = 40,000 - 20,000 - 10,000 = +10,000 ر.س
الحالة: عليه رصيد (10,000 ر.س)
```

#### التسوية المقترحة الجديدة:
```
شريك B → شريك A: 10,000 ر.س (متبقي)
```

---

## 🔐 الأمان والصلاحيات

### RLS Policies

#### على `partner_settlements`:
```sql
-- SELECT: admin, accountant, observer, super_admin
-- INSERT: admin, accountant, super_admin
-- UPDATE: admin, accountant, super_admin
-- DELETE: admin, super_admin
```

#### على الـ Views:
```sql
-- v_partner_analytical_balances: SELECT لجميع authenticated users
-- v_partner_settlements_history: SELECT لجميع authenticated users
```

---

## 🚀 الاستخدام

### 1. عرض أرصدة الشركاء

```typescript
const { data: balances, error } = await supabase
  .from('v_partner_analytical_balances')
  .select('*')
  .order('name');

// النتيجة:
// [
//   {
//     partner_id: 'uuid-1',
//     name: 'Partner A',
//     ownership_percentage: 60,
//     expected_share: 60000,
//     paid_expenses: 80000,
//     current_balance: -20000,  // له رصيد
//     balance_status: 'له',
//     balance_absolute: 20000
//   },
//   {
//     partner_id: 'uuid-2',
//     name: 'Partner B',
//     ownership_percentage: 40,
//     expected_share: 40000,
//     paid_expenses: 20000,
//     current_balance: 20000,  // عليه رصيد
//     balance_status: 'عليه',
//     balance_absolute: 20000
//   }
// ]
```

---

### 2. إضافة تسوية جديدة

```typescript
const { error } = await supabase
  .from('partner_settlements')
  .insert({
    from_partner_id: 'partner-B-uuid',
    to_partner_id: 'partner-A-uuid',
    amount: 20000,
    settlement_date: '2026-02-25',
    description: 'Full settlement from Partner B to Partner A',
    description_ar: 'تسوية كاملة من الشريك B إلى الشريك A',
    notes: 'تسوية للرصيد المستحق بالكامل',
    status: 'active'
  });
```

---

### 3. عرض سجل التسويات

```typescript
const { data: settlements, error } = await supabase
  .from('v_partner_settlements_history')
  .select('*')
  .order('settlement_date', { ascending: false })
  .limit(50);

// النتيجة:
// [
//   {
//     id: 'uuid-1',
//     from_partner_name: 'Partner B',
//     to_partner_name: 'Partner A',
//     amount: 20000,
//     settlement_date: '2026-02-25',
//     description_ar: 'تسوية كاملة',
//     created_by_name: 'Admin User'
//   }
// ]
```

---

## ⚠️ ملاحظات مهمة

### 1. **نظام تحليلي فقط**
- ❌ لا يؤثر على `journal_entries`
- ❌ لا يؤثر على `journal_lines`
- ❌ لا يؤثر على General Ledger (GL)
- ✅ مستقل تماماً عن النظام المحاسبي

### 2. **لا يؤثر على نسب الشراكة**
- التسويات **لا تغير** `ownership_percentage`
- التسويات **لا تغير** `profit_share_percentage`
- التسويات **لا تغير** `capital_contribution`

### 3. **المصاريف المشتركة فقط**
الحساب يشمل فقط المصاريف من الأنواع التالية:
- `operational`
- `marketing`
- `administrative`

**لا يشمل:**
- ❌ مصاريف رأسمالية (`capital`)
- ❌ مصاريف الأصول (`asset`)

### 4. **Soft Delete**
- التسويات المحذوفة (`is_deleted = true`) **لا تظهر** في الحسابات
- التسويات الملغاة (`status = 'voided'`) **لا تظهر** في الحسابات

### 5. **Real-time Updates**
- عند إضافة مصروف جديد → الرصيد يتحدث تلقائياً
- عند إضافة تسوية → الرصيد يتحدث تلقائياً
- الـ Views محسوبة ديناميكياً

---

## 🎯 الفائدة من النظام

### ✅ **للشركاء:**
- معرفة من دفع أكثر أو أقل من حصته
- تسوية الفروقات بطريقة عادلة وشفافة
- سجل كامل لجميع التسويات

### ✅ **للمحاسب:**
- نظام بسيط لا يتداخل مع GL
- تتبع المصاريف المدفوعة من كل شريك
- تقارير واضحة عن أرصدة الشركاء

### ✅ **للإدارة:**
- شفافية كاملة في توزيع المصاريف
- سهولة متابعة التسويات بين الشركاء
- تجنب النزاعات والخلافات

---

## 📊 التقارير المتاحة

### 1. **تقرير أرصدة الشركاء**
```sql
SELECT * FROM v_partner_analytical_balances;
```

### 2. **تقرير التسويات حسب الفترة**
```sql
SELECT *
FROM v_partner_settlements_history
WHERE settlement_date BETWEEN '2026-01-01' AND '2026-12-31'
ORDER BY settlement_date;
```

### 3. **تقرير المصاريف المدفوعة من كل شريك**
```sql
SELECT
  p.name,
  p.name_ar,
  COALESCE(SUM(oe.net_amount), 0) AS total_paid
FROM partners p
LEFT JOIN partner_contributions pc ON pc.partner_id = p.id
LEFT JOIN operating_expenses oe ON oe.partner_contribution_id = pc.id
WHERE oe.is_deleted = false
GROUP BY p.id, p.name, p.name_ar
ORDER BY total_paid DESC;
```

---

## 🔄 التكامل مع النظام الحالي

### لا يتعارض مع:
- ✅ `v_partner_balances` (النظام القديم)
- ✅ `profit_distributions`
- ✅ `partner_withdrawals`
- ✅ Journal Entries
- ✅ General Ledger

### يعمل جنباً إلى جنب مع:
- ✅ `partner_contributions`
- ✅ `operating_expenses`
- ✅ `partners` table

---

## 🎓 خلاصة

تم إنشاء نظام تسويات بسيط واحترافي يعتمد على:

1. **المعادلة:**
   ```
   الرصيد = الحصة المفترضة - المدفوع - التسويات المدفوعة + التسويات المستلمة
   ```

2. **المميزات:**
   - ✅ تحليلي فقط (لا يؤثر على GL)
   - ✅ واجهة بسيطة وواضحة
   - ✅ اقتراحات تسوية تلقائية
   - ✅ سجل كامل للتسويات
   - ✅ دعم التسوية الكاملة والجزئية

3. **الأمان:**
   - ✅ RLS policies محكمة
   - ✅ Soft delete
   - ✅ Optimistic locking
   - ✅ Audit trail

---

**تاريخ الإنشاء:** 25 فبراير 2026
**الإصدار:** 1.0.0
**الحالة:** ✅ جاهز للاستخدام
