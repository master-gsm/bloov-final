/*
  # Security Fixes: Indexes, RLS Policy Optimization, Security Invoker View

  ## Summary
  Addresses multiple security and performance issues detected in the database:

  ## 1. Missing Foreign Key Indexes
  Adds 5 indexes for unindexed foreign keys on partner_withdrawals and profit_distributions.

  ## 2. RLS Auth Initialization Plan Fix
  Replaces auth.uid() with (select auth.uid()) in RLS policies across 13 tables.
  This prevents per-row re-evaluation of the auth function (significant performance gain).

  ## 3. Security Definer View Fix
  Recreates v_partner_balances with security_invoker = true so it respects the caller's RLS context.
*/

-- ============================================================
-- 1. MISSING FOREIGN KEY INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_partner_withdrawals_created_by
  ON partner_withdrawals(created_by);

CREATE INDEX IF NOT EXISTS idx_partner_withdrawals_journal_entry_id
  ON partner_withdrawals(journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_profit_distributions_branch_id
  ON profit_distributions(branch_id);

CREATE INDEX IF NOT EXISTS idx_profit_distributions_created_by
  ON profit_distributions(created_by);

CREATE INDEX IF NOT EXISTS idx_profit_distributions_journal_entry_id
  ON profit_distributions(journal_entry_id);

-- ============================================================
-- 2. RLS POLICY FIXES: (select auth.uid()) pattern
-- ============================================================

-- ---- notifications ----
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
  DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
  DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notifications') THEN
    CREATE POLICY "Users can view own notifications"
      ON notifications FOR SELECT
      TO authenticated
      USING (user_id = (SELECT auth.uid()));

    CREATE POLICY "Users can update own notifications"
      ON notifications FOR UPDATE
      TO authenticated
      USING (user_id = (SELECT auth.uid()))
      WITH CHECK (user_id = (SELECT auth.uid()));

    CREATE POLICY "Users can delete own notifications"
      ON notifications FOR DELETE
      TO authenticated
      USING (user_id = (SELECT auth.uid()));
  END IF;
END $$;

-- ---- vat_transactions ----
DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can view vat_transactions" ON vat_transactions;
  DROP POLICY IF EXISTS "Users can view vat_transactions" ON vat_transactions;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'vat_transactions') THEN
    CREATE POLICY "Authenticated users can view vat_transactions"
      ON vat_transactions FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND (u.branch_id = vat_transactions.branch_id OR u.role IN ('admin', 'super_admin'))
        )
      );
  END IF;
END $$;

-- ---- partner_withdrawals ----
DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can view partner_withdrawals" ON partner_withdrawals;
  DROP POLICY IF EXISTS "Authenticated users can insert partner_withdrawals" ON partner_withdrawals;
  DROP POLICY IF EXISTS "Authenticated users can update partner_withdrawals" ON partner_withdrawals;
  DROP POLICY IF EXISTS "Users can view partner_withdrawals" ON partner_withdrawals;
  DROP POLICY IF EXISTS "Users can insert partner_withdrawals" ON partner_withdrawals;
  DROP POLICY IF EXISTS "Users can update partner_withdrawals" ON partner_withdrawals;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'partner_withdrawals') THEN
    CREATE POLICY "Authenticated users can view partner_withdrawals"
      ON partner_withdrawals FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND u.role IN ('admin', 'super_admin', 'accountant', 'observer')
        )
      );

    CREATE POLICY "Authenticated users can insert partner_withdrawals"
      ON partner_withdrawals FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND u.role IN ('admin', 'super_admin', 'accountant')
        )
      );

    CREATE POLICY "Authenticated users can update partner_withdrawals"
      ON partner_withdrawals FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND u.role IN ('admin', 'super_admin')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND u.role IN ('admin', 'super_admin')
        )
      );
  END IF;
END $$;

-- ---- partners ----
DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can view partners" ON partners;
  DROP POLICY IF EXISTS "Authenticated users can insert partners" ON partners;
  DROP POLICY IF EXISTS "Authenticated users can update partners" ON partners;
  DROP POLICY IF EXISTS "Users can view partners" ON partners;
  DROP POLICY IF EXISTS "Users can insert partners" ON partners;
  DROP POLICY IF EXISTS "Users can update partners" ON partners;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'partners') THEN
    CREATE POLICY "Authenticated users can view partners"
      ON partners FOR SELECT
      TO authenticated
      USING (
        EXISTS (SELECT 1 FROM users u WHERE u.id = (SELECT auth.uid()))
      );

    CREATE POLICY "Authenticated users can insert partners"
      ON partners FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND u.role IN ('admin', 'super_admin')
        )
      );

    CREATE POLICY "Authenticated users can update partners"
      ON partners FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND u.role IN ('admin', 'super_admin')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND u.role IN ('admin', 'super_admin')
        )
      );
  END IF;
END $$;

-- ---- customers ----
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view customers in branch" ON customers;
  DROP POLICY IF EXISTS "Authenticated users can view customers" ON customers;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'customers') THEN
    CREATE POLICY "Authenticated users can view customers"
      ON customers FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND (u.branch_id = customers.branch_id OR u.role IN ('admin', 'super_admin'))
        )
      );
  END IF;
END $$;

-- ---- vat_returns ----
DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can view vat_returns" ON vat_returns;
  DROP POLICY IF EXISTS "Authenticated users can insert vat_returns" ON vat_returns;
  DROP POLICY IF EXISTS "Authenticated users can update vat_returns" ON vat_returns;
  DROP POLICY IF EXISTS "Users can view vat_returns" ON vat_returns;
  DROP POLICY IF EXISTS "Users can insert vat_returns" ON vat_returns;
  DROP POLICY IF EXISTS "Users can update vat_returns" ON vat_returns;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'vat_returns') THEN
    CREATE POLICY "Authenticated users can view vat_returns"
      ON vat_returns FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND (u.branch_id = vat_returns.branch_id OR u.role IN ('admin', 'super_admin'))
        )
      );

    CREATE POLICY "Authenticated users can insert vat_returns"
      ON vat_returns FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND u.role IN ('admin', 'super_admin', 'accountant')
        )
      );

    CREATE POLICY "Authenticated users can update vat_returns"
      ON vat_returns FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND u.role IN ('admin', 'super_admin')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND u.role IN ('admin', 'super_admin')
        )
      );
  END IF;
END $$;

-- ---- profit_distributions ----
DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can view profit_distributions" ON profit_distributions;
  DROP POLICY IF EXISTS "Authenticated users can insert profit_distributions" ON profit_distributions;
  DROP POLICY IF EXISTS "Authenticated users can update profit_distributions" ON profit_distributions;
  DROP POLICY IF EXISTS "Users can view profit_distributions" ON profit_distributions;
  DROP POLICY IF EXISTS "Users can insert profit_distributions" ON profit_distributions;
  DROP POLICY IF EXISTS "Users can update profit_distributions" ON profit_distributions;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profit_distributions') THEN
    CREATE POLICY "Authenticated users can view profit_distributions"
      ON profit_distributions FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND u.role IN ('admin', 'super_admin', 'accountant', 'observer')
        )
      );

    CREATE POLICY "Authenticated users can insert profit_distributions"
      ON profit_distributions FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND u.role IN ('admin', 'super_admin', 'accountant')
        )
      );

    CREATE POLICY "Authenticated users can update profit_distributions"
      ON profit_distributions FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND u.role IN ('admin', 'super_admin')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND u.role IN ('admin', 'super_admin')
        )
      );
  END IF;
END $$;

-- ---- purchase_payments ----
DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can view purchase_payments" ON purchase_payments;
  DROP POLICY IF EXISTS "Authenticated users can insert purchase_payments" ON purchase_payments;
  DROP POLICY IF EXISTS "Authenticated users can update purchase_payments" ON purchase_payments;
  DROP POLICY IF EXISTS "Users can view purchase_payments" ON purchase_payments;
  DROP POLICY IF EXISTS "Users can insert purchase_payments" ON purchase_payments;
  DROP POLICY IF EXISTS "Users can update purchase_payments" ON purchase_payments;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'purchase_payments') THEN
    CREATE POLICY "Authenticated users can view purchase_payments"
      ON purchase_payments FOR SELECT
      TO authenticated
      USING (
        EXISTS (SELECT 1 FROM users u WHERE u.id = (SELECT auth.uid()))
      );

    CREATE POLICY "Authenticated users can insert purchase_payments"
      ON purchase_payments FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND u.role IN ('admin', 'super_admin', 'accountant')
        )
      );

    CREATE POLICY "Authenticated users can update purchase_payments"
      ON purchase_payments FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND u.role IN ('admin', 'super_admin')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND u.role IN ('admin', 'super_admin')
        )
      );
  END IF;
END $$;

-- ---- invoice_payments ----
DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can view invoice_payments" ON invoice_payments;
  DROP POLICY IF EXISTS "Authenticated users can insert invoice_payments" ON invoice_payments;
  DROP POLICY IF EXISTS "Authenticated users can update invoice_payments" ON invoice_payments;
  DROP POLICY IF EXISTS "Users can view invoice_payments" ON invoice_payments;
  DROP POLICY IF EXISTS "Users can insert invoice_payments" ON invoice_payments;
  DROP POLICY IF EXISTS "Users can update invoice_payments" ON invoice_payments;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invoice_payments') THEN
    CREATE POLICY "Authenticated users can view invoice_payments"
      ON invoice_payments FOR SELECT
      TO authenticated
      USING (
        EXISTS (SELECT 1 FROM users u WHERE u.id = (SELECT auth.uid()))
      );

    CREATE POLICY "Authenticated users can insert invoice_payments"
      ON invoice_payments FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND u.role IN ('admin', 'super_admin', 'accountant')
        )
      );

    CREATE POLICY "Authenticated users can update invoice_payments"
      ON invoice_payments FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND u.role IN ('admin', 'super_admin')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND u.role IN ('admin', 'super_admin')
        )
      );
  END IF;
END $$;

-- ---- expenses ----
DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can view expenses" ON expenses;
  DROP POLICY IF EXISTS "Authenticated users can insert expenses" ON expenses;
  DROP POLICY IF EXISTS "Authenticated users can update expenses" ON expenses;
  DROP POLICY IF EXISTS "Users can view expenses" ON expenses;
  DROP POLICY IF EXISTS "Users can insert expenses" ON expenses;
  DROP POLICY IF EXISTS "Users can update expenses" ON expenses;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'expenses') THEN
    CREATE POLICY "Authenticated users can view expenses"
      ON expenses FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND (u.branch_id = expenses.branch_id OR u.role IN ('admin', 'super_admin'))
        )
      );

    CREATE POLICY "Authenticated users can insert expenses"
      ON expenses FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND u.role IN ('admin', 'super_admin', 'accountant')
        )
      );

    CREATE POLICY "Authenticated users can update expenses"
      ON expenses FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND u.role IN ('admin', 'super_admin', 'accountant')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND u.role IN ('admin', 'super_admin', 'accountant')
        )
      );
  END IF;
END $$;

-- ---- bank_statement_imports (no branch_id column — use role-only check) ----
DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can view bank_statement_imports" ON bank_statement_imports;
  DROP POLICY IF EXISTS "Authenticated users can insert bank_statement_imports" ON bank_statement_imports;
  DROP POLICY IF EXISTS "Authenticated users can update bank_statement_imports" ON bank_statement_imports;
  DROP POLICY IF EXISTS "Users can view bank_statement_imports" ON bank_statement_imports;
  DROP POLICY IF EXISTS "Users can insert bank_statement_imports" ON bank_statement_imports;
  DROP POLICY IF EXISTS "Users can update bank_statement_imports" ON bank_statement_imports;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bank_statement_imports') THEN
    CREATE POLICY "Authenticated users can view bank_statement_imports"
      ON bank_statement_imports FOR SELECT
      TO authenticated
      USING (
        EXISTS (SELECT 1 FROM users u WHERE u.id = (SELECT auth.uid()))
      );

    CREATE POLICY "Authenticated users can insert bank_statement_imports"
      ON bank_statement_imports FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND u.role IN ('admin', 'super_admin', 'accountant')
        )
      );

    CREATE POLICY "Authenticated users can update bank_statement_imports"
      ON bank_statement_imports FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND u.role IN ('admin', 'super_admin', 'accountant')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND u.role IN ('admin', 'super_admin', 'accountant')
        )
      );
  END IF;
END $$;

-- ---- bank_statement_lines ----
DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can view bank_statement_lines" ON bank_statement_lines;
  DROP POLICY IF EXISTS "Authenticated users can insert bank_statement_lines" ON bank_statement_lines;
  DROP POLICY IF EXISTS "Authenticated users can update bank_statement_lines" ON bank_statement_lines;
  DROP POLICY IF EXISTS "Users can view bank_statement_lines" ON bank_statement_lines;
  DROP POLICY IF EXISTS "Users can insert bank_statement_lines" ON bank_statement_lines;
  DROP POLICY IF EXISTS "Users can update bank_statement_lines" ON bank_statement_lines;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bank_statement_lines') THEN
    CREATE POLICY "Authenticated users can view bank_statement_lines"
      ON bank_statement_lines FOR SELECT
      TO authenticated
      USING (
        EXISTS (SELECT 1 FROM users u WHERE u.id = (SELECT auth.uid()))
      );

    CREATE POLICY "Authenticated users can insert bank_statement_lines"
      ON bank_statement_lines FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND u.role IN ('admin', 'super_admin', 'accountant')
        )
      );

    CREATE POLICY "Authenticated users can update bank_statement_lines"
      ON bank_statement_lines FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND u.role IN ('admin', 'super_admin', 'accountant')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND u.role IN ('admin', 'super_admin', 'accountant')
        )
      );
  END IF;
END $$;

-- ---- reconciliation_matches ----
DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can view reconciliation_matches" ON reconciliation_matches;
  DROP POLICY IF EXISTS "Authenticated users can insert reconciliation_matches" ON reconciliation_matches;
  DROP POLICY IF EXISTS "Authenticated users can update reconciliation_matches" ON reconciliation_matches;
  DROP POLICY IF EXISTS "Users can view reconciliation_matches" ON reconciliation_matches;
  DROP POLICY IF EXISTS "Users can insert reconciliation_matches" ON reconciliation_matches;
  DROP POLICY IF EXISTS "Users can update reconciliation_matches" ON reconciliation_matches;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'reconciliation_matches') THEN
    CREATE POLICY "Authenticated users can view reconciliation_matches"
      ON reconciliation_matches FOR SELECT
      TO authenticated
      USING (
        EXISTS (SELECT 1 FROM users u WHERE u.id = (SELECT auth.uid()))
      );

    CREATE POLICY "Authenticated users can insert reconciliation_matches"
      ON reconciliation_matches FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND u.role IN ('admin', 'super_admin', 'accountant')
        )
      );

    CREATE POLICY "Authenticated users can update reconciliation_matches"
      ON reconciliation_matches FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND u.role IN ('admin', 'super_admin', 'accountant')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = (SELECT auth.uid())
          AND u.role IN ('admin', 'super_admin', 'accountant')
        )
      );
  END IF;
END $$;

-- ============================================================
-- 3. FIX SECURITY DEFINER VIEW: v_partner_balances
-- ============================================================
DROP VIEW IF EXISTS public.v_partner_balances;

CREATE OR REPLACE VIEW public.v_partner_balances
WITH (security_invoker = true)
AS
SELECT
  p.id AS partner_id,
  p.name,
  p.name_ar,
  p.ownership_percentage,
  p.profit_share_percentage,
  p.capital_contribution,
  p.is_active,
  COALESCE(wd.total_withdrawals, 0) AS total_withdrawals,
  COALESCE(pd.total_distributed, 0) AS total_profit_distributed,
  COALESCE(ss.total_settlements_paid, 0) AS total_settlements_paid,
  COALESCE(sr.total_settlements_received, 0) AS total_settlements_received,
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
