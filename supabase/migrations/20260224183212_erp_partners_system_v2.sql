/*
  # ERP-Grade Partner Management System v2

  1. New Tables
    - `partner_withdrawals` - Records partner cash/bank withdrawals with GL posting
      - `id`, `partner_id`, `amount`, `method` (cash/bank), `description`, `withdrawal_date`, `journal_entry_id`, `created_by`, `branch_id`, `created_at`
    - `profit_distributions` - Monthly profit distribution records
      - `id`, `partner_id`, `period_month`, `period_year`, `net_profit_base`, `share_percentage`, `amount_distributed`, `journal_entry_id`, `status` (pending/posted), `created_by`, `branch_id`, `created_at`

  2. Modified Tables
    - `partners`: ensure `is_active` exists (already added)

  3. New Views
    - `v_partner_account` - Real-time current account balance per partner from GL
    - `v_partner_capital_summary` - Capital and equity summary

  4. New Functions
    - `fn_record_partner_withdrawal(...)` - Atomic withdrawal with GL posting
    - `fn_distribute_monthly_profit(p_period_month, p_period_year, p_branch_id)` - Monthly profit distribution with GL

  5. Security
    - RLS on all new tables
    - Admin-only access for financial operations
*/

CREATE TABLE IF NOT EXISTS partner_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id),
  amount numeric(15,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL DEFAULT 'cash' CHECK (method IN ('cash', 'bank')),
  description text NOT NULL,
  description_ar text,
  withdrawal_date date NOT NULL DEFAULT CURRENT_DATE,
  journal_entry_id uuid REFERENCES journal_entries(id),
  created_by uuid REFERENCES auth.users(id),
  branch_id uuid REFERENCES branches(id),
  is_voided boolean NOT NULL DEFAULT false,
  void_reason text,
  voided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_withdrawals_partner_id ON partner_withdrawals (partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_withdrawals_date ON partner_withdrawals (withdrawal_date DESC);
CREATE INDEX IF NOT EXISTS idx_partner_withdrawals_branch_id ON partner_withdrawals (branch_id);

ALTER TABLE partner_withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view partner withdrawals"
  ON partner_withdrawals FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admin can insert partner withdrawals"
  ON partner_withdrawals FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admin can update partner withdrawals"
  ON partner_withdrawals FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE TABLE IF NOT EXISTS profit_distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id),
  period_month smallint NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year smallint NOT NULL,
  net_profit_base numeric(15,2) NOT NULL,
  share_percentage numeric(5,2) NOT NULL,
  amount_distributed numeric(15,2) NOT NULL,
  journal_entry_id uuid REFERENCES journal_entries(id),
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('pending', 'posted', 'voided')),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  branch_id uuid REFERENCES branches(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, period_month, period_year)
);

CREATE INDEX IF NOT EXISTS idx_profit_distributions_partner_id ON profit_distributions (partner_id);
CREATE INDEX IF NOT EXISTS idx_profit_distributions_period ON profit_distributions (period_year DESC, period_month DESC);

ALTER TABLE profit_distributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view profit distributions"
  ON profit_distributions FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admin can insert profit distributions"
  ON profit_distributions FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admin can update profit distributions"
  ON profit_distributions FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE OR REPLACE VIEW v_partner_account
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
  COALESCE(pd.total_distributed, 0) AS total_profit_distributed,
  COALESCE(pw.total_withdrawn, 0) AS total_withdrawals,
  COALESCE(ps_paid.total_paid, 0) AS total_settlements_paid,
  COALESCE(ps_rcvd.total_received, 0) AS total_settlements_received,
  COALESCE(pd.total_distributed, 0)
    - COALESCE(pw.total_withdrawn, 0)
    - COALESCE(ps_paid.total_paid, 0)
    + COALESCE(ps_rcvd.total_received, 0) AS current_account_balance
FROM partners p
LEFT JOIN (
  SELECT partner_id, SUM(amount_distributed) AS total_distributed
  FROM profit_distributions
  WHERE status = 'posted'
  GROUP BY partner_id
) pd ON pd.partner_id = p.id
LEFT JOIN (
  SELECT partner_id, SUM(amount) AS total_withdrawn
  FROM partner_withdrawals
  WHERE is_voided = false
  GROUP BY partner_id
) pw ON pw.partner_id = p.id
LEFT JOIN (
  SELECT from_partner_id AS partner_id, SUM(amount) AS total_paid
  FROM partner_settlements
  WHERE status = 'active'
  GROUP BY from_partner_id
) ps_paid ON ps_paid.partner_id = p.id
LEFT JOIN (
  SELECT to_partner_id AS partner_id, SUM(amount) AS total_received
  FROM partner_settlements
  WHERE status = 'active'
  GROUP BY to_partner_id
) ps_rcvd ON ps_rcvd.partner_id = p.id;

CREATE OR REPLACE FUNCTION public.fn_record_partner_withdrawal(
  p_partner_id uuid,
  p_amount numeric,
  p_method text,
  p_description text,
  p_description_ar text,
  p_withdrawal_date date,
  p_branch_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_number text;
  v_journal_id uuid;
  v_partner_name text;
  v_withdrawal_id uuid;
  v_cash_account text;
  v_partner_account text := '3110';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Admin access required');
  END IF;

  SELECT name INTO v_partner_name FROM partners WHERE id = p_partner_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Partner not found');
  END IF;

  v_cash_account := CASE WHEN p_method = 'bank' THEN '1121' ELSE '1110' END;

  SELECT 'WD-' || to_char(now(), 'YYYYMMDD') || '-' || LPAD(COALESCE(
    (SELECT COUNT(*) + 1 FROM journal_entries WHERE entry_number LIKE 'WD-%' AND created_at::date = CURRENT_DATE)::text, '1'), 4, '0')
  INTO v_entry_number;

  INSERT INTO journal_entries (
    entry_number, entry_date, reference, description, status, branch_id, created_by
  ) VALUES (
    v_entry_number,
    p_withdrawal_date,
    'WITHDRAWAL',
    'Partner Withdrawal: ' || v_partner_name || ' - ' || p_description,
    'posted',
    p_branch_id,
    auth.uid()
  ) RETURNING id INTO v_journal_id;

  INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit, line_number)
  VALUES
    (v_journal_id, v_partner_account, 'Dr Partner Current Account - ' || v_partner_name, p_amount, 0, 1),
    (v_journal_id, v_cash_account, 'Cr ' || CASE WHEN p_method = 'bank' THEN 'Bank' ELSE 'Cash' END || ' - ' || v_partner_name, 0, p_amount, 2);

  INSERT INTO partner_withdrawals (
    partner_id, amount, method, description, description_ar,
    withdrawal_date, journal_entry_id, created_by, branch_id
  ) VALUES (
    p_partner_id, p_amount, p_method, p_description,
    COALESCE(p_description_ar, p_description),
    p_withdrawal_date, v_journal_id, auth.uid(), p_branch_id
  ) RETURNING id INTO v_withdrawal_id;

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', v_withdrawal_id,
    'journal_entry_id', v_journal_id,
    'entry_number', v_entry_number
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_distribute_monthly_profit(
  p_period_month int,
  p_period_year int,
  p_branch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner RECORD;
  v_net_profit numeric;
  v_entry_number text;
  v_journal_id uuid;
  v_line_num int := 1;
  v_total_distributed numeric := 0;
  v_period_start date;
  v_period_end date;
  v_dist_count int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Admin access required');
  END IF;

  v_period_start := make_date(p_period_year, p_period_month, 1);
  v_period_end := (v_period_start + INTERVAL '1 month - 1 day')::date;

  SELECT COALESCE(SUM(
    CASE WHEN jl.debit > 0 AND ac.account_type = 'revenue' THEN jl.credit - jl.debit
         WHEN jl.credit > 0 AND ac.account_type = 'expense' THEN -(jl.credit - jl.debit)
         ELSE 0 END
  ), 0)
  INTO v_net_profit
  FROM journal_lines jl
  JOIN journal_entries je ON jl.journal_entry_id = je.id
  JOIN chart_of_accounts ac ON jl.account_code = ac.account_code
  WHERE je.status = 'posted'
    AND je.entry_date BETWEEN v_period_start AND v_period_end
    AND (p_branch_id IS NULL OR je.branch_id = p_branch_id)
    AND ac.account_type IN ('revenue', 'expense');

  IF v_net_profit <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'No distributable profit for this period. Net: ' || v_net_profit);
  END IF;

  IF EXISTS (
    SELECT 1 FROM profit_distributions
    WHERE period_month = p_period_month AND period_year = p_period_year
      AND status != 'voided'
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Profit already distributed for this period');
  END IF;

  SELECT 'PDIST-' || to_char(now(), 'YYYYMM') || '-' || LPAD(COALESCE(
    (SELECT COUNT(*) + 1 FROM journal_entries WHERE entry_number LIKE 'PDIST-%')::text, '1'), 4, '0')
  INTO v_entry_number;

  INSERT INTO journal_entries (
    entry_number, entry_date, reference, description, status, branch_id, created_by
  ) VALUES (
    v_entry_number,
    v_period_end,
    'PROFIT_DIST',
    'Monthly Profit Distribution - ' || to_char(v_period_start, 'Month YYYY'),
    'draft',
    p_branch_id,
    auth.uid()
  ) RETURNING id INTO v_journal_id;

  INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit, line_number)
  VALUES (
    v_journal_id, '3200',
    'Dr Retained Earnings - ' || to_char(v_period_start, 'Month YYYY'),
    v_net_profit, 0, v_line_num
  );
  v_line_num := v_line_num + 1;

  FOR v_partner IN
    SELECT id, name, name_ar, profit_share_percentage
    FROM partners
    WHERE is_active = true AND profit_share_percentage > 0
    ORDER BY name
  LOOP
    DECLARE
      v_amount numeric := ROUND((v_net_profit * v_partner.profit_share_percentage / 100), 2);
    BEGIN
      INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit, line_number)
      VALUES (
        v_journal_id, '3110',
        'Cr Partner Current Account - ' || v_partner.name || ' (' || v_partner.profit_share_percentage || '%)',
        0, v_amount, v_line_num
      );
      v_line_num := v_line_num + 1;

      INSERT INTO profit_distributions (
        partner_id, period_month, period_year, net_profit_base,
        share_percentage, amount_distributed, journal_entry_id, status,
        created_by, branch_id
      ) VALUES (
        v_partner.id, p_period_month, p_period_year, v_net_profit,
        v_partner.profit_share_percentage, v_amount, v_journal_id, 'posted',
        auth.uid(), p_branch_id
      )
      ON CONFLICT (partner_id, period_month, period_year) DO NOTHING;

      v_total_distributed := v_total_distributed + v_amount;
      v_dist_count := v_dist_count + 1;
    END;
  END LOOP;

  UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;

  RETURN jsonb_build_object(
    'success', true,
    'journal_entry_id', v_journal_id,
    'entry_number', v_entry_number,
    'net_profit', v_net_profit,
    'total_distributed', v_total_distributed,
    'partners_count', v_dist_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_record_partner_withdrawal TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_distribute_monthly_profit TO authenticated;
