# 🏦 مخطط منطق الحساب الجاري للشركاء - تحليل كامل

## 📋 الفهرس
1. [إجابة الأسئلة المباشرة](#إجابة-الأسئلة-المباشرة)
2. [تدفق البيانات الكامل](#تدفق-البيانات-الكامل)
3. [الجداول والعلاقات](#الجداول-والعلاقات)
4. [Functions & Triggers](#functions--triggers)
5. [RLS Policies](#rls-policies)
6. [أمثلة عملية](#أمثلة-عملية)

---

## ✅ إجابة الأسئلة المباشرة

### 1️⃣ هل الحساب الجاري مبني من journal_entries؟

**الإجابة: لا - الحساب الجاري مبني من جداول مستقلة**

الحساب الجاري يُحسب من خلال **View** اسمها `v_partner_balances`:

```sql
current_account_balance =
  + profit_distributions (posted)      -- الأرباح الموزعة للشريك
  - partner_withdrawals (not voided)    -- سحوبات الشريك
  - partner_settlements (paid)          -- تسويات دفعها الشريك
  + partner_settlements (received)      -- تسويات استلمها الشريك
```

**ملاحظة مهمة:**
- الـ `journal_entries` تُستخدم للـ **GL (General Ledger)** فقط
- الحساب الجاري **مستقل** عن الـ GL
- لكن كل عملية شريك **تُسجل في الطرفين**:
  - Domain tables (partner_withdrawals, profit_distributions, etc.)
  - GL via journal_entries

---

### 2️⃣ أم من partner_settlements فقط؟

**الإجابة: من عدة جداول مجتمعة**

الحساب الجاري يشمل:

| الجدول | الدور | التأثير على الحساب الجاري |
|--------|------|---------------------------|
| `profit_distributions` | توزيع أرباح للشريك | ➕ يزيد الحساب |
| `partner_withdrawals` | سحب شريك لأمواله | ➖ يُنقص الحساب |
| `partner_settlements` | تسوية بين شركاء | ➖ للدافع / ➕ للمستلم |
| `partner_contributions` | **لا يؤثر مباشرة** | يذهب إلى `operating_expenses` |

**ملاحظة:**
- `partner_contributions` **لا تؤثر** على الحساب الجاري مباشرة
- بدلاً من ذلك، تُحوَّل تلقائياً إلى `operating_expenses`
- ثم تُسجل في GL كـ Dr Expense / Cr Capital

---

### 3️⃣ ما هي triggers المسؤولة عن توزيع المصروف؟

**الإجابة: يوجد Trigger واحد رئيسي**

```sql
trg_create_expense_from_contribution
  ON partner_contributions
  AFTER INSERT
  → EXECUTE FUNCTION create_expense_from_partner_contribution()
```

**ماذا يفعل:**
1. عند إدخال `partner_contribution`
2. يُنشئ تلقائياً سجل في `operating_expenses`
3. يربطهما بـ `partner_contribution_id`

**ثم تتولى triggers أخرى المسؤولية:**

```sql
trg_post_operating_expense_gl
  ON operating_expenses
  AFTER INSERT
  → EXECUTE FUNCTION post_operating_expense_gl()
  → ينشئ journal_entry + journal_lines
```

---

### 4️⃣ هل هناك function تقوم بتوزيع نسبة الملكية؟

**الإجابة: لا - لا يوجد توزيع تلقائي حسب نسبة الملكية**

**الوضع الحالي:**
- لا يتم توزيع المصروفات تلقائياً حسب `ownership_percentage`
- كل عملية شريك تُسجل للشريك **الفردي** المحدد
- الحقول الموجودة في `partners`:
  - `ownership_percentage` - نسبة الملكية
  - `profit_share_percentage` - نسبة توزيع الأرباح
  - `capital_contribution` - رأس المال المساهم

**استخدام النسب:**
- `profit_share_percentage` يُستخدم فقط عند إنشاء `profit_distributions` يدوياً
- لا يوجد automation لتوزيع المصروفات حسب النسب

**إذا أردت توزيع تلقائي:**
يجب إنشاء function مثل:
```sql
distribute_expense_by_ownership(
  p_total_amount numeric,
  p_expense_type text
)
```
وتنشئ سجل لكل شريك حسب نسبته.

---

### 5️⃣ هل RLS تمنع أي من هذه العمليات؟

**الإجابة: RLS قد تمنع في بعض الحالات**

#### ✅ **العمليات المسموحة:**

| الدور | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `admin` | ✅ | ✅ | ✅ | ✅ |
| `super_admin` | ✅ | ✅ | ✅ | ✅ |
| `accountant` | ✅ | ✅ | ✅ | ❌ |
| `observer` | ✅ | ❌ | ❌ | ❌ |
| `cashier` | ❌ | ❌ | ❌ | ❌ |

#### ⚠️ **نقاط الحذر:**

1. **Soft Delete Filter:**
```sql
is_deleted = false
```
- كل الـ queries تُصفي تلقائياً السجلات المحذوفة
- يمنع رؤية أو تعديل السجلات الـ voided

2. **Trigger Functions تعمل بـ SECURITY DEFINER:**
```sql
CREATE FUNCTION post_operating_expense_gl()
SECURITY DEFINER  -- تجاوز RLS
SET search_path TO 'public', 'pg_temp'
```
- الـ triggers **لا تتأثر** بـ RLS
- تعمل بصلاحيات صاحب الـ function

3. **Bypass Flag:**
```sql
PERFORM set_config('app.bypass_immutable', 'true', true);
```
- بعض الـ functions تستخدم flag لتجاوز القيود
- هذا **ضروري** لمنع recursion وتحديث السجلات المالية

#### ❌ **حالات قد تفشل:**

1. **User ليس admin/accountant:**
```sql
-- سيفشل INSERT على partner_contributions
INSERT INTO partner_contributions (partner_id, amount, ...) VALUES (...);
-- ERROR: new row violates row-level security policy
```

2. **محاولة تعديل سجل is_deleted = true:**
```sql
-- لن يظهر السجل أصلاً
UPDATE partner_contributions SET amount = 1000 WHERE id = '...';
-- 0 rows affected (بسبب soft delete filter)
```

---

## 🔄 تدفق البيانات الكامل

### مسار 1️⃣: Partner Contribution → Expense → GL

```
┌─────────────────────────────────────────────────────────────────┐
│ المستخدم: إدخال مساهمة شريك                                      │
└───────────────┬─────────────────────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────────────────┐
│ 1. INSERT INTO partner_contributions                              │
│    - partner_id                                                   │
│    - amount (total)                                               │
│    - contribution_type: 'operational' | 'capital' | 'asset'       │
│    - vat_category: 'standard' | 'exempt' | 'zero_rated'          │
└───────────────┬───────────────────────────────────────────────────┘
                │
                │ TRIGGER: trg_compute_partner_contribution_vat
                ▼
┌───────────────────────────────────────────────────────────────────┐
│ 2. Compute VAT (BEFORE INSERT)                                    │
│    - net_amount = amount / 1.15 (if standard)                     │
│    - vat_amount = amount - net_amount                             │
│    - tax_rate = 15%                                               │
└───────────────┬───────────────────────────────────────────────────┘
                │
                │ TRIGGER: trg_create_expense_from_contribution
                ▼
┌───────────────────────────────────────────────────────────────────┐
│ 3. Auto-create Operating Expense (AFTER INSERT)                  │
│    INSERT INTO operating_expenses (                               │
│      expense_number,                                              │
│      expense_type = contribution_type,                            │
│      amount,                                                      │
│      partner_contribution_id = partner_contributions.id           │
│    )                                                              │
└───────────────┬───────────────────────────────────────────────────┘
                │
                │ TRIGGER: trg_post_operating_expense_gl
                ▼
┌───────────────────────────────────────────────────────────────────┐
│ 4. Post to General Ledger (AFTER INSERT on operating_expenses)   │
│                                                                   │
│    A. Create journal_entry (Draft)                               │
│       - reference_type = 'operating_expense'                     │
│       - reference_id = operating_expenses.id                     │
│                                                                   │
│    B. Create journal_lines                                       │
│       Line 1: Dr 6000 Operating Expense (net_amount)             │
│       Line 2: Dr 2140 VAT Input         (vat_amount)  [if VAT]   │
│       Line 3: Cr 3100 Partner Capital   (total_amount)           │
│                                                                   │
│    C. Update journal_entry → status = 'Posted'                   │
└───────────────┬───────────────────────────────────────────────────┘
                │
                │ TRIGGER: trg_vat_tx_from_partner_contribution
                ▼
┌───────────────────────────────────────────────────────────────────┐
│ 5. Record VAT Transaction (AFTER INSERT on partner_contributions)│
│    INSERT INTO vat_transactions (                                │
│      source_type = 'partner_contribution',                       │
│      source_id = partner_contributions.id,                       │
│      direction = 'input',                                        │
│      taxable_amount = net_amount,                                │
│      vat_amount = vat_amount,                                    │
│      status = 'open'                                             │
│    )                                                             │
└───────────────────────────────────────────────────────────────────┘

النتيجة النهائية:
✅ 1 partner_contribution record
✅ 1 operating_expense record (linked)
✅ 1 journal_entry (Posted)
✅ 2-3 journal_lines (Dr Expense, Dr VAT, Cr Capital)
✅ 1 vat_transaction (input)
```

---

### مسار 2️⃣: Partner Withdrawal → GL → Current Account

```
┌─────────────────────────────────────────────────────────────────┐
│ المستخدم: سحب شريك                                               │
└───────────────┬─────────────────────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────────────────┐
│ 1. Call Function: fn_record_partner_withdrawal()                 │
│    - p_partner_id                                                 │
│    - p_amount                                                     │
│    - p_method: 'cash' | 'bank_transfer'                          │
│    - p_description                                                │
└───────────────┬───────────────────────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────────────────┐
│ 2. Insert into partner_withdrawals                               │
│    - partner_id                                                   │
│    - amount                                                       │
│    - withdrawal_date                                              │
│    - is_voided = false                                           │
└───────────────┬───────────────────────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────────────────┐
│ 3. Create Journal Entry (within function)                        │
│                                                                   │
│    Line 1: Dr 3100 Partner Capital (amount)                      │
│    Line 2: Cr 1110 Cash            (amount)                      │
│                                                                   │
│    Status = 'Posted'                                             │
└───────────────┬───────────────────────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────────────────┐
│ 4. Update v_partner_balances View (automatic)                    │
│                                                                   │
│    current_account_balance =                                     │
│      profit_distributed                                          │
│      - withdrawals  ← DECREASED                                  │
│      - settlements_paid                                          │
│      + settlements_received                                      │
└───────────────────────────────────────────────────────────────────┘
```

---

### مسار 3️⃣: Profit Distribution → Current Account

```
┌─────────────────────────────────────────────────────────────────┐
│ المستخدم: توزيع أرباح                                             │
└───────────────┬─────────────────────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────────────────┐
│ 1. INSERT INTO profit_distributions                              │
│    - partner_id                                                   │
│    - amount_distributed                                           │
│    - distribution_date                                            │
│    - status = 'draft'                                            │
└───────────────┬───────────────────────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────────────────┐
│ 2. Manual Post (or trigger)                                      │
│    UPDATE profit_distributions SET status = 'posted'             │
└───────────────┬───────────────────────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────────────────┐
│ 3. Create Journal Entry                                          │
│                                                                   │
│    Line 1: Dr 3200 Retained Earnings (amount)                    │
│    Line 2: Cr 3100 Partner Capital   (amount)                    │
│                                                                   │
│    Status = 'Posted'                                             │
└───────────────┬───────────────────────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────────────────┐
│ 4. Update v_partner_balances View (automatic)                    │
│                                                                   │
│    current_account_balance =                                     │
│      profit_distributed  ← INCREASED                             │
│      - withdrawals                                               │
│      - settlements_paid                                          │
│      + settlements_received                                      │
└───────────────────────────────────────────────────────────────────┘
```

---

### مسار 4️⃣: Partner Settlement → Current Account (بين شركاء)

```
┌─────────────────────────────────────────────────────────────────┐
│ المستخدم: تسوية بين شريكين                                       │
│ مثال: شريك A يدفع لشريك B مبلغ 10,000                           │
└───────────────┬─────────────────────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────────────────┐
│ 1. INSERT INTO partner_settlements                               │
│    - from_partner_id = A                                         │
│    - to_partner_id   = B                                         │
│    - amount = 10000                                              │
│    - status = 'draft'                                            │
└───────────────┬───────────────────────────────────────────────────┘
                │
                │ TRIGGER: trg_partner_settlement_post_gl
                ▼
┌───────────────────────────────────────────────────────────────────┐
│ 2. Post to GL (AFTER INSERT)                                     │
│                                                                   │
│    Line 1: Dr 3100-A Partner A Capital (10000)                   │
│    Line 2: Cr 3100-B Partner B Capital (10000)                   │
│                                                                   │
│    Status = 'Posted'                                             │
└───────────────┬───────────────────────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────────────────┐
│ 3. Update Both Partners' Current Accounts                        │
│                                                                   │
│    Partner A:                                                    │
│      current_account -= 10000  (settlements_paid)                │
│                                                                   │
│    Partner B:                                                    │
│      current_account += 10000  (settlements_received)            │
└───────────────────────────────────────────────────────────────────┘
```

---

## 🗄️ الجداول والعلاقات

### جدول: `partners` (الشركاء)

```sql
partners
├── id                        uuid (PK)
├── name                      text
├── name_ar                   text
├── ownership_percentage      numeric    -- نسبة الملكية (%)
├── profit_share_percentage   numeric    -- نسبة توزيع الأرباح (%)
├── capital_contribution      numeric    -- رأس المال المساهم
├── share_percentage          numeric    -- (legacy - مهمل)
└── is_active                 boolean
```

### جدول: `partner_contributions` (مساهمات الشركاء)

```sql
partner_contributions
├── id                        uuid (PK)
├── partner_id                uuid (FK → partners)
├── amount                    numeric    -- المبلغ الإجمالي (شامل VAT)
├── net_amount                numeric    -- المبلغ الصافي
├── vat_amount                numeric    -- قيمة الضريبة
├── vat_category              enum       -- standard | exempt | zero_rated
├── tax_code                  text       -- S | E | Z
├── tax_rate                  numeric    -- 15%
├── contribution_type         text       -- operational | capital | asset
├── contribution_date         date
├── description               text
├── description_ar            text
├── attachment_url            text
├── is_deleted                boolean    -- soft delete
├── voided_at                 timestamp
├── voided_by                 uuid
└── created_by                uuid (FK → users)

-- الربط:
-- ينشئ تلقائياً operating_expense عبر trigger
```

### جدول: `operating_expenses` (المصروفات التشغيلية)

```sql
operating_expenses
├── id                        uuid (PK)
├── expense_number            text       -- OPEX-2026-0001
├── expense_type              text       -- operational | capital | asset
├── amount                    numeric
├── net_amount                numeric
├── vat_amount                numeric
├── vat_category              enum
├── tax_code                  text
├── tax_rate                  numeric
├── expense_date              date
├── payment_method            text       -- cash | bank_transfer
├── partner_contribution_id   uuid (FK)  -- الربط مع partner_contributions
├── description               text
├── notes                     text
├── is_deleted                boolean
└── created_by                uuid

-- الربط:
-- ينشئ journal_entry + vat_transaction عبر triggers
```

### جدول: `partner_withdrawals` (سحوبات الشركاء)

```sql
partner_withdrawals
├── id                        uuid (PK)
├── partner_id                uuid (FK → partners)
├── amount                    numeric
├── withdrawal_date           date
├── payment_method            text
├── description               text
├── description_ar            text
├── branch_id                 uuid (FK → branches)
├── journal_entry_id          uuid (FK → journal_entries)
├── is_voided                 boolean
└── created_by                uuid

-- ملاحظة:
-- لا يُنشأ تلقائياً - يجب استدعاء fn_record_partner_withdrawal()
-- يُنقص الحساب الجاري للشريك
```

### جدول: `profit_distributions` (توزيعات الأرباح)

```sql
profit_distributions
├── id                        uuid (PK)
├── partner_id                uuid (FK → partners)
├── amount_distributed        numeric
├── distribution_date         date
├── period_start              date
├── period_end                date
├── notes                     text
├── journal_entry_id          uuid (FK → journal_entries)
├── status                    text       -- draft | posted
└── created_by                uuid

-- ملاحظة:
-- يُزيد الحساب الجاري للشريك
-- يُسجل في GL: Dr Retained Earnings / Cr Partner Capital
```

### جدول: `partner_settlements` (تسويات بين الشركاء)

```sql
partner_settlements
├── id                        uuid (PK)
├── from_partner_id           uuid (FK → partners)  -- الدافع
├── to_partner_id             uuid (FK → partners)  -- المستلم
├── amount                    numeric
├── settlement_date           date
├── description               text
├── description_ar            text
├── payment_method            text
├── journal_entry_id          uuid (FK → journal_entries)
├── status                    text       -- draft | active | voided
└── created_by                uuid

-- التأثير:
-- from_partner: current_account -= amount
-- to_partner:   current_account += amount
```

---

## 🔧 Functions & Triggers

### Triggers على `partner_contributions`

```sql
-- 1. Compute VAT (BEFORE INSERT/UPDATE)
trg_compute_partner_contribution_vat
  → compute_partner_contribution_vat()
  → يحسب net_amount و vat_amount

-- 2. Create Operating Expense (AFTER INSERT)
trg_create_expense_from_contribution
  → create_expense_from_partner_contribution()
  → ينشئ operating_expense مرتبط

-- 3. Record VAT Transaction (AFTER INSERT/UPDATE)
trg_vat_tx_from_partner_contribution
  → record_vat_tx_from_partner_contribution()
  → يسجل في vat_transactions

-- 4. Freeze Financials (BEFORE UPDATE)
trg_freeze_partner_contributions_financials
  → freeze_partner_contributions_financials()
  → يمنع تعديل المبالغ بعد الإنشاء

-- 5. Prevent Delete (BEFORE DELETE)
trg_prevent_delete_partner_contributions
  → prevent_financial_delete()
  → يمنع الحذف الفعلي - soft delete فقط
```

### Triggers على `operating_expenses`

```sql
-- 1. Compute VAT (BEFORE INSERT/UPDATE)
trg_compute_operating_expense_vat
  → compute_operating_expense_vat()

-- 2. Post to GL (AFTER INSERT)
trg_post_operating_expense_gl
  → post_operating_expense_gl()
  → ينشئ journal_entry + journal_lines
  → Dr Expense / Dr VAT / Cr Capital

-- 3. Record VAT (AFTER INSERT/UPDATE)
trg_vat_tx_from_operating_expense
  → record_vat_tx_from_operating_expense()
```

### Triggers على `partner_settlements`

```sql
-- 1. Post to GL (AFTER INSERT)
trg_partner_settlement_post_gl
  → trg_partner_settlement_post_gl()
  → ينشئ journal_entry
  → Dr Partner A Capital / Cr Partner B Capital

-- 2. Freeze Financials (BEFORE UPDATE)
trg_freeze_partner_settlements_financials
  → freeze_partner_settlements_financials()
```

### Functions يدوية

```sql
-- 1. سحب شريك
fn_record_partner_withdrawal(
  p_partner_id uuid,
  p_amount numeric,
  p_method text,
  p_description text,
  ...
)
→ ينشئ partner_withdrawal + journal_entry

-- 2. تسوية شريك (atomic)
post_partner_settlement_atomic(p_settlement_id uuid)
→ يُرسل التسوية إلى GL

-- 3. إلغاء عملية شريك
void_partner_operation_atomic(
  p_expense_id uuid,
  p_reason text
)
→ عكس journal entry + soft delete

-- 4. توزيع عملية (router)
post_partner_operation_atomic(p_payload jsonb)
→ يوجه العملية حسب النوع:
  - capital   → Dr Cash / Cr Capital
  - inventory → Dr Inventory / Cr Capital
  - asset     → Dr Equipment / Cr Capital
  - operational → Dr OpExpense / Cr Capital
```

---

## 🔐 RLS Policies

### على `partner_contributions`

| Policy | Cmd | Roles | Logic |
|--------|-----|-------|-------|
| View | SELECT | admin, accountant, observer, super_admin | ✅ |
| Insert | INSERT | admin, accountant, super_admin | ✅ |
| Update | UPDATE | admin, accountant, super_admin | ✅ |
| Delete | DELETE | admin, super_admin | ✅ |
| Soft Delete Filter | SELECT/UPDATE | All | `is_deleted = false` |

### على `operating_expenses`

| Policy | Cmd | Roles | Logic |
|--------|-----|-------|-------|
| View | SELECT | admin, accountant, observer, super_admin | ✅ |
| Insert | INSERT | admin, accountant, super_admin | ✅ |
| Update | UPDATE | admin, accountant, super_admin | ✅ |
| Delete | DELETE | admin, super_admin | Blocked by trigger |

### على `partner_withdrawals` و `profit_distributions`

| Policy | Cmd | Roles | Logic |
|--------|-----|-------|-------|
| View | SELECT | admin, accountant, observer, super_admin | ✅ |
| Insert | INSERT | admin, super_admin | ✅ |
| Update | UPDATE | admin, super_admin | ✅ |
| Delete | DELETE | admin, super_admin | Blocked by trigger |

---

## 📊 حساب الحساب الجاري (View)

### `v_partner_balances`

```sql
CREATE VIEW v_partner_balances AS
SELECT
  p.id AS partner_id,
  p.name,
  p.ownership_percentage,
  p.profit_share_percentage,
  p.capital_contribution,

  -- السحوبات (-)
  COALESCE(wd.total_withdrawals, 0) AS total_withdrawals,

  -- الأرباح الموزعة (+)
  COALESCE(pd.total_distributed, 0) AS total_profit_distributed,

  -- التسويات المدفوعة (-)
  COALESCE(ss.total_settlements_paid, 0) AS total_settlements_paid,

  -- التسويات المستلمة (+)
  COALESCE(sr.total_settlements_received, 0) AS total_settlements_received,

  -- الحساب الجاري
  (
    COALESCE(pd.total_distributed, 0)
    - COALESCE(wd.total_withdrawals, 0)
    - COALESCE(ss.total_settlements_paid, 0)
    + COALESCE(sr.total_settlements_received, 0)
  ) AS current_account_balance

FROM partners p

LEFT JOIN (
  SELECT partner_id, SUM(amount) AS total_withdrawals
  FROM partner_withdrawals
  WHERE is_voided = false
  GROUP BY partner_id
) wd ON wd.partner_id = p.id

LEFT JOIN (
  SELECT partner_id, SUM(amount_distributed) AS total_distributed
  FROM profit_distributions
  WHERE status = 'posted'
  GROUP BY partner_id
) pd ON pd.partner_id = p.id

LEFT JOIN (
  SELECT from_partner_id AS partner_id, SUM(amount) AS total_settlements_paid
  FROM partner_settlements
  WHERE status NOT IN ('voided', 'void')
  GROUP BY from_partner_id
) ss ON ss.partner_id = p.id

LEFT JOIN (
  SELECT to_partner_id AS partner_id, SUM(amount) AS total_settlements_received
  FROM partner_settlements
  WHERE status NOT IN ('voided', 'void')
  GROUP BY to_partner_id
) sr ON sr.partner_id = p.id;
```

---

## 💡 أمثلة عملية

### مثال 1: شريك يدفع مصروف تشغيلي بقيمة 11,500 (شامل VAT)

```sql
-- Step 1: إدخال المساهمة
INSERT INTO partner_contributions (
  partner_id,
  amount,              -- 11,500 (شامل VAT)
  contribution_type,   -- 'operational'
  vat_category,        -- 'standard'
  description
) VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  11500,
  'operational',
  'standard',
  'دفع إيجار المحل - يناير 2026'
);

-- النتائج التلقائية:

-- 1. trg_compute_partner_contribution_vat:
--    net_amount = 11500 / 1.15 = 10,000
--    vat_amount = 11500 - 10000 = 1,500

-- 2. trg_create_expense_from_contribution:
--    INSERT INTO operating_expenses (
--      expense_number = 'OPEX-2026-0001',
--      amount = 11500,
--      net_amount = 10000,
--      vat_amount = 1500,
--      partner_contribution_id = [contribution_id]
--    )

-- 3. trg_post_operating_expense_gl:
--    INSERT INTO journal_entries (
--      entry_number = 'JE-OPEX-0001',
--      status = 'Posted'
--    )
--
--    INSERT INTO journal_lines VALUES
--      (Dr, 6000 Operating Expense, 10000),  -- Line 1
--      (Dr, 2140 VAT Input,         1500),   -- Line 2
--      (Cr, 3100 Partner Capital,  11500);   -- Line 3

-- 4. trg_vat_tx_from_partner_contribution:
--    INSERT INTO vat_transactions (
--      source_type = 'partner_contribution',
--      direction = 'input',
--      taxable_amount = 10000,
--      vat_amount = 1500,
--      status = 'open'
--    )

-- الحساب الجاري للشريك: لا يتغير
-- (لأن المساهمة لا تؤثر مباشرة على الحساب الجاري)
```

---

### مثال 2: شريك يسحب 50,000 من حسابه الجاري

```sql
-- استدعاء الـ function
SELECT fn_record_partner_withdrawal(
  p_partner_id := '550e8400-e29b-41d4-a716-446655440000',
  p_amount := 50000,
  p_method := 'bank_transfer',
  p_description := 'سحب شخصي',
  p_description_ar := 'سحب شخصي',
  p_withdrawal_date := '2026-02-25',
  p_branch_id := '...'
);

-- النتائج:

-- 1. INSERT INTO partner_withdrawals (
--      partner_id, amount = 50000, is_voided = false
--    )

-- 2. INSERT INTO journal_entries (...)
--    INSERT INTO journal_lines VALUES
--      (Dr, 3100 Partner Capital, 50000),   -- خصم من رأس مال الشريك
--      (Cr, 1110 Cash,            50000);   -- نقص النقدية

-- 3. v_partner_balances تحديث تلقائي:
--    current_account_balance =
--      profit_distributed (0)
--      - withdrawals (50000)    ← CHANGED
--      = -50000
```

---

### مثال 3: توزيع أرباح 100,000 على شريك

```sql
-- Step 1: إدخال التوزيع
INSERT INTO profit_distributions (
  partner_id,
  amount_distributed,
  distribution_date,
  status
) VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  100000,
  '2026-02-25',
  'draft'
);

-- Step 2: ترحيل التوزيع
UPDATE profit_distributions
SET status = 'posted'
WHERE id = '...';

-- النتائج:

-- 1. INSERT INTO journal_entries (...)
--    INSERT INTO journal_lines VALUES
--      (Dr, 3200 Retained Earnings, 100000),  -- خصم من الأرباح المحتجزة
--      (Cr, 3100 Partner Capital,   100000);  -- زيادة رأس مال الشريك

-- 2. v_partner_balances تحديث تلقائي:
--    current_account_balance =
--      profit_distributed (100000)  ← CHANGED
--      - withdrawals (50000)
--      = 50000
```

---

### مثال 4: تسوية بين شريكين (A يدفع لـ B مبلغ 30,000)

```sql
-- إدخال التسوية
INSERT INTO partner_settlements (
  from_partner_id,  -- Shاريك A
  to_partner_id,    -- شريك B
  amount,
  settlement_date,
  status
) VALUES (
  '550e8400-e29b-41d4-a716-446655440000',  -- A
  '660f9511-f39c-52e5-b827-557766551111',  -- B
  30000,
  '2026-02-25',
  'draft'
);

-- trg_partner_settlement_post_gl يُنفذ تلقائياً:

-- INSERT INTO journal_entries (...)
-- INSERT INTO journal_lines VALUES
--   (Dr, 3100-A Partner A Capital, 30000),  -- خصم من A
--   (Cr, 3100-B Partner B Capital, 30000);  -- إضافة إلى B

-- التأثير على الحساب الجاري:

-- شريك A:
--   current_account -= 30000  (settlements_paid)

-- شريك B:
--   current_account += 30000  (settlements_received)
```

---

## 🎯 ملخص نهائي

### ✅ ما يحدث تلقائياً:

| العملية | Auto-creates |
|---------|-------------|
| `partner_contribution` INSERT | → `operating_expense` → `journal_entry` → `vat_transaction` |
| `operating_expense` INSERT | → `journal_entry` → `vat_transaction` |
| `partner_settlement` INSERT | → `journal_entry` (Dr Partner A / Cr Partner B) |
| `partner_withdrawal` (via function) | → `journal_entry` (Dr Capital / Cr Cash) |
| `profit_distribution` UPDATE to posted | → `journal_entry` (Dr RE / Cr Capital) |

### ❌ ما لا يحدث تلقائياً:

- توزيع المصروفات حسب `ownership_percentage`
- إنشاء `partner_withdrawal` (يحتاج استدعاء function)
- توزيع الأرباح حسب `profit_share_percentage` (يدوي)

### 🔒 الحماية:

- ✅ RLS على كل الجداول
- ✅ Soft delete (is_deleted flag)
- ✅ Freeze financials (prevent updates)
- ✅ Prevent hard delete (triggers)
- ✅ Optimistic locking (version field)
- ✅ Audit trail (audit_logs)

### 📊 الحساب الجاري:

```
current_account_balance =
  + profit_distributions (posted)
  - partner_withdrawals (not voided)
  - partner_settlements (paid)
  + partner_settlements (received)
```

**لا يشمل:**
- ❌ partner_contributions (تذهب للمصروفات)
- ❌ capital_contribution (رأس المال الأولي فقط)

---

## 🚀 توصيات

### 1️⃣ إذا أردت توزيع تلقائي حسب النسب:

```sql
CREATE FUNCTION distribute_expense_to_partners(
  p_total_amount numeric,
  p_expense_type text
) RETURNS void AS $$
DECLARE
  v_partner RECORD;
BEGIN
  FOR v_partner IN
    SELECT id, ownership_percentage
    FROM partners
    WHERE is_active = true
  LOOP
    INSERT INTO partner_contributions (
      partner_id,
      amount,
      contribution_type
    ) VALUES (
      v_partner.id,
      p_total_amount * (v_partner.ownership_percentage / 100),
      p_expense_type
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;
```

### 2️⃣ للتحقق من الحساب الجاري:

```sql
-- عرض الحساب الجاري لكل شريك
SELECT * FROM v_partner_balances;

-- التحقق من تطابق GL مع الحساب الجاري
SELECT
  p.name,
  pb.current_account_balance AS domain_balance,
  COALESCE(gl.balance, 0) AS gl_balance_3100,
  (pb.current_account_balance - COALESCE(gl.balance, 0)) AS variance
FROM v_partner_balances pb
JOIN partners p ON p.id = pb.partner_id
LEFT JOIN (
  SELECT
    -- هنا يجب ربط partner_id مع journal_lines لحساب 3100
    SUM(credit - debit) AS balance
  FROM journal_lines jl
  JOIN accounts a ON a.id = jl.account_id
  WHERE a.code = '3100'
) gl ON true;
```

---

**نهاية الوثيقة** 🏁
