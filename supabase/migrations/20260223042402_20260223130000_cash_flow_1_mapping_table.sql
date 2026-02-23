
/*
  # Cash Flow Statement Engine — Migration 1: Mapping Table

  ## Summary
  Creates the `cash_flow_mapping` table that classifies each GL account
  into one of three cash flow activity buckets:
    - operating   : day-to-day business operations
    - investing   : asset purchases/disposals, capital expenditures
    - financing   : equity injections, loan proceeds/repayments, dividends

  The table drives the GL-scan pass inside `get_cash_flow_statement()`.
  Admins can override any mapping via INSERT/UPDATE without touching function code.

  ## Table: `cash_flow_mapping`
  | Column        | Description |
  |---------------|-------------|
  | account_id    | PK + FK → accounts(id) |
  | activity_type | 'operating' | 'investing' | 'financing' |
  | line_label    | Friendly label shown in the report (e.g., "Depreciation Adjustment") |
  | sign_convention | +1 = source of cash, -1 = use of cash (default +1) |
  | is_adjustment | true = non-cash item added back (depreciation, etc.) |
  | sort_order    | display order within the activity section |
  | notes         | optional explanation |

  ## Security
  - RLS enabled.
  - All authenticated users can SELECT.
  - Only admin/super_admin/accountant can INSERT/UPDATE.
  - No DELETE (use UPDATE to override if needed).

  ## Seed Data
  Pre-populates all known accounts from the chart of accounts with their
  canonical cash-flow classification per IFRS IAS 7 / GAAP practice.
*/

-- ── 1. Table ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cash_flow_mapping (
  account_id      uuid        PRIMARY KEY REFERENCES accounts(id),
  activity_type   text        NOT NULL
                              CHECK (activity_type IN ('operating','investing','financing')),
  line_label      text        NOT NULL DEFAULT '',
  sign_convention smallint    NOT NULL DEFAULT 1
                              CHECK (sign_convention IN (-1, 1)),
  is_adjustment   boolean     NOT NULL DEFAULT false,
  sort_order      integer     NOT NULL DEFAULT 100,
  notes           text        NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cfm_activity ON cash_flow_mapping (activity_type);

ALTER TABLE cash_flow_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view cash_flow_mapping"
  ON cash_flow_mapping FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can insert cash_flow_mapping"
  ON cash_flow_mapping FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid()
            AND role IN ('admin','super_admin','accountant'))
  );

CREATE POLICY "Admins can update cash_flow_mapping"
  ON cash_flow_mapping FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid()
            AND role IN ('admin','super_admin','accountant'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid()
            AND role IN ('admin','super_admin','accountant'))
  );

-- ── 2. updated_at trigger ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_cfm_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_cfm_updated_at ON cash_flow_mapping;
CREATE TRIGGER trg_cfm_updated_at
  BEFORE UPDATE ON cash_flow_mapping
  FOR EACH ROW EXECUTE FUNCTION touch_cfm_updated_at();

-- ── 3. Seed default mappings ──────────────────────────────────────────────────
-- All amounts coming through these accounts in journal_lines are bucketed
-- into the three activities.  sign_convention tells the engine:
--   +1 → asset decrease / liability increase = cash inflow  (add to net income)
--   -1 → asset increase / liability decrease = cash outflow (subtract from net income)
-- For operating adjustments is_adjustment = true so they are listed separately
-- from revenue/expense items.

INSERT INTO cash_flow_mapping
  (account_id, activity_type, line_label, sign_convention, is_adjustment, sort_order)
VALUES
  -- ── OPERATING: Working-capital accounts (adjustments to net income) ────────
  -- AR: increase = cash NOT received → subtract; decrease = cash received → add
  ('5a362d35-fb42-406c-8625-9dfd04ca4bbf', 'operating', 'Change in Accounts Receivable',       -1, true,  10),
  ('3752e532-2020-4484-9e7a-fc872e0e2ca6', 'operating', 'Change in Trade Receivables',          -1, true,  11),
  -- Inventory: increase = cash used → subtract
  ('be98cc39-a511-41eb-8624-70975c6ace50', 'operating', 'Change in Inventory',                  -1, true,  20),
  ('2effe477-29da-4468-bb3d-18b90ffae45d', 'operating', 'Change in Raw Materials',              -1, true,  21),
  ('82cce838-cd57-4f50-ba15-fce1a0e36c7b', 'operating', 'Change in Finished Goods',             -1, true,  22),
  -- AP: increase = cash NOT paid → add back
  ('a33a4111-0dc5-4833-a102-0c8ef2d890b4', 'operating', 'Change in Accounts Payable',           +1, true,  30),
  ('09f55caf-4a41-42bb-a89a-8fe931b8dc45', 'operating', 'Change in Trade Payables',             +1, true,  31),
  -- VAT Payable: increase = VAT owed but not yet paid → add back
  ('99a5129d-2d62-45f1-814c-3bd6f9781ab0', 'operating', 'Change in VAT Payable',                +1, true,  40),
  ('33e4891a-d1ed-4ca1-806e-15187acdce22', 'operating', 'Change in Tax Payable (ZATCA)',         +1, true,  41),
  -- VAT Recoverable: increase = VAT paid but not yet recovered → subtract
  ('0f3cb9fd-74bf-4868-a648-857871cda432', 'operating', 'Change in VAT Recoverable',            -1, true,  42),
  -- Current Liabilities (general): increase = cash inflow (accrued but not paid)
  ('18a90574-e7a8-4bec-9192-10f70130c823', 'operating', 'Change in Current Liabilities',        +1, true,  50),

  -- ── INVESTING: Non-current asset accounts ─────────────────────────────────
  -- PP&E: debit increase = asset purchased = cash out
  ('79d7ba6b-962c-4e32-8c6d-4f1bbae34271', 'investing', 'Purchase of Non-Current Assets',       -1, false,  10),
  ('f7b05e30-a023-42ce-98e4-a7be55ce13b2', 'investing', 'Purchase of Property, Plant & Equipment', -1, false, 11),
  ('91746f64-2b46-41d1-9480-2dfe791aa716', 'investing', 'Purchase of Land',                     -1, false, 12),
  ('e0b3717a-0e59-44f4-ae5b-efb857b563bb', 'investing', 'Purchase of Buildings',                -1, false, 13),
  ('ede256c2-5056-45c3-bce8-fe22cc9b2829', 'investing', 'Purchase of Equipment',                -1, false, 14),

  -- ── FINANCING: Equity & long-term liabilities ─────────────────────────────
  -- Capital: increase = new equity injection = cash in
  ('feda13ff-f804-40fc-a713-4c345f9a61e0', 'financing', 'Partner Capital Contributions',        +1, false,  10),
  -- Retained Earnings / P&L: movement handled via net income; exclude from direct scan
  -- (listed here so they don't fall into "unclassified")
  ('951b1eda-b9ac-4398-921a-a1e661c1aac3', 'financing', 'Retained Earnings Movement',           +1, false,  20),
  ('97a9b3c0-1888-4e89-b6b6-65d7213f1e66', 'financing', 'Current Year P&L Movement',            +1, false,  21)

ON CONFLICT (account_id) DO UPDATE
  SET activity_type   = EXCLUDED.activity_type,
      line_label      = EXCLUDED.line_label,
      sign_convention = EXCLUDED.sign_convention,
      is_adjustment   = EXCLUDED.is_adjustment,
      sort_order      = EXCLUDED.sort_order,
      updated_at      = now();
