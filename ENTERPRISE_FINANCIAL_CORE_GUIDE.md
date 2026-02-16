# Enterprise Financial Core - Implementation Guide
## Multi-Currency General Ledger System

**Date:** 2026-02-16
**Status:** ✅ DEPLOYED SUCCESSFULLY
**Migration:** `recreate_enterprise_financial_core.sql`

---

## 📊 Executive Summary

Complete enterprise-grade financial accounting system with multi-currency support, period locking, and immutable posted entries. Built on 5 fundamental pillars for financial integrity.

**Key Features:**
- ✅ Multi-currency transactions with automatic base currency conversion
- ✅ Accounting period management with open/closed status
- ✅ Immutable posted entries (cannot be modified or deleted)
- ✅ Reversing entry pattern for corrections
- ✅ Strict double-entry balance enforcement
- ✅ Branch-level isolation for journal entries
- ✅ Global chart of accounts (shared across branches)

---

## 🏛️ The 5 Pillars Architecture

### Pillar 1: Schema (Core Tables)

#### 1.1 Accounting Periods
**Purpose:** Manage financial close and period locking

```sql
accounting_periods (
  id UUID PRIMARY KEY,
  name VARCHAR(100) UNIQUE,
  start_date DATE,
  end_date DATE,
  is_closed BOOLEAN DEFAULT false,
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES users
)
```

**Features:**
- Date range validation (end_date >= start_date)
- Close status tracking with audit trail
- Prevents posting to closed periods

**Example Data:**
- January 2026: 2026-01-01 to 2026-01-31 (Open)
- February 2026: 2026-02-01 to 2026-02-28 (Open)

---

#### 1.2 Chart of Accounts (Global)
**Purpose:** Unified account structure across all branches

```sql
accounts (
  id UUID PRIMARY KEY,
  code VARCHAR(20) UNIQUE,
  name VARCHAR(200),
  name_ar VARCHAR(200),
  type VARCHAR(20), -- Asset/Liability/Equity/Revenue/Expense/COGS
  parent_id UUID REFERENCES accounts,
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false
)
```

**Features:**
- Hierarchical structure (parent-child relationships)
- System accounts protection (cannot be deleted)
- Multi-language support (EN/AR)
- Global scope (no branch_id)

**Account Types:**
- Asset (1000-1999)
- Liability (2000-2999)
- Equity (3000-3999)
- Revenue (4000-4999)
- COGS (5000-5999)
- Expense (6000-6999)

**Standard Chart Includes 33 Accounts:**
- 15 Asset accounts (Cash, Receivables, Inventory, PPE)
- 7 Liability accounts (Payables, Loans, VAT)
- 4 Equity accounts (Capital, Retained Earnings, Current Year)
- 3 Revenue accounts (Sales, Services)
- 2 COGS accounts
- 2 Expense accounts (Salaries, Rent, Utilities)

---

#### 1.3 Journal Entries (Headers)
**Purpose:** Journal entry metadata with multi-currency support

```sql
journal_entries (
  id UUID PRIMARY KEY,
  entry_number VARCHAR(50) UNIQUE, -- JE-YYYY-NNNN (immutable)
  date DATE,
  description TEXT,
  status VARCHAR(20), -- Draft/Posted/Void
  branch_id UUID REFERENCES branches,

  -- Multi-Currency
  currency_code VARCHAR(3) DEFAULT 'SAR',
  exchange_rate NUMERIC(15, 6) DEFAULT 1.0,

  -- Period Control
  period_locked BOOLEAN DEFAULT false,

  -- Reversal Tracking
  original_entry_id UUID REFERENCES journal_entries,
  reverse_entry_id UUID REFERENCES journal_entries,

  -- Audit Trail
  created_by UUID,
  posted_by UUID,
  voided_by UUID,
  created_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ
)
```

**Features:**
- Auto-generated entry numbers (JE-2026-0001, JE-2026-0002, ...)
- Multi-currency with exchange rate tracking
- Status workflow: Draft → Posted → Void
- Period locking integration
- Full audit trail with timestamps and users
- Reversing entry linkage

**Status Workflow:**
```
Draft → Posted (when balanced and valid)
Posted → Void (via void_journal_entry function only)
```

---

#### 1.4 Journal Lines (Details)
**Purpose:** Individual debit/credit lines with automatic currency conversion

```sql
journal_lines (
  id UUID PRIMARY KEY,
  journal_entry_id UUID REFERENCES journal_entries ON DELETE RESTRICT,
  account_id UUID REFERENCES accounts,

  -- Transaction Currency
  debit NUMERIC(15, 2) DEFAULT 0,
  credit NUMERIC(15, 2) DEFAULT 0,

  -- Base Currency (SAR) - Auto-calculated
  base_debit NUMERIC(15, 2) DEFAULT 0,
  base_credit NUMERIC(15, 2) DEFAULT 0,

  description TEXT,
  line_number INTEGER
)
```

**Features:**
- Transaction currency amounts (debit/credit)
- Auto-calculated base currency amounts (SAR)
- One-sided entries only (either debit OR credit, not both)
- DELETE RESTRICT (cannot delete lines if entry exists)
- Line numbering for ordering

**Validation Rules:**
- Amounts must be >= 0
- Either debit OR credit (not both)
- At least one amount must be > 0
- Base amounts auto-calculated on insert/update

---

### Pillar 2: Business Logic (Triggers)

#### 2.1 Multi-Currency Engine
**Trigger:** `trg_calculate_base_currency`
**Function:** `calculate_base_currency_amounts()`

**Purpose:** Automatically convert transaction currency to base currency (SAR)

**Logic:**
```sql
base_debit = debit × exchange_rate
base_credit = credit × exchange_rate
```

**Example:**
```
Transaction: 100 USD debit
Exchange Rate: 3.75
Result: base_debit = 375.00 SAR
```

**Security:** SECURITY DEFINER with search_path pinning

---

#### 2.2 Period Lock Enforcement
**Trigger:** `trg_check_period_lock`
**Function:** `check_period_lock()`

**Purpose:** Prevent posting to closed accounting periods

**Logic:**
1. Check if entry date falls within a closed period
2. If yes, raise exception: "Cannot post to closed period: [name]"
3. If in open period, mark entry with period_locked = false
4. Only checks on INSERT or UPDATE when status = 'Posted'

**Example:**
```
Entry Date: 2026-01-15
Period: January 2026 (is_closed = true)
Result: ERROR - Cannot post to closed period
```

**Security:** SECURITY DEFINER with search_path pinning

---

#### 2.3 Strict Balance Enforcement
**Trigger:** `trg_enforce_strict_balance`
**Function:** `enforce_strict_balance()`

**Purpose:** Enforce double-entry accounting balance before posting

**Validation Checks:**
1. **Minimum Lines:** Entry must have at least 2 lines
2. **Balance:** SUM(base_debit) must equal SUM(base_credit) (tolerance: 0.01)
3. **Void Requirement:** Void status requires reverse_entry_id

**Example:**
```
Line 1: Debit 1000 SAR (Cash)
Line 2: Credit 1000 SAR (Revenue)
Total: 1000 = 1000 → ✅ BALANCED

Line 1: Debit 1000 SAR
Line 2: Credit 900 SAR
Total: 1000 ≠ 900 → ❌ ERROR
```

**Security:** SECURITY DEFINER with search_path pinning

---

#### 2.4 Immutability Protection (Headers)
**Trigger:** `trg_protect_posted_entries`
**Function:** `protect_posted_entries()`

**Purpose:** Prevent modification of posted/voided entries

**Rules:**
- ❌ Cannot DELETE Posted or Void entries
- ❌ Cannot UPDATE Posted entries (except status change to Void)
- ❌ Cannot UPDATE Void entries at all
- ❌ Cannot modify entry_number (always immutable)

**Allowed Operations:**
- ✅ UPDATE status from Posted → Void (via void function)
- ✅ DELETE Draft entries

**Security:** SECURITY DEFINER with search_path pinning

---

#### 2.5 Immutability Protection (Lines)
**Trigger:** `trg_protect_posted_lines`
**Function:** `protect_posted_entry_lines()`

**Purpose:** Prevent modification of lines in posted/voided entries

**Rules:**
- ❌ Cannot INSERT new lines to Posted/Void entries
- ❌ Cannot UPDATE existing lines in Posted/Void entries
- ❌ Cannot DELETE lines from Posted/Void entries

**Security:** SECURITY DEFINER with search_path pinning

---

#### 2.6 Entry Number Generation
**Trigger:** `trg_generate_entry_number`
**Function:** `generate_entry_number()`

**Purpose:** Auto-generate sequential entry numbers

**Format:** `JE-YYYY-NNNN`
- JE = Journal Entry
- YYYY = Year from entry date
- NNNN = Sequential number (padded to 4 digits)

**Examples:**
- JE-2026-0001
- JE-2026-0002
- JE-2027-0001 (resets each year)

**Security:** SECURITY DEFINER with search_path pinning

---

### Pillar 3: Void Logic

#### Function: void_journal_entry(p_entry_id UUID, p_reason TEXT)
**Returns:** UUID (reverse entry ID)

**Purpose:** Create reversing entry to correct posted transactions

**Process:**
1. **Validate:** Entry must be Posted (not Draft or already Voided)
2. **Check Period:** Cannot void entries in closed periods
3. **Create Reverse Entry:** New entry with reversed debits/credits
4. **Link Entries:** Set original_entry_id and reverse_entry_id
5. **Mark as Void:** Update original entry status to 'Void'

**Example:**
```sql
-- Original Entry (JE-2026-0001)
Line 1: Debit 1000 (Cash)
Line 2: Credit 1000 (Revenue)

-- After void_journal_entry('...', 'Incorrect amount')

-- Reverse Entry (JE-2026-0002)
Line 1: Debit 1000 (Revenue) -- Swapped
Line 2: Credit 1000 (Cash)   -- Swapped

-- Original Entry Status: Void
-- Linkage: original ↔ reverse
```

**Security:** SECURITY DEFINER with search_path pinning

**Error Handling:**
- User not authenticated
- Entry not found
- Entry not Posted
- Entry already voided
- Entry in closed period

---

### Pillar 4: Seed Data

#### Chart of Accounts (33 Accounts)

**Assets (15 accounts):**
```
1000  Assets
├── 1100  Current Assets
│   ├── 1110  Cash and Cash Equivalents
│   │   ├── 1111  Cash on Hand
│   │   └── 1112  Bank Accounts
│   ├── 1120  Accounts Receivable
│   │   └── 1121  Trade Receivables
│   └── 1130  Inventory
│       ├── 1131  Raw Materials
│       └── 1132  Finished Goods
└── 1200  Non-Current Assets
    └── 1210  Property, Plant & Equipment
        ├── 1211  Land
        ├── 1212  Buildings
        └── 1213  Equipment
```

**Liabilities (7 accounts):**
```
2000  Liabilities
├── 2100  Current Liabilities
│   ├── 2110  Accounts Payable
│   │   └── 2111  Trade Payables
│   └── 2130  VAT Payable
```

**Equity (4 accounts):**
```
3000  Equity
├── 3100  Capital
├── 3200  Retained Earnings
└── 3300  Current Year Profit/Loss
```

**Revenue (3 accounts):**
```
4000  Revenue
└── 4100  Sales Revenue
    └── 4110  Product Sales
```

**COGS (2 accounts):**
```
5000  Cost of Goods Sold
└── 5100  Direct Costs
```

**Expenses (2 accounts):**
```
6000  Operating Expenses
├── 6100  Salaries and Wages
├── 6200  Rent Expense
└── 6300  Utilities
```

#### Accounting Periods (2 periods)
- January 2026: 2026-01-01 to 2026-01-31 (Open)
- February 2026: 2026-02-01 to 2026-02-28 (Open)

---

### Pillar 5: Security (RLS Policies)

#### Accounting Periods
- ✅ All users can view periods
- ✅ Admins/Super Admins can manage periods

#### Accounts (Global)
- ✅ All users can view accounts
- ✅ Admins/Super Admins can manage accounts

#### Journal Entries (Branch Isolation)
- ✅ Users can view entries in their branch
- ✅ Super Admins can view all entries
- ✅ Users can create entries in their branch
- ✅ Users can update entries in their branch
- ✅ Users can delete DRAFT entries only

#### Journal Lines
- ✅ Users can view lines of accessible entries
- ✅ Users can manage lines of their entries

---

## 🔐 Security Features

### 1. SECURITY DEFINER Functions
All business logic functions use `SECURITY DEFINER` with pinned `search_path`:

```sql
SET search_path = public, pg_temp
```

**Protected Functions:**
- calculate_base_currency_amounts
- check_period_lock
- enforce_strict_balance
- protect_posted_entries
- protect_posted_entry_lines
- generate_entry_number
- void_journal_entry

### 2. Immutability Guarantees
**Once Posted:**
- ❌ Cannot modify entry fields
- ❌ Cannot modify entry lines
- ❌ Cannot delete entry
- ✅ Can only void via void_journal_entry function

**Benefits:**
- Audit trail preservation
- Regulatory compliance
- Financial integrity
- Error correction via reversals (not deletion)

### 3. Period Locking
**Purpose:** Financial close and reporting finality

**Process:**
1. Admin closes period: `UPDATE accounting_periods SET is_closed = true WHERE name = 'January 2026'`
2. System prevents any new postings to that period
3. Existing entries remain intact (immutable)
4. Corrections must be made in current open period

---

## 💼 Usage Examples

### Example 1: Simple Cash Sale (SAR)

```sql
-- Step 1: Create entry header
INSERT INTO journal_entries (
  date, description, branch_id, currency_code, exchange_rate, created_by
) VALUES (
  '2026-02-16',
  'Cash sale - Invoice #1001',
  '...branch_id...',
  'SAR',
  1.0,
  '...user_id...'
) RETURNING id;  -- Returns: abc123...

-- Step 2: Add lines
INSERT INTO journal_lines (journal_entry_id, account_id, debit, line_number) VALUES
('abc123...', (SELECT id FROM accounts WHERE code = '1111'), 1000.00, 1);  -- Cash

INSERT INTO journal_lines (journal_entry_id, account_id, credit, line_number) VALUES
('abc123...', (SELECT id FROM accounts WHERE code = '4110'), 1000.00, 2);  -- Sales

-- Step 3: Post entry
UPDATE journal_entries SET status = 'Posted' WHERE id = 'abc123...';
-- System validates: 2 lines ✓, balanced ✓, period open ✓
-- Result: Entry posted successfully
```

**Result:**
```
Entry: JE-2026-0001
Status: Posted
Date: 2026-02-16

Line 1: 1111 Cash on Hand          1000.00 DR
Line 2: 4110 Product Sales                    1000.00 CR
        Total                       1000.00    1000.00
```

---

### Example 2: Multi-Currency Purchase (USD)

```sql
-- Step 1: Create entry (USD with exchange rate)
INSERT INTO journal_entries (
  date, description, branch_id, currency_code, exchange_rate, created_by
) VALUES (
  '2026-02-16',
  'Equipment purchase from USA',
  '...branch_id...',
  'USD',
  3.75,  -- 1 USD = 3.75 SAR
  '...user_id...'
) RETURNING id;  -- Returns: def456...

-- Step 2: Add lines (in USD)
INSERT INTO journal_lines (journal_entry_id, account_id, debit, line_number) VALUES
('def456...', (SELECT id FROM accounts WHERE code = '1213'), 5000.00, 1);  -- Equipment (USD)

INSERT INTO journal_lines (journal_entry_id, account_id, credit, line_number) VALUES
('def456...', (SELECT id FROM accounts WHERE code = '1112'), 5000.00, 2);  -- Bank (USD)

-- Step 3: Post entry
UPDATE journal_entries SET status = 'Posted' WHERE id = 'def456...';
```

**Result:**
```
Entry: JE-2026-0002
Status: Posted
Currency: USD (Rate: 3.75)

Line 1: 1213 Equipment          5000.00 DR (18750.00 SAR)
Line 2: 1112 Bank Accounts                5000.00 CR (18750.00 SAR)
        Total (USD)             5000.00    5000.00
        Total (SAR)            18750.00   18750.00
```

**Base Currency Conversion:**
- Equipment: 5000 × 3.75 = 18,750 SAR
- Bank: 5000 × 3.75 = 18,750 SAR
- Balance: 18,750 = 18,750 ✅

---

### Example 3: Voiding an Entry

```sql
-- Void the cash sale from Example 1
SELECT void_journal_entry(
  'abc123...',  -- Entry ID
  'Customer returned goods - full refund'
);

-- Returns: xyz789... (Reverse entry ID)
```

**Result:**
```
Original Entry: JE-2026-0001
Status: Void (voided_at: 2026-02-16, voided_by: user)
reverse_entry_id: xyz789...

Reverse Entry: JE-2026-0003
Status: Posted
Description: REVERSAL: Cash sale - Invoice #1001 | Reason: Customer returned goods

Line 1: 4110 Product Sales      1000.00 DR  (Reversed)
Line 2: 1111 Cash on Hand                   1000.00 CR  (Reversed)
```

**Net Effect:**
- Original: +1000 Cash, +1000 Revenue
- Reversal: -1000 Cash, -1000 Revenue
- Net: 0 (Transaction fully reversed)

---

## 📈 Reporting & Analysis

### Trial Balance Query
```sql
SELECT
  a.code,
  a.name,
  SUM(jl.base_debit) AS total_debit,
  SUM(jl.base_credit) AS total_credit,
  SUM(jl.base_debit) - SUM(jl.base_credit) AS balance
FROM journal_lines jl
JOIN journal_entries je ON jl.journal_entry_id = je.id
JOIN accounts a ON jl.account_id = a.id
WHERE je.status = 'Posted'
  AND je.date BETWEEN '2026-01-01' AND '2026-02-29'
GROUP BY a.code, a.name, a.type
ORDER BY a.code;
```

### Period Analysis
```sql
SELECT
  ap.name AS period,
  COUNT(DISTINCT je.id) AS entry_count,
  SUM(jl.base_debit) AS total_debits,
  SUM(jl.base_credit) AS total_credits
FROM accounting_periods ap
LEFT JOIN journal_entries je ON je.date BETWEEN ap.start_date AND ap.end_date
  AND je.status = 'Posted'
LEFT JOIN journal_lines jl ON jl.journal_entry_id = je.id
GROUP BY ap.name, ap.start_date
ORDER BY ap.start_date;
```

---

## ✅ Verification Checklist

### System Components
- ✅ 4 Tables created (accounting_periods, accounts, journal_entries, journal_lines)
- ✅ 7 Functions deployed (all with SECURITY DEFINER + search_path pinning)
- ✅ 6 Triggers activated (multi-currency, period lock, balance, immutability)
- ✅ 33 Accounts seeded (complete chart of accounts)
- ✅ 2 Periods created (Jan-Feb 2026)
- ✅ RLS policies enabled (branch isolation)

### Business Rules
- ✅ Multi-currency support with auto-conversion
- ✅ Period locking enforcement
- ✅ Double-entry balance validation
- ✅ Posted entry immutability
- ✅ Void-only correction pattern
- ✅ Sequential entry numbering
- ✅ Full audit trail

### Security
- ✅ All SECURITY DEFINER functions have pinned search_path
- ✅ RLS enabled on all tables
- ✅ Branch isolation for entries
- ✅ Global accounts (no isolation)
- ✅ Admin-only period management

---

## 🎉 Summary

**Enterprise Financial Core successfully deployed with:**

✅ **Multi-Currency General Ledger** - Support for any currency with automatic SAR conversion
✅ **Period Locking** - Financial close control and reporting finality
✅ **Immutable Accounting** - Posted entries cannot be modified or deleted
✅ **Reversing Entry Pattern** - Corrections via void function (audit trail preserved)
✅ **Strict Double-Entry** - Balance enforcement at posting time
✅ **Branch Isolation** - Multi-branch support with proper data segregation
✅ **Global Chart of Accounts** - Unified account structure across organization
✅ **Security Hardening** - All functions protected against Schema Hijacking

**Status:** ✅ Production Ready
**Migration:** `recreate_enterprise_financial_core.sql`
**Deployment Date:** 2026-02-16
