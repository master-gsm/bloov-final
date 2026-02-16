/*
  # Enterprise Financial Core - Multi-Currency General Ledger (Complete Recreation)
  
  ## Overview
  Complete financial accounting system with multi-currency support, period locking,
  and immutable posted entries. This migration drops existing partial tables and
  recreates the complete enterprise financial core.
  
  ## The 5 Pillars
  
  ### 1. Schema - Core Tables
  - accounting_periods: Financial periods with open/closed status
  - accounts: Global chart of accounts (no branch isolation)
  - journal_entries: Journal entry headers with multi-currency support
  - journal_lines: Journal entry lines with automatic base currency conversion
  
  ### 2. Business Logic - Triggers
  - Multi-Currency Engine: Auto-calculate base currency amounts
  - Period Lock: Prevent posting to closed periods
  - Strict Balance: Enforce balanced entries (debit = credit)
  - Immutability: Protect posted/voided entries from modification
  
  ### 3. Void Logic - Function
  - void_journal_entry: Create reversing entries with full audit trail
  
  ### 4. Seed Data
  - Standard Chart of Accounts (COA)
  - First accounting period (Jan 2026)
  
  ### 5. Security
  - RLS policies for branch isolation on entries
  - SECURITY DEFINER functions with pinned search_path
*/


-- ============================================================================
-- CLEANUP: Drop existing partial tables
-- ============================================================================

DROP TABLE IF EXISTS journal_lines CASCADE;
DROP TABLE IF EXISTS journal_entries CASCADE;
DROP TABLE IF EXISTS accounts CASCADE;
DROP TABLE IF EXISTS accounting_periods CASCADE;


-- ============================================================================
-- PILLAR 1: SCHEMA - Core Tables
-- ============================================================================

-- 1.1 Accounting Periods
CREATE TABLE accounting_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_closed BOOLEAN DEFAULT false,
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT valid_period_dates CHECK (end_date >= start_date)
);

CREATE INDEX idx_accounting_periods_dates ON accounting_periods(start_date, end_date);
CREATE INDEX idx_accounting_periods_closed ON accounting_periods(is_closed);

COMMENT ON TABLE accounting_periods IS 'Financial accounting periods with open/closed status for period locking';


-- 1.2 Chart of Accounts (Global - No Branch Isolation)
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  name_ar VARCHAR(200),
  type VARCHAR(20) NOT NULL,
  parent_id UUID REFERENCES accounts(id),
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT valid_account_type CHECK (type IN (
    'Asset', 'Liability', 'Equity', 'Revenue', 'Expense',
    'COGS', 'OtherIncome', 'OtherExpense'
  ))
);

CREATE INDEX idx_accounts_code ON accounts(code);
CREATE INDEX idx_accounts_parent ON accounts(parent_id);
CREATE INDEX idx_accounts_type ON accounts(type);
CREATE INDEX idx_accounts_active ON accounts(is_active);

COMMENT ON TABLE accounts IS 'Global chart of accounts - shared across all branches';
COMMENT ON COLUMN accounts.is_system IS 'System accounts cannot be deleted or have type changed';


-- 1.3 Journal Entries (Headers)
CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_number VARCHAR(50) NOT NULL UNIQUE,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'Draft',
  branch_id UUID NOT NULL REFERENCES branches(id),
  
  -- Multi-Currency Support
  currency_code VARCHAR(3) DEFAULT 'SAR',
  exchange_rate NUMERIC(15, 6) DEFAULT 1.0,
  
  -- Period Locking
  period_locked BOOLEAN DEFAULT false,
  
  -- Reversal Tracking
  original_entry_id UUID REFERENCES journal_entries(id),
  reverse_entry_id UUID REFERENCES journal_entries(id),
  
  -- Audit Trail
  created_by UUID NOT NULL REFERENCES users(id),
  posted_by UUID REFERENCES users(id),
  voided_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  posted_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),
  version INTEGER DEFAULT 1,
  
  CONSTRAINT valid_status CHECK (status IN ('Draft', 'Posted', 'Void')),
  CONSTRAINT valid_currency_code CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT valid_exchange_rate CHECK (exchange_rate > 0),
  CONSTRAINT void_requires_reverse CHECK (
    status != 'Void' OR reverse_entry_id IS NOT NULL
  )
);

CREATE INDEX idx_journal_entries_date ON journal_entries(date);
CREATE INDEX idx_journal_entries_status ON journal_entries(status);
CREATE INDEX idx_journal_entries_branch ON journal_entries(branch_id);
CREATE INDEX idx_journal_entries_number ON journal_entries(entry_number);
CREATE INDEX idx_journal_entries_period_locked ON journal_entries(period_locked);

COMMENT ON TABLE journal_entries IS 'Journal entry headers with multi-currency support and period locking';
COMMENT ON COLUMN journal_entries.entry_number IS 'Immutable sequence number for audit trail';
COMMENT ON COLUMN journal_entries.exchange_rate IS 'Conversion rate to functional currency (SAR)';


-- 1.4 Journal Entry Lines
CREATE TABLE journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE RESTRICT,
  account_id UUID NOT NULL REFERENCES accounts(id),
  
  -- Transaction Currency Amounts
  debit NUMERIC(15, 2) DEFAULT 0,
  credit NUMERIC(15, 2) DEFAULT 0,
  
  -- Base Currency Amounts (SAR) - Auto-calculated
  base_debit NUMERIC(15, 2) DEFAULT 0,
  base_credit NUMERIC(15, 2) DEFAULT 0,
  
  description TEXT,
  line_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT valid_amounts CHECK (
    (debit >= 0 AND credit >= 0) AND
    (debit = 0 OR credit = 0) AND
    (debit > 0 OR credit > 0)
  ),
  CONSTRAINT valid_base_amounts CHECK (
    base_debit >= 0 AND base_credit >= 0
  ),
  CONSTRAINT unique_line_number UNIQUE (journal_entry_id, line_number)
);

CREATE INDEX idx_journal_lines_entry ON journal_lines(journal_entry_id);
CREATE INDEX idx_journal_lines_account ON journal_lines(account_id);

COMMENT ON TABLE journal_lines IS 'Journal entry lines with automatic base currency conversion';
COMMENT ON COLUMN journal_lines.base_debit IS 'Auto-calculated: debit * exchange_rate';
COMMENT ON COLUMN journal_lines.base_credit IS 'Auto-calculated: credit * exchange_rate';


-- ============================================================================
-- PILLAR 2: BUSINESS LOGIC - Triggers
-- ============================================================================

-- 2.1 Multi-Currency Engine
CREATE OR REPLACE FUNCTION calculate_base_currency_amounts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_exchange_rate NUMERIC(15, 6);
BEGIN
  SELECT exchange_rate INTO v_exchange_rate
  FROM journal_entries
  WHERE id = NEW.journal_entry_id;
  
  NEW.base_debit := NEW.debit * v_exchange_rate;
  NEW.base_credit := NEW.credit * v_exchange_rate;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_calculate_base_currency
  BEFORE INSERT OR UPDATE ON journal_lines
  FOR EACH ROW
  EXECUTE FUNCTION calculate_base_currency_amounts();

COMMENT ON FUNCTION calculate_base_currency_amounts IS 'SECURITY HARDENED: Auto-calculates base currency amounts';


-- 2.2 Period Lock
CREATE OR REPLACE FUNCTION check_period_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_closed BOOLEAN;
  v_period_name VARCHAR(100);
BEGIN
  IF NEW.status = 'Posted' OR (OLD.status IS NOT NULL AND OLD.status = 'Posted') THEN
    SELECT is_closed, name INTO v_is_closed, v_period_name
    FROM accounting_periods
    WHERE NEW.date BETWEEN start_date AND end_date
    AND is_closed = true
    LIMIT 1;
    
    IF v_is_closed THEN
      RAISE EXCEPTION 'Cannot post to closed period: %', v_period_name;
    END IF;
    
    SELECT is_closed INTO v_is_closed
    FROM accounting_periods
    WHERE NEW.date BETWEEN start_date AND end_date
    LIMIT 1;
    
    IF FOUND THEN
      NEW.period_locked := v_is_closed;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_period_lock
  BEFORE INSERT OR UPDATE ON journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION check_period_lock();

COMMENT ON FUNCTION check_period_lock IS 'SECURITY HARDENED: Prevents posting to closed periods';


-- 2.3 Strict Balance
CREATE OR REPLACE FUNCTION enforce_strict_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_line_count INTEGER;
  v_total_base_debit NUMERIC(15, 2);
  v_total_base_credit NUMERIC(15, 2);
  v_difference NUMERIC(15, 2);
BEGIN
  IF NEW.status = 'Posted' AND (OLD.status IS NULL OR OLD.status != 'Posted') THEN
    SELECT COUNT(*) INTO v_line_count
    FROM journal_lines
    WHERE journal_entry_id = NEW.id;
    
    IF v_line_count < 2 THEN
      RAISE EXCEPTION 'Journal entry must have at least 2 lines (has %)', v_line_count;
    END IF;
    
    SELECT 
      COALESCE(SUM(base_debit), 0),
      COALESCE(SUM(base_credit), 0)
    INTO v_total_base_debit, v_total_base_credit
    FROM journal_lines
    WHERE journal_entry_id = NEW.id;
    
    v_difference := ABS(v_total_base_debit - v_total_base_credit);
    
    IF v_difference > 0.01 THEN
      RAISE EXCEPTION 'Entry is not balanced: Debit=% Credit=% Difference=%',
        v_total_base_debit, v_total_base_credit, v_difference;
    END IF;
    
    NEW.posted_at := now();
    NEW.posted_by := auth.uid();
  END IF;
  
  IF NEW.status = 'Void' AND NEW.reverse_entry_id IS NULL THEN
    RAISE EXCEPTION 'Cannot void entry without creating reverse entry';
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_strict_balance
  BEFORE UPDATE OF status ON journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION enforce_strict_balance();

COMMENT ON FUNCTION enforce_strict_balance IS 'SECURITY HARDENED: Enforces double-entry balance';


-- 2.4 Immutability - Headers
CREATE OR REPLACE FUNCTION protect_posted_entries()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('Posted', 'Void') THEN
      RAISE EXCEPTION 'Cannot delete % journal entry', OLD.status;
    END IF;
    RETURN OLD;
  END IF;
  
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'Posted' THEN
      IF NEW.status != OLD.status AND NEW.status != 'Void' THEN
        RAISE EXCEPTION 'Cannot modify posted entry (only voiding allowed)';
      END IF;
      
      IF NEW.entry_number != OLD.entry_number OR
         NEW.date != OLD.date OR
         NEW.description != OLD.description OR
         NEW.branch_id != OLD.branch_id OR
         NEW.currency_code != OLD.currency_code OR
         NEW.exchange_rate != OLD.exchange_rate THEN
        RAISE EXCEPTION 'Cannot modify posted journal entry fields';
      END IF;
    END IF;
    
    IF OLD.status = 'Void' THEN
      RAISE EXCEPTION 'Cannot modify voided journal entry';
    END IF;
    
    IF NEW.entry_number != OLD.entry_number THEN
      RAISE EXCEPTION 'Cannot modify entry_number (immutable)';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_posted_entries
  BEFORE UPDATE OR DELETE ON journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION protect_posted_entries();

COMMENT ON FUNCTION protect_posted_entries IS 'SECURITY HARDENED: Prevents modification of posted/voided entries';


-- 2.5 Immutability - Lines
CREATE OR REPLACE FUNCTION protect_posted_entry_lines()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status VARCHAR(20);
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO v_status FROM journal_entries WHERE id = OLD.journal_entry_id;
  ELSE
    SELECT status INTO v_status FROM journal_entries WHERE id = NEW.journal_entry_id;
  END IF;
  
  IF v_status IN ('Posted', 'Void') THEN
    RAISE EXCEPTION 'Cannot modify lines of % journal entry', v_status;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_posted_lines
  BEFORE INSERT OR UPDATE OR DELETE ON journal_lines
  FOR EACH ROW
  EXECUTE FUNCTION protect_posted_entry_lines();

COMMENT ON FUNCTION protect_posted_entry_lines IS 'SECURITY HARDENED: Protects posted entry lines';


-- 2.6 Generate Entry Number
CREATE OR REPLACE FUNCTION generate_entry_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_next_number INTEGER;
  v_year VARCHAR(4);
BEGIN
  IF NEW.entry_number IS NULL OR NEW.entry_number = '' THEN
    v_year := EXTRACT(YEAR FROM NEW.date)::VARCHAR;
    
    SELECT COALESCE(MAX(
      CASE 
        WHEN entry_number ~ '^JE-[0-9]{4}-[0-9]+$' 
        THEN SUBSTRING(entry_number FROM 'JE-[0-9]{4}-([0-9]+)')::INTEGER
        ELSE 0
      END
    ), 0) + 1
    INTO v_next_number
    FROM journal_entries
    WHERE entry_number LIKE 'JE-' || v_year || '-%';
    
    NEW.entry_number := 'JE-' || v_year || '-' || LPAD(v_next_number::TEXT, 4, '0');
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generate_entry_number
  BEFORE INSERT ON journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION generate_entry_number();

COMMENT ON FUNCTION generate_entry_number IS 'SECURITY HARDENED: Auto-generates entry numbers';


-- ============================================================================
-- PILLAR 3: VOID LOGIC
-- ============================================================================

CREATE OR REPLACE FUNCTION void_journal_entry(p_entry_id UUID, p_reason TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_original_entry journal_entries%ROWTYPE;
  v_reverse_entry_id UUID;
  v_original_line journal_lines%ROWTYPE;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;
  
  SELECT * INTO v_original_entry FROM journal_entries WHERE id = p_entry_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journal entry not found: %', p_entry_id;
  END IF;
  
  IF v_original_entry.status != 'Posted' THEN
    RAISE EXCEPTION 'Can only void Posted entries (current: %)', v_original_entry.status;
  END IF;
  
  IF v_original_entry.reverse_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'Entry has already been voided';
  END IF;
  
  IF v_original_entry.period_locked THEN
    RAISE EXCEPTION 'Cannot void entry in closed period';
  END IF;
  
  INSERT INTO journal_entries (
    entry_number, date, description, status, branch_id,
    currency_code, exchange_rate, original_entry_id, created_by
  ) VALUES (
    NULL,
    v_original_entry.date,
    'REVERSAL: ' || v_original_entry.description || ' | Reason: ' || p_reason,
    'Draft',
    v_original_entry.branch_id,
    v_original_entry.currency_code,
    v_original_entry.exchange_rate,
    p_entry_id,
    v_user_id
  ) RETURNING id INTO v_reverse_entry_id;
  
  FOR v_original_line IN
    SELECT * FROM journal_lines WHERE journal_entry_id = p_entry_id ORDER BY line_number
  LOOP
    INSERT INTO journal_lines (
      journal_entry_id, account_id, debit, credit, description, line_number
    ) VALUES (
      v_reverse_entry_id,
      v_original_line.account_id,
      v_original_line.credit,
      v_original_line.debit,
      'Reversal: ' || COALESCE(v_original_line.description, ''),
      v_original_line.line_number
    );
  END LOOP;
  
  UPDATE journal_entries SET status = 'Posted' WHERE id = v_reverse_entry_id;
  
  UPDATE journal_entries
  SET reverse_entry_id = v_reverse_entry_id, status = 'Void',
      voided_by = v_user_id, voided_at = now()
  WHERE id = p_entry_id;
  
  RETURN v_reverse_entry_id;
END;
$$;

COMMENT ON FUNCTION void_journal_entry IS 'SECURITY HARDENED: Creates reversing entry';


-- ============================================================================
-- PILLAR 4: SEED DATA
-- ============================================================================

-- Chart of Accounts
INSERT INTO accounts (code, name, name_ar, type, is_system) VALUES
('1000', 'Assets', 'الأصول', 'Asset', true),
('1100', 'Current Assets', 'الأصول المتداولة', 'Asset', true),
('1110', 'Cash and Cash Equivalents', 'النقدية وما يعادلها', 'Asset', true),
('1111', 'Cash on Hand', 'النقدية في الصندوق', 'Asset', false),
('1112', 'Bank Accounts', 'حسابات بنكية', 'Asset', false),
('1120', 'Accounts Receivable', 'المدينون', 'Asset', true),
('1121', 'Trade Receivables', 'ذمم العملاء', 'Asset', false),
('1130', 'Inventory', 'المخزون', 'Asset', true),
('1131', 'Raw Materials', 'مواد خام', 'Asset', false),
('1132', 'Finished Goods', 'بضاعة جاهزة', 'Asset', false),

('1200', 'Non-Current Assets', 'الأصول غير المتداولة', 'Asset', true),
('1210', 'Property, Plant & Equipment', 'الممتلكات والمعدات', 'Asset', true),
('1211', 'Land', 'أراضي', 'Asset', false),
('1212', 'Buildings', 'مباني', 'Asset', false),
('1213', 'Equipment', 'معدات', 'Asset', false),

('2000', 'Liabilities', 'الخصوم', 'Liability', true),
('2100', 'Current Liabilities', 'الخصوم المتداولة', 'Liability', true),
('2110', 'Accounts Payable', 'الدائنون', 'Liability', true),
('2111', 'Trade Payables', 'ذمم الموردين', 'Liability', false),
('2130', 'VAT Payable', 'ضريبة القيمة المضافة', 'Liability', false),

('3000', 'Equity', 'حقوق الملكية', 'Equity', true),
('3100', 'Capital', 'رأس المال', 'Equity', false),
('3200', 'Retained Earnings', 'الأرباح المحتجزة', 'Equity', false),
('3300', 'Current Year Profit/Loss', 'ربح/خسارة السنة', 'Equity', true),

('4000', 'Revenue', 'الإيرادات', 'Revenue', true),
('4100', 'Sales Revenue', 'إيرادات المبيعات', 'Revenue', true),
('4110', 'Product Sales', 'مبيعات منتجات', 'Revenue', false),

('5000', 'Cost of Goods Sold', 'تكلفة البضاعة المباعة', 'COGS', true),
('5100', 'Direct Costs', 'التكاليف المباشرة', 'COGS', false),

('6000', 'Operating Expenses', 'المصروفات التشغيلية', 'Expense', true),
('6100', 'Salaries and Wages', 'الرواتب والأجور', 'Expense', false),
('6200', 'Rent Expense', 'إيجارات', 'Expense', false),
('6300', 'Utilities', 'المرافق', 'Expense', false);

-- Set parent relationships
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code = '1000') WHERE code IN ('1100', '1200');
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code = '1100') WHERE code IN ('1110', '1120', '1130');
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code = '1110') WHERE code IN ('1111', '1112');
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code = '1120') WHERE code = '1121';
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code = '1130') WHERE code IN ('1131', '1132');
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code = '1200') WHERE code = '1210';
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code = '1210') WHERE code IN ('1211', '1212', '1213');
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code = '2000') WHERE code = '2100';
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code = '2100') WHERE code IN ('2110', '2130');
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code = '2110') WHERE code = '2111';
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code = '3000') WHERE code IN ('3100', '3200', '3300');
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code = '4000') WHERE code = '4100';
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code = '4100') WHERE code = '4110';
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code = '5000') WHERE code = '5100';
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code = '6000') WHERE code IN ('6100', '6200', '6300');

-- First Accounting Period
INSERT INTO accounting_periods (name, start_date, end_date, is_closed) VALUES 
('January 2026', '2026-01-01', '2026-01-31', false),
('February 2026', '2026-02-01', '2026-02-28', false);


-- ============================================================================
-- PILLAR 5: SECURITY - RLS
-- ============================================================================

ALTER TABLE accounting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All users can view periods" ON accounting_periods FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage periods" ON accounting_periods FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

CREATE POLICY "All users view accounts" ON accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage accounts" ON accounts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

CREATE POLICY "Users view entries in branch" ON journal_entries FOR SELECT TO authenticated
  USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()) OR 
         EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "Users create entries in branch" ON journal_entries FOR INSERT TO authenticated
  WITH CHECK (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users update entries in branch" ON journal_entries FOR UPDATE TO authenticated
  USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users delete draft entries" ON journal_entries FOR DELETE TO authenticated
  USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()) AND status = 'Draft');

CREATE POLICY "Users view lines" ON journal_lines FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM journal_entries WHERE id = journal_entry_id AND 
    (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()) OR
     EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'))));

CREATE POLICY "Users manage lines" ON journal_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM journal_entries WHERE id = journal_entry_id AND 
    branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid())));
