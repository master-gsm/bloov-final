
/*
  # Bank Reconciliation Engine — Migration 1: Core Tables

  ## Summary
  Creates the full Bank Reconciliation infrastructure from scratch.
  No existing tables or logic are modified.

  ## New Tables

  ### `bank_accounts`
  Master list of bank accounts linked to branches.
  Each account maps to a GL account in chart_of_accounts.
  | Column           | Description |
  |------------------|-------------|
  | id               | PK |
  | account_name     | Friendly name (e.g., "Al Rajhi Checking") |
  | account_number   | Bank account number |
  | iban             | IBAN |
  | currency_code    | ISO currency (default SAR) |
  | gl_account_id    | FK → chart_of_accounts (optional) |
  | branch_id        | FK → branches |
  | is_active        | Soft-disable flag |
  | is_deleted       | Soft-delete |
  | created_at/by    | Audit |

  ### `bank_statement_imports`
  Header record for each CSV/manual import session.

  ### `bank_statement_lines`
  Individual transactions from an imported bank statement.
  `is_matched` = true once a reconciliation_match exists for this line.

  ### `bank_reconciliations`
  A reconciliation session for a bank account covering a date range.
  status: draft → in_review → finalized
  Once finalized, no further matches can be added or removed.

  ### `reconciliation_matches`
  The core link table: one bank_statement_line ↔ one journal_entry.
  match_type: 'auto' | 'manual'
  is_deleted / voided columns for soft-delete audit trail.

  ## Constraints
  - UNIQUE (bank_statement_line_id) on reconciliation_matches (one line → one match)
  - UNIQUE (journal_entry_id, matched_amount) on reconciliation_matches
    to prevent the same GL entry being matched twice at the same amount.

  ## Security
  - RLS enabled on all 5 tables.
  - Branch-scoped SELECT for authenticated users.
  - INSERT/UPDATE restricted to admin, super_admin, accountant roles.
  - No direct DELETE on reconciliation_matches (soft-delete only).
*/

-- ── 1. bank_accounts ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_accounts (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name   text        NOT NULL,
  account_number text        NULL,
  iban           text        NULL,
  currency_code  text        NOT NULL DEFAULT 'SAR',
  gl_account_id  uuid        NULL REFERENCES chart_of_accounts(id),
  branch_id      uuid        NOT NULL REFERENCES branches(id),
  is_active      boolean     NOT NULL DEFAULT true,
  is_deleted     boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid        NULL,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_branch ON bank_accounts (branch_id) WHERE is_deleted = false;

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch members can view bank_accounts"
  ON bank_accounts FOR SELECT TO authenticated
  USING (
    branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('super_admin'))
  );

CREATE POLICY "Admins can insert bank_accounts"
  ON bank_accounts FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','super_admin','accountant'))
  );

CREATE POLICY "Admins can update bank_accounts"
  ON bank_accounts FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','super_admin','accountant'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','super_admin','accountant'))
  );

-- ── 2. bank_statement_imports ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_statement_imports (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid        NOT NULL REFERENCES bank_accounts(id),
  period_start    date        NOT NULL,
  period_end      date        NOT NULL,
  opening_balance numeric     NOT NULL DEFAULT 0,
  closing_balance numeric     NOT NULL DEFAULT 0,
  line_count      integer     NOT NULL DEFAULT 0,
  source          text        NOT NULL DEFAULT 'manual',
  notes           text        NULL,
  is_deleted      boolean     NOT NULL DEFAULT false,
  imported_at     timestamptz NOT NULL DEFAULT now(),
  imported_by     uuid        NULL,
  CONSTRAINT bank_statement_imports_period_check
    CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_bsi_bank_account ON bank_statement_imports (bank_account_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_bsi_period       ON bank_statement_imports (period_start, period_end);

ALTER TABLE bank_statement_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch members can view statement imports"
  ON bank_statement_imports FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM bank_accounts ba
      WHERE ba.id = bank_statement_imports.bank_account_id
        AND (
          ba.branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
          OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
        )
    )
  );

CREATE POLICY "Admins can insert statement imports"
  ON bank_statement_imports FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','super_admin','accountant'))
  );

CREATE POLICY "Admins can update statement imports"
  ON bank_statement_imports FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','super_admin','accountant')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','super_admin','accountant')));

-- ── 3. bank_statement_lines ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_statement_lines (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id        uuid        NOT NULL REFERENCES bank_statement_imports(id),
  transaction_date date        NOT NULL,
  description      text        NOT NULL DEFAULT '',
  reference_number text        NULL,
  debit            numeric     NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit           numeric     NOT NULL DEFAULT 0 CHECK (credit >= 0),
  balance          numeric     NULL,
  is_matched       boolean     NOT NULL DEFAULT false,
  branch_id        uuid        NOT NULL,
  is_deleted       boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bsl_import      ON bank_statement_lines (import_id)        WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_bsl_date        ON bank_statement_lines (transaction_date)  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_bsl_branch      ON bank_statement_lines (branch_id)         WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_bsl_matched     ON bank_statement_lines (is_matched)        WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_bsl_ref         ON bank_statement_lines (reference_number)  WHERE reference_number IS NOT NULL;

ALTER TABLE bank_statement_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch members can view statement lines"
  ON bank_statement_lines FOR SELECT TO authenticated
  USING (
    branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "Admins can insert statement lines"
  ON bank_statement_lines FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','super_admin','accountant'))
  );

CREATE POLICY "Admins can update statement lines (is_matched flag)"
  ON bank_statement_lines FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','super_admin','accountant')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','super_admin','accountant')));

-- ── 4. bank_reconciliations ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_reconciliations (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id     uuid        NOT NULL REFERENCES bank_accounts(id),
  reconciliation_date date        NOT NULL,
  period_start        date        NULL,
  period_end          date        NULL,
  status              text        NOT NULL DEFAULT 'draft'
                                  CHECK (status IN ('draft','in_review','finalized')),
  book_balance        numeric     NULL,
  bank_balance        numeric     NULL,
  difference          numeric     GENERATED ALWAYS AS (
                                    COALESCE(bank_balance, 0) - COALESCE(book_balance, 0)
                                  ) STORED,
  notes               text        NULL,
  is_deleted          boolean     NOT NULL DEFAULT false,
  finalized_at        timestamptz NULL,
  finalized_by        uuid        NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid        NULL,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brecon_account ON bank_reconciliations (bank_account_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_brecon_status  ON bank_reconciliations (status)          WHERE is_deleted = false;

ALTER TABLE bank_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch members can view bank_reconciliations"
  ON bank_reconciliations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM bank_accounts ba
      WHERE ba.id = bank_reconciliations.bank_account_id
        AND (
          ba.branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
          OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
        )
    )
  );

CREATE POLICY "Admins can insert bank_reconciliations"
  ON bank_reconciliations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','super_admin','accountant')));

CREATE POLICY "Admins can update bank_reconciliations"
  ON bank_reconciliations FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','super_admin','accountant')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','super_admin','accountant')));

-- ── 5. reconciliation_matches ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reconciliation_matches (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id    uuid        NULL REFERENCES bank_reconciliations(id),
  bank_statement_line_id uuid      NOT NULL REFERENCES bank_statement_lines(id),
  journal_entry_id     uuid        NOT NULL REFERENCES journal_entries(id),
  matched_amount       numeric     NOT NULL CHECK (matched_amount > 0),
  match_type           text        NOT NULL DEFAULT 'manual'
                                   CHECK (match_type IN ('auto','manual')),
  match_confidence     numeric     NULL,
  notes                text        NULL,
  is_deleted           boolean     NOT NULL DEFAULT false,
  voided_at            timestamptz NULL,
  voided_by            uuid        NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid        NULL,

  -- Core uniqueness: one bank line can only be matched once (active)
  CONSTRAINT uq_bank_line_active_match
    EXCLUDE USING btree (bank_statement_line_id WITH =)
    WHERE (is_deleted = false),

  -- Prevent same journal entry matched twice at same amount
  CONSTRAINT uq_journal_entry_match
    EXCLUDE USING btree (journal_entry_id WITH =, matched_amount WITH =)
    WHERE (is_deleted = false)
);

CREATE INDEX IF NOT EXISTS idx_rm_bank_line   ON reconciliation_matches (bank_statement_line_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_rm_journal     ON reconciliation_matches (journal_entry_id)       WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_rm_recon       ON reconciliation_matches (reconciliation_id)      WHERE is_deleted = false;

ALTER TABLE reconciliation_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch members can view reconciliation_matches"
  ON reconciliation_matches FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM bank_statement_lines bsl
      WHERE bsl.id = reconciliation_matches.bank_statement_line_id
        AND (
          bsl.branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
          OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
        )
    )
  );

CREATE POLICY "Admins can insert reconciliation_matches"
  ON reconciliation_matches FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','super_admin','accountant')));

CREATE POLICY "Admins can update reconciliation_matches (soft delete)"
  ON reconciliation_matches FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','super_admin','accountant')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','super_admin','accountant')));
