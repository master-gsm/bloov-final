# 🎨 مخطط بصري - تدفق بيانات الشركاء

## 📊 Diagram 1: العلاقات بين الجداول

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            PARTNERS TABLE                               │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ • id (PK)                                                        │  │
│  │ • name, name_ar                                                  │  │
│  │ • ownership_percentage      (نسبة الملكية %)                    │  │
│  │ • profit_share_percentage   (نسبة توزيع الأرباح %)              │  │
│  │ • capital_contribution      (رأس المال المساهم)                 │  │
│  │ • is_active                                                      │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└───────────────┬─────────────────────────────────────────────────────────┘
                │
                │ FK: partner_id
                │
    ┌───────────┼───────────┬───────────────┬────────────────────┐
    │           │           │               │                    │
    ▼           ▼           ▼               ▼                    ▼
┌─────────┐ ┌─────────┐ ┌─────────┐  ┌──────────────┐  ┌──────────────┐
│ partner │ │ partner │ │ profit  │  │   partner    │  │   partner    │
│contribu-│ │withdraw-│ │distribu-│  │  settlements │  │ distributions│
│ tions   │ │  als    │ │  tions  │  │              │  │              │
└────┬────┘ └────┬────┘ └────┬────┘  └──┬───────┬───┘  └──────────────┘
     │           │           │           │       │
     │ auto      │ manual    │ manual    │       │
     │ creates   │ via fn    │ via fn    │  from │  to
     ▼           │           │           │       │
┌─────────┐      │           │           │       │
│operating│      │           │           │       │
│expenses │      │           │           │       │
└────┬────┘      │           │           │       │
     │           │           │           │       │
     │ triggers  │           │           │       │
     ▼           ▼           ▼           ▼       ▼
┌───────────────────────────────────────────────────────┐
│           JOURNAL_ENTRIES + JOURNAL_LINES             │
│  ┌────────────────────────────────────────────────┐  │
│  │ reference_type:                                │  │
│  │   • 'operating_expense'                        │  │
│  │   • 'partner_contribution'                     │  │
│  │   • 'partner_withdrawal'                       │  │
│  │   • 'partner_settlement'                       │  │
│  │   • 'profit_distribution'                      │  │
│  └────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────┘
     │
     │ posts to
     ▼
┌───────────────────────────────────────────────────────┐
│            CHART OF ACCOUNTS (GL)                     │
│  ┌────────────────────────────────────────────────┐  │
│  │ 1110  Cash                                     │  │
│  │ 1132  Inventory                                │  │
│  │ 1213  Equipment (Fixed Assets)                 │  │
│  │ 2140  VAT Payable (Input)                      │  │
│  │ 3100  Partner Capital ★                        │  │
│  │ 3200  Retained Earnings                        │  │
│  │ 6000  Operating Expenses                       │  │
│  └────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────┘
```

---

## 🔄 Diagram 2: تدفق Partner Contribution → GL

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      USER ACTION: إدخال مساهمة شريك                     │
│                                                                         │
│  Frontend → INSERT INTO partner_contributions (                        │
│    partner_id,                                                         │
│    amount = 11,500,          ← إجمالي شامل VAT                         │
│    contribution_type = 'operational',                                  │
│    vat_category = 'standard'                                           │
│  )                                                                     │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
        ┌────────────────────────────────────────────────┐
        │   TRIGGER: trg_compute_partner_contribution_vat│
        │   BEFORE INSERT                                │
        │                                                │
        │   Calculates:                                  │
        │   • net_amount = 11500 / 1.15 = 10,000        │
        │   • vat_amount = 11500 - 10000 = 1,500        │
        │   • tax_rate = 15%                            │
        │   • tax_code = 'S'                            │
        └───────────────────┬────────────────────────────┘
                            │
                            ▼
        ┌──────────────────────────────────────────────────────┐
        │   partner_contributions ROW CREATED                  │
        │   ┌──────────────────────────────────────────────┐  │
        │   │ id: abc123                                   │  │
        │   │ partner_id: partner-001                      │  │
        │   │ amount: 11,500                               │  │
        │   │ net_amount: 10,000                           │  │
        │   │ vat_amount: 1,500                            │  │
        │   │ contribution_type: 'operational'             │  │
        │   └──────────────────────────────────────────────┘  │
        └───────────────────┬──────────────────────────────────┘
                            │
                            ▼
        ┌────────────────────────────────────────────────┐
        │   TRIGGER: trg_create_expense_from_contribution│
        │   AFTER INSERT                                 │
        │                                                │
        │   Creates operating_expense:                   │
        │   • expense_number = 'OPEX-2026-0001'         │
        │   • amount = 11,500                           │
        │   • partner_contribution_id = abc123          │
        └───────────────────┬────────────────────────────┘
                            │
                            ▼
        ┌──────────────────────────────────────────────────────┐
        │   operating_expenses ROW CREATED                     │
        │   ┌──────────────────────────────────────────────┐  │
        │   │ id: exp456                                   │  │
        │   │ expense_number: 'OPEX-2026-0001'             │  │
        │   │ amount: 11,500                               │  │
        │   │ net_amount: 10,000                           │  │
        │   │ vat_amount: 1,500                            │  │
        │   │ partner_contribution_id: abc123              │  │
        │   └──────────────────────────────────────────────┘  │
        └───────────────────┬──────────────────────────────────┘
                            │
                            ▼
        ┌────────────────────────────────────────────────┐
        │   TRIGGER: trg_post_operating_expense_gl       │
        │   AFTER INSERT                                 │
        │                                                │
        │   Creates journal_entry (Draft then Posted):   │
        └───────────────────┬────────────────────────────┘
                            │
                            ▼
        ┌──────────────────────────────────────────────────────┐
        │   journal_entries ROW CREATED                        │
        │   ┌──────────────────────────────────────────────┐  │
        │   │ id: je789                                    │  │
        │   │ entry_number: 'JE-OPEX-0001'                 │  │
        │   │ reference_type: 'operating_expense'          │  │
        │   │ reference_id: exp456                         │  │
        │   │ status: 'Draft' → 'Posted'                   │  │
        │   └──────────────────────────────────────────────┘  │
        └───────────────────┬──────────────────────────────────┘
                            │
                            ▼
        ┌──────────────────────────────────────────────────────┐
        │   journal_lines ROWS CREATED (3 lines)               │
        │                                                      │
        │   ┌──────────────────────────────────────────────┐  │
        │   │ Line 1:                                      │  │
        │   │   Dr 6000 Operating Expense    10,000       │  │
        │   │   Cr                                0       │  │
        │   └──────────────────────────────────────────────┘  │
        │                                                      │
        │   ┌──────────────────────────────────────────────┐  │
        │   │ Line 2:                                      │  │
        │   │   Dr 2140 VAT Input             1,500       │  │
        │   │   Cr                                0       │  │
        │   └──────────────────────────────────────────────┘  │
        │                                                      │
        │   ┌──────────────────────────────────────────────┐  │
        │   │ Line 3:                                      │  │
        │   │   Dr                                0       │  │
        │   │   Cr 3100 Partner Capital      11,500       │  │
        │   └──────────────────────────────────────────────┘  │
        │                                                      │
        │   Balance: Dr = Cr = 11,500 ✅                      │
        └───────────────────┬──────────────────────────────────┘
                            │
                            ▼
        ┌────────────────────────────────────────────────┐
        │   TRIGGER: trg_vat_tx_from_partner_contribution│
        │   AFTER INSERT                                 │
        │                                                │
        │   Creates vat_transaction:                     │
        └───────────────────┬────────────────────────────┘
                            │
                            ▼
        ┌──────────────────────────────────────────────────────┐
        │   vat_transactions ROW CREATED                       │
        │   ┌──────────────────────────────────────────────┐  │
        │   │ source_type: 'partner_contribution'          │  │
        │   │ source_id: abc123                            │  │
        │   │ direction: 'input'                           │  │
        │   │ taxable_amount: 10,000                       │  │
        │   │ vat_amount: 1,500                            │  │
        │   │ status: 'open'                               │  │
        │   └──────────────────────────────────────────────┘  │
        └──────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                          FINAL STATE                                    │
│                                                                         │
│  ✅ 1 partner_contribution (abc123)                                    │
│  ✅ 1 operating_expense (exp456) linked to abc123                      │
│  ✅ 1 journal_entry (je789) Posted, ref: exp456                        │
│  ✅ 3 journal_lines (balanced)                                         │
│  ✅ 1 vat_transaction (input, open)                                    │
│                                                                         │
│  Partner Current Account: UNCHANGED                                    │
│  (Contributions don't affect current account directly)                 │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 💸 Diagram 3: تدفق Partner Withdrawal → Current Account

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   USER ACTION: سحب شريك 50,000                          │
│                                                                         │
│  Frontend → CALL fn_record_partner_withdrawal(                         │
│    p_partner_id = 'partner-001',                                       │
│    p_amount = 50000,                                                   │
│    p_method = 'bank_transfer',                                         │
│    p_description = 'سحب شخصي'                                          │
│  )                                                                     │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
        ┌────────────────────────────────────────────────┐
        │   FUNCTION: fn_record_partner_withdrawal()     │
        │   SECURITY DEFINER                             │
        │                                                │
        │   1. Validate partner exists & is active       │
        │   2. Create partner_withdrawal record          │
        │   3. Create journal_entry (Draft → Posted)     │
        │   4. Return success                            │
        └───────────────────┬────────────────────────────┘
                            │
                            ▼
        ┌──────────────────────────────────────────────────────┐
        │   partner_withdrawals ROW CREATED                    │
        │   ┌──────────────────────────────────────────────┐  │
        │   │ id: wd123                                    │  │
        │   │ partner_id: partner-001                      │  │
        │   │ amount: 50,000                               │  │
        │   │ payment_method: 'bank_transfer'              │  │
        │   │ is_voided: false                             │  │
        │   │ journal_entry_id: je-wd-001                  │  │
        │   └──────────────────────────────────────────────┘  │
        └───────────────────┬──────────────────────────────────┘
                            │
                            ▼
        ┌──────────────────────────────────────────────────────┐
        │   journal_entries + journal_lines CREATED            │
        │                                                      │
        │   Entry: je-wd-001 (Posted)                          │
        │   ┌──────────────────────────────────────────────┐  │
        │   │ Line 1:                                      │  │
        │   │   Dr 3100 Partner Capital      50,000       │  │
        │   │   Cr                                0       │  │
        │   └──────────────────────────────────────────────┘  │
        │                                                      │
        │   ┌──────────────────────────────────────────────┐  │
        │   │ Line 2:                                      │  │
        │   │   Dr                                0       │  │
        │   │   Cr 1110 Cash                 50,000       │  │
        │   └──────────────────────────────────────────────┘  │
        └───────────────────┬──────────────────────────────────┘
                            │
                            ▼
        ┌──────────────────────────────────────────────────────┐
        │   v_partner_balances AUTO-UPDATED (VIEW)             │
        │                                                      │
        │   Current Account Balance Calculation:               │
        │   ┌──────────────────────────────────────────────┐  │
        │   │ Before:                                      │  │
        │   │   + profit_distributed       100,000        │  │
        │   │   - withdrawals                    0        │  │
        │   │   - settlements_paid               0        │  │
        │   │   + settlements_received           0        │  │
        │   │   = Current Account        100,000          │  │
        │   └──────────────────────────────────────────────┘  │
        │                                                      │
        │   ┌──────────────────────────────────────────────┐  │
        │   │ After:                                       │  │
        │   │   + profit_distributed       100,000        │  │
        │   │   - withdrawals               50,000 ← NEW  │  │
        │   │   - settlements_paid               0        │  │
        │   │   + settlements_received           0        │  │
        │   │   = Current Account         50,000          │  │
        │   └──────────────────────────────────────────────┘  │
        └──────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                          IMPACT SUMMARY                                 │
│                                                                         │
│  ✅ Partner Capital (3100) decreased by 50,000                         │
│  ✅ Cash (1110) decreased by 50,000                                    │
│  ✅ Current Account Balance decreased by 50,000                        │
│                                                                         │
│  GL Entry:                                                             │
│    Dr 3100 Partner Capital    50,000                                   │
│    Cr 1110 Cash               50,000                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🤝 Diagram 4: تدفق Partner Settlement (بين شركاء)

```
┌─────────────────────────────────────────────────────────────────────────┐
│              USER ACTION: تسوية بين شركاء                               │
│              شريك A يدفع لشريك B مبلغ 30,000                            │
│                                                                         │
│  Frontend → INSERT INTO partner_settlements (                          │
│    from_partner_id = 'partner-A',                                      │
│    to_partner_id = 'partner-B',                                        │
│    amount = 30000,                                                     │
│    status = 'draft'                                                    │
│  )                                                                     │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
        ┌────────────────────────────────────────────────┐
        │   partner_settlements ROW CREATED              │
        │   ┌──────────────────────────────────────────┐│
        │   │ id: settle123                            ││
        │   │ from_partner_id: A                       ││
        │   │ to_partner_id: B                         ││
        │   │ amount: 30,000                           ││
        │   │ status: 'draft'                          ││
        │   └──────────────────────────────────────────┘│
        └───────────────────┬────────────────────────────┘
                            │
                            ▼
        ┌────────────────────────────────────────────────┐
        │   TRIGGER: trg_partner_settlement_post_gl      │
        │   AFTER INSERT                                 │
        │                                                │
        │   Creates journal_entry:                       │
        │   • Dr Partner A Capital (3100-A)             │
        │   • Cr Partner B Capital (3100-B)             │
        └───────────────────┬────────────────────────────┘
                            │
                            ▼
        ┌──────────────────────────────────────────────────────┐
        │   journal_entries + journal_lines CREATED            │
        │                                                      │
        │   Entry: JE-SETTLE-001 (Posted)                      │
        │   ┌──────────────────────────────────────────────┐  │
        │   │ Line 1:                                      │  │
        │   │   Dr 3100 Partner A Capital    30,000       │  │
        │   │   Cr                                0       │  │
        │   │   Description: "Settlement from A to B"     │  │
        │   └──────────────────────────────────────────────┘  │
        │                                                      │
        │   ┌──────────────────────────────────────────────┐  │
        │   │ Line 2:                                      │  │
        │   │   Dr                                0       │  │
        │   │   Cr 3100 Partner B Capital    30,000       │  │
        │   │   Description: "Settlement received from A" │  │
        │   └──────────────────────────────────────────────┘  │
        └───────────────────┬──────────────────────────────────┘
                            │
                            ▼
        ┌──────────────────────────────────────────────────────┐
        │   v_partner_balances AUTO-UPDATED (VIEW)             │
        │                                                      │
        │   ┌──────────────────────────────────────────────┐  │
        │   │ Partner A Current Account:                   │  │
        │   │                                              │  │
        │   │ Before:                                      │  │
        │   │   + profit_distributed       100,000        │  │
        │   │   - withdrawals               50,000        │  │
        │   │   - settlements_paid               0        │  │
        │   │   + settlements_received           0        │  │
        │   │   = Current Account         50,000          │  │
        │   │                                              │  │
        │   │ After:                                       │  │
        │   │   + profit_distributed       100,000        │  │
        │   │   - withdrawals               50,000        │  │
        │   │   - settlements_paid          30,000 ← NEW  │  │
        │   │   + settlements_received           0        │  │
        │   │   = Current Account         20,000          │  │
        │   └──────────────────────────────────────────────┘  │
        │                                                      │
        │   ┌──────────────────────────────────────────────┐  │
        │   │ Partner B Current Account:                   │  │
        │   │                                              │  │
        │   │ Before:                                      │  │
        │   │   + profit_distributed        80,000        │  │
        │   │   - withdrawals               30,000        │  │
        │   │   - settlements_paid               0        │  │
        │   │   + settlements_received           0        │  │
        │   │   = Current Account         50,000          │  │
        │   │                                              │  │
        │   │ After:                                       │  │
        │   │   + profit_distributed        80,000        │  │
        │   │   - withdrawals               30,000        │  │
        │   │   - settlements_paid               0        │  │
        │   │   + settlements_received      30,000 ← NEW  │  │
        │   │   = Current Account         80,000          │  │
        │   └──────────────────────────────────────────────┘  │
        └──────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                          IMPACT SUMMARY                                 │
│                                                                         │
│  Partner A:                                                            │
│    ✅ Capital (3100-A) decreased by 30,000                             │
│    ✅ Current Account decreased by 30,000                              │
│                                                                         │
│  Partner B:                                                            │
│    ✅ Capital (3100-B) increased by 30,000                             │
│    ✅ Current Account increased by 30,000                              │
│                                                                         │
│  Total Capital in System: UNCHANGED (transfer between partners)        │
│                                                                         │
│  GL Entry:                                                             │
│    Dr 3100 Partner A Capital    30,000                                 │
│    Cr 3100 Partner B Capital    30,000                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Diagram 5: Current Account Balance Formula

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PARTNER CURRENT ACCOUNT FORMULA                      │
│                                                                         │
│  current_account_balance =                                             │
│                                                                         │
│    ┌─────────────────────────────────────────────────────────────┐    │
│    │  + PROFIT DISTRIBUTIONS (posted)                            │    │
│    │    ↳ من جدول: profit_distributions                          │    │
│    │    ↳ شرط: status = 'posted'                                 │    │
│    │    ↳ GL: Dr Retained Earnings / Cr Partner Capital         │    │
│    └─────────────────────────────────────────────────────────────┘    │
│                                                                         │
│    ┌─────────────────────────────────────────────────────────────┐    │
│    │  - WITHDRAWALS (not voided)                                 │    │
│    │    ↳ من جدول: partner_withdrawals                           │    │
│    │    ↳ شرط: is_voided = false                                 │    │
│    │    ↳ GL: Dr Partner Capital / Cr Cash                       │    │
│    └─────────────────────────────────────────────────────────────┘    │
│                                                                         │
│    ┌─────────────────────────────────────────────────────────────┐    │
│    │  - SETTLEMENTS PAID (active)                                │    │
│    │    ↳ من جدول: partner_settlements (from_partner_id)        │    │
│    │    ↳ شرط: status NOT IN ('voided', 'void')                  │    │
│    │    ↳ GL: Dr Partner Capital / Cr Other Partner Capital     │    │
│    └─────────────────────────────────────────────────────────────┘    │
│                                                                         │
│    ┌─────────────────────────────────────────────────────────────┐    │
│    │  + SETTLEMENTS RECEIVED (active)                            │    │
│    │    ↳ من جدول: partner_settlements (to_partner_id)          │    │
│    │    ↳ شرط: status NOT IN ('voided', 'void')                  │    │
│    │    ↳ GL: Dr Other Partner Capital / Cr Partner Capital     │    │
│    └─────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ═══════════════════════════════════════════════════════════════       │
│                                                                         │
│  = CURRENT ACCOUNT BALANCE                                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                    WHAT IS NOT INCLUDED                                 │
│                                                                         │
│  ❌ partner_contributions                                              │
│     → تذهب إلى operating_expenses فقط                                 │
│     → لا تؤثر على الحساب الجاري مباشرة                                │
│     → تُسجل في GL كـ expense                                           │
│                                                                         │
│  ❌ capital_contribution (field in partners table)                     │
│     → رقم ثابت للمراجعة فقط                                           │
│     → لا يتم حسابه ديناميكياً                                          │
│                                                                         │
│  ❌ operating_expenses                                                 │
│     → تُعتبر مصروفات على الشركة وليس على الشريك                       │
│                                                                         │
│  ❌ setup_expenses                                                     │
│     → مصروفات رأسمالية ذهبت للأصول الثابتة                            │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🔐 Diagram 6: RLS Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         RLS POLICY FLOW                                 │
└─────────────────────────────┬───────────────────────────────────────────┘
                              │
                              ▼
                ┌─────────────────────────┐
                │  User makes query       │
                │  (SELECT/INSERT/UPDATE) │
                └────────┬────────────────┘
                         │
                         ▼
        ┌────────────────────────────────────────┐
        │  Check: Which role is user?            │
        │  ┌──────────────────────────────────┐  │
        │  │ (SELECT auth.uid())              │  │
        │  │ FROM users                        │  │
        │  │ WHERE id = auth.uid()             │  │
        │  └──────────────────────────────────┘  │
        └────┬──────────────────┬────────────────┘
             │                  │
    ┌────────┴────────┐    ┌────┴──────────┐
    │ admin           │    │ accountant    │
    │ super_admin     │    │               │
    └────────┬────────┘    └────┬──────────┘
             │                  │
             ▼                  ▼
    ┌─────────────────────────────────────┐
    │  Policy allows:                     │
    │  ✅ SELECT                          │
    │  ✅ INSERT                          │
    │  ✅ UPDATE                          │
    │  ✅ DELETE (admin only)             │
    └─────────────────────────────────────┘
                      │
                      ▼
        ┌─────────────────────────────┐
        │  Additional filter:         │
        │  is_deleted = false         │
        │  (soft delete policy)       │
        └─────────────┬───────────────┘
                      │
                      ▼
        ┌─────────────────────────────┐
        │  QUERY ALLOWED              │
        │  Returns filtered results   │
        └─────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                    TRIGGER EXECUTION (SECURITY DEFINER)                 │
│                                                                         │
│  Triggers run with SECURITY DEFINER:                                   │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  CREATE FUNCTION post_operating_expense_gl()                     │  │
│  │  SECURITY DEFINER  ← Runs as function owner (superuser)          │  │
│  │  SET search_path TO 'public', 'pg_temp'                          │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  Impact:                                                               │
│  ✅ Triggers bypass RLS policies                                       │
│  ✅ Can insert into journal_entries without permission check          │
│  ✅ Can update is_deleted even with soft delete filter                │
│  ✅ Uses set_config('app.bypass_immutable', 'true') when needed       │
│                                                                         │
│  Security:                                                             │
│  ✅ search_path prevents SQL injection                                 │
│  ✅ Functions are audited and trusted                                  │
│  ✅ Only called by triggers or authorized RPC                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Diagram 7: Complete Data Flow Map

```
                                PARTNERS ECOSYSTEM
================================================================================

                            ┌──────────────────┐
                            │    PARTNERS      │
                            │                  │
                            │  • A (50%)       │
                            │  • B (30%)       │
                            │  • C (20%)       │
                            └────────┬─────────┘
                                     │
                     ┌───────────────┼───────────────┐
                     │               │               │
                     ▼               ▼               ▼
        ┌────────────────┐  ┌───────────────┐  ┌────────────────┐
        │ CONTRIBUTIONS  │  │  WITHDRAWALS  │  │ DISTRIBUTIONS  │
        │                │  │               │  │                │
        │ Partners pay   │  │ Partners take │  │ Profits shared │
        │ expenses       │  │ money out     │  │ to partners    │
        └───────┬────────┘  └───────┬───────┘  └────────┬───────┘
                │                   │                    │
                │ Creates           │ Creates            │ Creates
                ▼                   ▼                    ▼
        ┌────────────────┐  ┌───────────────┐  ┌────────────────┐
        │ operating_     │  │ journal_      │  │ journal_       │
        │ expenses       │  │ entries       │  │ entries        │
        └───────┬────────┘  └───────┬───────┘  └────────┬───────┘
                │                   │                    │
                │ Posts to GL       │ Posts to GL        │ Posts to GL
                └───────────────────┼────────────────────┘
                                    │
                                    ▼
                        ┌───────────────────────┐
                        │  JOURNAL ENTRIES      │
                        │                       │
                        │  All partner          │
                        │  transactions         │
                        │  recorded here        │
                        └───────────┬───────────┘
                                    │
                                    │ Updates
                                    ▼
                        ┌───────────────────────┐
                        │  CHART OF ACCOUNTS    │
                        │                       │
                        │  3100: Partner Capital│
                        │  6000: Expenses       │
                        │  1110: Cash           │
                        └───────────────────────┘

CURRENT ACCOUNT CALCULATION (Independent of GL):
================================================

┌─────────────────────────────────────────────────────────────────────────┐
│  v_partner_balances VIEW                                                │
│                                                                         │
│  SELECT                                                                 │
│    partner_id,                                                         │
│    (                                                                   │
│      COALESCE(profit_distributed, 0)       ← FROM profit_distributions │
│      - COALESCE(withdrawals, 0)            ← FROM partner_withdrawals  │
│      - COALESCE(settlements_paid, 0)       ← FROM partner_settlements  │
│      + COALESCE(settlements_received, 0)   ← FROM partner_settlements  │
│    ) AS current_account_balance                                        │
│  FROM partners                                                         │
└─────────────────────────────────────────────────────────────────────────┘

DUAL TRACKING SYSTEM:
====================

┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  Domain Tables                    vs.          General Ledger          │
│  ==============                                 ==============          │
│                                                                         │
│  • partner_contributions                        • journal_entries      │
│  • partner_withdrawals                          • journal_lines        │
│  • profit_distributions              ⟷         • account balances    │
│  • partner_settlements                                                 │
│                                                                         │
│  Used for:                                      Used for:              │
│  • Business logic                               • Financial reports    │
│  • Current account                              • Trial balance        │
│  • Partner statements                           • Income statement     │
│  • Audit trail                                  • Balance sheet        │
│                                                                         │
│  Both systems sync via triggers (automatic)                            │
└─────────────────────────────────────────────────────────────────────────┘
```

---

**نهاية المخططات البصرية** 🎨
