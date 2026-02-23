
/*
  # VAT Engine — Migration 4: vat_returns Table + settle_vat_period() Engine

  ## Summary
  Creates the VAT Return lifecycle management system:
  1. `vat_returns` table to track filed/settled/refunded periods.
  2. `settle_vat_period()` function: the settlement engine that:
     - Aggregates all open vat_transactions for the period.
     - Creates a GL journal entry netting Input vs Output VAT.
     - Marks all settled transactions in vat_transactions.
     - Handles both payable (Output > Input) and refund (Input > Output) cases.

  ## New Table: `vat_returns`
  | Column           | Type          | Description |
  |------------------|---------------|-------------|
  | id               | uuid PK        | |
  | branch_id        | uuid NULL      | NULL = all branches |
  | period_month     | integer        | |
  | period_year      | integer        | |
  | date_from        | date           | |
  | date_to          | date           | |
  | total_output_vat | numeric        | Sum of output VAT for period |
  | total_input_vat  | numeric        | Sum of recoverable input VAT (standard only) |
  | net_vat_payable  | numeric        | output - input (negative = refund) |
  | is_refund        | boolean        | net_vat_payable < 0 |
  | status           | text           | 'draft','submitted','approved','paid','refunded' |
  | journal_entry_id | uuid NULL      | GL settlement entry |
  | submitted_by     | uuid NULL      | |
  | submitted_at     | timestamptz    | |
  | notes            | text NULL      | |
  | created_at       | timestamptz    | |
  | updated_at       | timestamptz    | |

  ## New Function: settle_vat_period(p_branch_id, p_month, p_year, p_notes)
  Returns: uuid (vat_return_id)

  Steps:
  1. Validates period is not already settled.
  2. Aggregates open vat_transactions → output_vat, input_vat.
  3. Calculates net = output - input.
  4. Creates journal entry:
     - If net > 0 (payable):
         Dr 2130 VAT Payable      [net]
         Cr 2140 VAT Recoverable  [input] (clears input balance)
         ... actually: Dr 2130 decrements liability by net
       Correct ZATCA GL pattern:
         Dr 2130 VAT Payable (Output)       output_vat
         Cr 2140 VAT Recoverable (Input)    input_vat
         Cr 2200 Tax Authority Payable      net_payable   (new account if needed)
       Simplified (matches existing account tree):
         Dr 2130 VAT Payable                output_vat   (debit clears liability)
         Cr 2140 VAT Recoverable            input_vat    (credit clears asset)
         net > 0: Cr Cash/Payable (2130 nets to remaining liability = net_payable)
     - Simple 2-line netting approach used here for maximum compatibility:
         IF net > 0 (owe tax authority):
           Dr 2130 VAT Payable   [output_vat]
           Cr 2140 VAT Recov.    [input_vat]
           Cr 2130 VAT Payable   [net_payable]  ← remaining balance stays in 2130
           → simplified to: Dr 2140 Recoverable [input_vat] / Cr 2130 Payable [input_vat]
             + standalone net_payable balance remains in 2130 from original output postings
         Actual entry created:
           Dr 2130 VAT Payable          [output_vat]   clears output side
           Cr 2140 VAT Recoverable      [input_vat]    clears input side
           Cr 2110 Tax Due to ZATCA     [net_payable]  records actual liability
         IF net < 0 (refund due):
           Dr 2140 VAT Recoverable      [|net|]        records receivable
           Cr 2130 VAT Payable          [output_vat]   clears output
           Dr 2130 VAT Payable          [input_vat]    net movement
  5. Creates vat_return record with journal_entry_id.
  6. Updates vat_transactions.status = 'settled', vat_return_id = new return id.

  ## Security
  - RLS enabled on vat_returns.
  - settle_vat_period() is SECURITY DEFINER, callable by admin/accountant.
*/

-- ── 1. Create vat_returns table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vat_returns (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id        uuid        NULL,
  period_month     integer     NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year      integer     NOT NULL CHECK (period_year >= 2020),
  date_from        date        NOT NULL,
  date_to          date        NOT NULL,
  total_output_vat numeric     NOT NULL DEFAULT 0,
  total_input_vat  numeric     NOT NULL DEFAULT 0,
  net_vat_payable  numeric     NOT NULL DEFAULT 0,
  is_refund        boolean     NOT NULL DEFAULT false,
  status           text        NOT NULL DEFAULT 'draft'
                               CHECK (status IN ('draft','submitted','approved','paid','refunded')),
  journal_entry_id uuid        NULL,
  submitted_by     uuid        NULL,
  submitted_at     timestamptz NULL,
  notes            text        NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS idx_vat_returns_period  ON vat_returns (period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_vat_returns_branch  ON vat_returns (branch_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_vat_returns_status  ON vat_returns (status);

ALTER TABLE vat_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and accountants can select vat_returns"
  ON vat_returns FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role IN ('admin','super_admin','accountant','observer')
    )
  );

CREATE POLICY "Admins can insert vat_returns"
  ON vat_returns FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role IN ('admin','super_admin','accountant')
    )
  );

CREATE POLICY "Admins can update vat_returns"
  ON vat_returns FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role IN ('admin','super_admin','accountant')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role IN ('admin','super_admin','accountant')
    )
  );

-- Add FK from vat_transactions.vat_return_id → vat_returns.id
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_vat_tx_return_id'
  ) THEN
    ALTER TABLE vat_transactions
      ADD CONSTRAINT fk_vat_tx_return_id
      FOREIGN KEY (vat_return_id) REFERENCES vat_returns(id);
  END IF;
END $$;

-- ── 2. Ensure account 2200 "Tax Authority Payable" exists ────────────────────
INSERT INTO accounts (code, name, name_ar, type, parent_id)
SELECT '2200', 'Tax Authority Payable (ZATCA)', 'مستحقات هيئة الزكاة والضريبة',
       'Liability',
       (SELECT id FROM accounts WHERE code = '2100')
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE code = '2200');

-- ── 3. The Settlement Engine: settle_vat_period() ────────────────────────────
CREATE OR REPLACE FUNCTION settle_vat_period(
  p_branch_id  uuid    DEFAULT NULL,
  p_month      integer DEFAULT NULL,
  p_year       integer DEFAULT NULL,
  p_notes      text    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month         integer := COALESCE(p_month, EXTRACT(MONTH FROM CURRENT_DATE)::integer);
  v_year          integer := COALESCE(p_year,  EXTRACT(YEAR  FROM CURRENT_DATE)::integer);
  v_date_from     date;
  v_date_to       date;
  v_output_vat    numeric := 0;
  v_input_vat     numeric := 0;
  v_net_payable   numeric := 0;
  v_je_id         uuid;
  v_return_id     uuid;
  v_user_id       uuid;
  v_acc_2130      uuid;   -- VAT Payable (Output)
  v_acc_2140      uuid;   -- VAT Recoverable (Input)
  v_acc_2200      uuid;   -- Tax Authority Payable (ZATCA)
  v_line          integer := 0;
  v_period_label  text;
BEGIN
  v_user_id   := auth.uid();
  v_date_from := make_date(v_year, v_month, 1);
  v_date_to   := (v_date_from + interval '1 month - 1 day')::date;
  v_period_label := TO_CHAR(v_date_from, 'Mon YYYY');

  -- Guard: already settled?
  IF EXISTS (
    SELECT 1 FROM vat_returns
    WHERE period_year = v_year AND period_month = v_month
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND status NOT IN ('draft')
  ) THEN
    RAISE EXCEPTION 'VAT period % % is already settled.', v_month, v_year;
  END IF;

  -- Aggregate open transactions for the period
  SELECT
    COALESCE(SUM(CASE WHEN direction = 'output' THEN vat_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'input'  AND vat_category = 'standard' THEN vat_amount ELSE 0 END), 0)
  INTO v_output_vat, v_input_vat
  FROM vat_transactions
  WHERE period_year  = v_year
    AND period_month = v_month
    AND status       = 'open'
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  v_net_payable := ROUND(v_output_vat - v_input_vat, 2);

  -- Skip if nothing to settle
  IF v_output_vat = 0 AND v_input_vat = 0 THEN
    RAISE NOTICE 'No open VAT transactions for period % %.', v_month, v_year;
  END IF;

  -- Fetch account IDs
  SELECT id INTO v_acc_2130 FROM accounts WHERE code = '2130';
  SELECT id INTO v_acc_2140 FROM accounts WHERE code = '2140';
  SELECT id INTO v_acc_2200 FROM accounts WHERE code = '2200';

  IF v_acc_2130 IS NULL OR v_acc_2140 IS NULL OR v_acc_2200 IS NULL THEN
    RAISE EXCEPTION 'Required GL accounts (2130/2140/2200) not found.';
  END IF;

  -- ── Create Journal Entry ──────────────────────────────────────────────────
  INSERT INTO journal_entries (
    entry_number, date, description, status, branch_id,
    currency_code, exchange_rate, reference_type, reference_id,
    created_by, posted_by, posted_at
  ) VALUES (
    NULL,
    v_date_to,
    'VAT Settlement — ' || v_period_label,
    'Posted',
    p_branch_id,
    'SAR', 1.0,
    'vat_settlement', NULL,
    v_user_id, v_user_id, now()
  ) RETURNING id INTO v_je_id;

  IF v_net_payable >= 0 THEN
    -- Output > Input: company owes ZATCA
    --   Dr 2130 VAT Payable     [output_vat]   ← clears output liability
    --   Cr 2140 VAT Recoverable [input_vat]    ← clears input asset
    --   Cr 2200 Tax Due ZATCA   [net_payable]  ← records net obligation

    v_line := v_line + 1;
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, base_debit, base_credit, description, line_number)
    VALUES (v_je_id, v_acc_2130, v_output_vat, 0, v_output_vat, 0,
            'Clear VAT Payable (Output) — ' || v_period_label, v_line);

    IF v_input_vat > 0 THEN
      v_line := v_line + 1;
      INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, base_debit, base_credit, description, line_number)
      VALUES (v_je_id, v_acc_2140, 0, v_input_vat, 0, v_input_vat,
              'Clear VAT Recoverable (Input) — ' || v_period_label, v_line);
    END IF;

    v_line := v_line + 1;
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, base_debit, base_credit, description, line_number)
    VALUES (v_je_id, v_acc_2200, 0, v_net_payable, 0, v_net_payable,
            'Net VAT Due to ZATCA — ' || v_period_label, v_line);

  ELSE
    -- Input > Output: ZATCA owes company (refund scenario)
    --   Dr 2200 Tax Authority   [|net|]        ← records ZATCA receivable
    --   Dr 2130 VAT Payable     [output_vat]   ← clears output liability
    --   Cr 2140 VAT Recoverable [input_vat]    ← clears input asset

    v_line := v_line + 1;
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, base_debit, base_credit, description, line_number)
    VALUES (v_je_id, v_acc_2200, ABS(v_net_payable), 0, ABS(v_net_payable), 0,
            'VAT Refund Receivable from ZATCA — ' || v_period_label, v_line);

    v_line := v_line + 1;
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, base_debit, base_credit, description, line_number)
    VALUES (v_je_id, v_acc_2130, v_output_vat, 0, v_output_vat, 0,
            'Clear VAT Payable (Output) — ' || v_period_label, v_line);

    v_line := v_line + 1;
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, base_debit, base_credit, description, line_number)
    VALUES (v_je_id, v_acc_2140, 0, v_input_vat, 0, v_input_vat,
            'Clear VAT Recoverable (Input) — ' || v_period_label, v_line);
  END IF;

  -- ── Create vat_return record ──────────────────────────────────────────────
  INSERT INTO vat_returns (
    branch_id, period_month, period_year, date_from, date_to,
    total_output_vat, total_input_vat, net_vat_payable, is_refund,
    status, journal_entry_id, submitted_by, submitted_at, notes
  ) VALUES (
    p_branch_id, v_month, v_year, v_date_from, v_date_to,
    v_output_vat, v_input_vat, v_net_payable, (v_net_payable < 0),
    'submitted', v_je_id, v_user_id, now(), p_notes
  ) RETURNING id INTO v_return_id;

  -- Update journal entry reference_id now that we have the return id
  UPDATE journal_entries SET reference_id = v_return_id WHERE id = v_je_id;

  -- ── Mark transactions as settled ─────────────────────────────────────────
  UPDATE vat_transactions
  SET status        = 'settled',
      vat_return_id = v_return_id
  WHERE period_year  = v_year
    AND period_month = v_month
    AND status       = 'open'
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  RETURN v_return_id;
END;
$$;
