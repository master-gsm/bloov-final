
/*
  # VAT Engine — Migration 3: vat_transactions Ledger Table

  ## Summary
  Creates a dedicated, append-only VAT ledger that records every taxable event
  regardless of source (sales, purchases, operating expenses, setup expenses,
  partner reimbursements). This replaces ad-hoc querying of source tables for
  VAT return purposes and enables per-transaction audit trails.

  ## New Table: `vat_transactions`
  | Column          | Type                          | Description |
  |-----------------|-------------------------------|-------------|
  | id              | uuid PK                       | Surrogate key |
  | source_type     | text NOT NULL                 | 'sale','purchase','operating_expense','setup_expense','partner_contribution' |
  | source_id       | uuid NOT NULL                 | FK to the originating row |
  | supplier_id     | uuid NULL                     | For input VAT: supplier/partner id |
  | invoice_number  | text NULL                     | Human-readable reference |
  | taxable_amount  | numeric NOT NULL DEFAULT 0    | Net amount excluding VAT |
  | vat_amount      | numeric NOT NULL DEFAULT 0    | VAT charged or recoverable |
  | vat_category    | vat_category_enum NOT NULL    | standard/zero_rated/exempt/outside_scope |
  | tax_code        | text NOT NULL DEFAULT 'S'     | S/Z/E/O |
  | tax_rate        | numeric NOT NULL DEFAULT 0    | Effective rate |
  | direction       | text NOT NULL                 | 'input' (recoverable) or 'output' (payable) |
  | period_month    | integer NOT NULL              | 1-12 |
  | period_year     | integer NOT NULL              | e.g. 2026 |
  | transaction_date| date NOT NULL                 | Date of the originating document |
  | branch_id       | uuid NULL                     | Branch isolation |
  | status          | text NOT NULL DEFAULT 'open'  | 'open','settled','refunded' |
  | vat_return_id   | uuid NULL                     | FK to vat_returns once settled |
  | created_at      | timestamptz DEFAULT now()     | |

  ## Auto-Population Triggers (AFTER INSERT)
  - trg_vat_tx_from_sale              → direction='output'
  - trg_vat_tx_from_purchase          → direction='input'  (header-level, standard only)
  - trg_vat_tx_from_operating_expense → direction='input'  (standard only)
  - trg_vat_tx_from_setup_expense     → direction='input'  (standard only)
  - trg_vat_tx_from_partner_contrib   → direction='input'  (reimbursement + standard only)

  ## Security
  - RLS enabled; authenticated users SELECT their own branch rows.
  - Admins can SELECT all rows.
  - No user can INSERT/UPDATE/DELETE directly — all writes via triggers only.
*/

-- ── 1. Create vat_transactions table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vat_transactions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type      text        NOT NULL,
  source_id        uuid        NOT NULL,
  supplier_id      uuid        NULL,
  invoice_number   text        NULL,
  taxable_amount   numeric     NOT NULL DEFAULT 0,
  vat_amount       numeric     NOT NULL DEFAULT 0,
  vat_category     vat_category_enum NOT NULL DEFAULT 'standard',
  tax_code         text        NOT NULL DEFAULT 'S',
  tax_rate         numeric     NOT NULL DEFAULT 0,
  direction        text        NOT NULL CHECK (direction IN ('input','output')),
  period_month     integer     NOT NULL,
  period_year      integer     NOT NULL,
  transaction_date date        NOT NULL,
  branch_id        uuid        NULL,
  status           text        NOT NULL DEFAULT 'open'
                               CHECK (status IN ('open','settled','refunded')),
  vat_return_id    uuid        NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Indexes for VAT return queries
CREATE INDEX IF NOT EXISTS idx_vat_tx_period       ON vat_transactions (period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_vat_tx_branch_period ON vat_transactions (branch_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_vat_tx_source        ON vat_transactions (source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_vat_tx_direction     ON vat_transactions (direction, status);

-- ── 2. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE vat_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view vat_transactions for their branch"
  ON vat_transactions FOR SELECT TO authenticated
  USING (
    branch_id IS NULL
    OR branch_id = (
      SELECT branch_id FROM users WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid()
      AND role IN ('admin','super_admin','accountant','observer')
    )
  );

-- ── 3. Trigger function: from sales (output VAT) ─────────────────────────────
CREATE OR REPLACE FUNCTION record_vat_tx_from_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tax   numeric := COALESCE(NEW.tax, 0);
  v_net   numeric := COALESCE(NEW.subtotal, 0);
  v_month integer;
  v_year  integer;
BEGIN
  -- Only post for confirmed sales (not draft/cancelled/void)
  IF NEW.status NOT IN ('confirmed','completed','returned') THEN
    RETURN NEW;
  END IF;
  IF v_tax <= 0 THEN
    RETURN NEW;
  END IF;

  v_month := EXTRACT(MONTH FROM NEW.sale_date::date)::integer;
  v_year  := EXTRACT(YEAR  FROM NEW.sale_date::date)::integer;

  -- Remove any previous record for this sale (idempotent on status changes)
  DELETE FROM vat_transactions WHERE source_type = 'sale' AND source_id = NEW.id;

  INSERT INTO vat_transactions (
    source_type, source_id, invoice_number,
    taxable_amount, vat_amount, vat_category, tax_code, tax_rate,
    direction, period_month, period_year, transaction_date, branch_id
  ) VALUES (
    'sale', NEW.id, NEW.invoice_number,
    v_net, v_tax, 'standard', 'S', 15,
    'output', v_month, v_year, NEW.sale_date::date, NEW.branch_id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vat_tx_from_sale ON sales;
CREATE TRIGGER trg_vat_tx_from_sale
  AFTER INSERT OR UPDATE OF status ON sales
  FOR EACH ROW EXECUTE FUNCTION record_vat_tx_from_sale();

-- ── 4. Trigger function: from purchases (input VAT) ──────────────────────────
CREATE OR REPLACE FUNCTION record_vat_tx_from_purchase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_vat    numeric := COALESCE(NEW.vat_amount, 0);
  v_net    numeric := COALESCE(NEW.subtotal, 0);
  v_cat    vat_category_enum;
  v_code   text    := 'S';
  v_rate   numeric := 0;
  v_month  integer;
  v_year   integer;
BEGIN
  IF NEW.is_deleted IS TRUE THEN
    DELETE FROM vat_transactions WHERE source_type = 'purchase' AND source_id = NEW.id;
    RETURN NEW;
  END IF;
  IF v_vat <= 0 THEN
    RETURN NEW;
  END IF;

  -- Map vat_status_snapshot → enum
  CASE COALESCE(NEW.vat_status_snapshot, 'standard')
    WHEN 'standard'      THEN v_cat := 'standard';      v_code := 'S'; v_rate := 15;
    WHEN 'zero_rated'    THEN v_cat := 'zero_rated';     v_code := 'Z'; v_rate := 0;
    WHEN 'exempt'        THEN v_cat := 'exempt';         v_code := 'E'; v_rate := 0;
    WHEN 'outside_scope' THEN v_cat := 'outside_scope';  v_code := 'O'; v_rate := 0;
    ELSE                      v_cat := 'standard';      v_code := 'S'; v_rate := 15;
  END CASE;

  v_month := EXTRACT(MONTH FROM NEW.purchase_date)::integer;
  v_year  := EXTRACT(YEAR  FROM NEW.purchase_date)::integer;

  DELETE FROM vat_transactions WHERE source_type = 'purchase' AND source_id = NEW.id;

  INSERT INTO vat_transactions (
    source_type, source_id, supplier_id, invoice_number,
    taxable_amount, vat_amount, vat_category, tax_code, tax_rate,
    direction, period_month, period_year, transaction_date, branch_id
  ) VALUES (
    'purchase', NEW.id, NEW.supplier_id, NEW.invoice_number,
    v_net, v_vat, v_cat, v_code, v_rate,
    'input', v_month, v_year, NEW.purchase_date, NEW.branch_id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vat_tx_from_purchase ON purchases;
CREATE TRIGGER trg_vat_tx_from_purchase
  AFTER INSERT OR UPDATE OF vat_amount, vat_status_snapshot, is_deleted ON purchases
  FOR EACH ROW EXECUTE FUNCTION record_vat_tx_from_purchase();

-- ── 5. Trigger function: from operating_expenses (input VAT) ─────────────────
CREATE OR REPLACE FUNCTION record_vat_tx_from_operating_expense()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_vat   numeric := COALESCE(NEW.vat_amount, 0);
  v_net   numeric := COALESCE(NEW.net_amount, NEW.amount, 0);
  v_month integer;
  v_year  integer;
BEGIN
  IF NEW.is_deleted IS TRUE THEN
    DELETE FROM vat_transactions WHERE source_type = 'operating_expense' AND source_id = NEW.id;
    RETURN NEW;
  END IF;
  IF v_vat <= 0 THEN
    RETURN NEW;
  END IF;

  v_month := EXTRACT(MONTH FROM NEW.expense_date)::integer;
  v_year  := EXTRACT(YEAR  FROM NEW.expense_date)::integer;

  DELETE FROM vat_transactions WHERE source_type = 'operating_expense' AND source_id = NEW.id;

  INSERT INTO vat_transactions (
    source_type, source_id, invoice_number,
    taxable_amount, vat_amount, vat_category, tax_code, tax_rate,
    direction, period_month, period_year, transaction_date, branch_id
  ) VALUES (
    'operating_expense', NEW.id, NEW.expense_number,
    v_net, v_vat, NEW.vat_category, NEW.tax_code, NEW.tax_rate,
    'input', v_month, v_year, NEW.expense_date, NEW.branch_id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vat_tx_from_operating_expense ON operating_expenses;
CREATE TRIGGER trg_vat_tx_from_operating_expense
  AFTER INSERT OR UPDATE OF vat_amount, is_deleted ON operating_expenses
  FOR EACH ROW EXECUTE FUNCTION record_vat_tx_from_operating_expense();

-- ── 6. Trigger function: from setup_expenses (input VAT) ─────────────────────
CREATE OR REPLACE FUNCTION record_vat_tx_from_setup_expense()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_vat   numeric := COALESCE(NEW.vat_amount, 0);
  v_net   numeric := COALESCE(NEW.net_amount, NEW.amount, 0);
  v_month integer;
  v_year  integer;
BEGIN
  IF NEW.is_deleted IS TRUE THEN
    DELETE FROM vat_transactions WHERE source_type = 'setup_expense' AND source_id = NEW.id;
    RETURN NEW;
  END IF;
  IF v_vat <= 0 THEN
    RETURN NEW;
  END IF;

  v_month := EXTRACT(MONTH FROM NEW.expense_date)::integer;
  v_year  := EXTRACT(YEAR  FROM NEW.expense_date)::integer;

  DELETE FROM vat_transactions WHERE source_type = 'setup_expense' AND source_id = NEW.id;

  INSERT INTO vat_transactions (
    source_type, source_id, invoice_number,
    taxable_amount, vat_amount, vat_category, tax_code, tax_rate,
    direction, period_month, period_year, transaction_date, branch_id
  ) VALUES (
    'setup_expense', NEW.id, NEW.receipt_number,
    v_net, v_vat, NEW.vat_category, NEW.tax_code, NEW.tax_rate,
    'input', v_month, v_year, NEW.expense_date, NEW.branch_id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vat_tx_from_setup_expense ON setup_expenses;
CREATE TRIGGER trg_vat_tx_from_setup_expense
  AFTER INSERT OR UPDATE OF vat_amount, is_deleted ON setup_expenses
  FOR EACH ROW EXECUTE FUNCTION record_vat_tx_from_setup_expense();

-- ── 7. Trigger function: from partner_contributions (input VAT, reimbursement) ─
CREATE OR REPLACE FUNCTION record_vat_tx_from_partner_contribution()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_vat   numeric := COALESCE(NEW.vat_amount, 0);
  v_net   numeric := COALESCE(NEW.net_amount, NEW.amount, 0);
  v_month integer;
  v_year  integer;
BEGIN
  -- Only reimbursements generate input VAT entries
  IF COALESCE(NEW.contribution_type,'') != 'reimbursement' THEN
    RETURN NEW;
  END IF;
  IF NEW.is_deleted IS TRUE THEN
    DELETE FROM vat_transactions WHERE source_type = 'partner_contribution' AND source_id = NEW.id;
    RETURN NEW;
  END IF;
  IF v_vat <= 0 THEN
    RETURN NEW;
  END IF;

  v_month := EXTRACT(MONTH FROM NEW.contribution_date)::integer;
  v_year  := EXTRACT(YEAR  FROM NEW.contribution_date)::integer;

  DELETE FROM vat_transactions WHERE source_type = 'partner_contribution' AND source_id = NEW.id;

  INSERT INTO vat_transactions (
    source_type, source_id, supplier_id,
    taxable_amount, vat_amount, vat_category, tax_code, tax_rate,
    direction, period_month, period_year, transaction_date
  ) VALUES (
    'partner_contribution', NEW.id, NEW.partner_id,
    v_net, v_vat, NEW.vat_category, NEW.tax_code, NEW.tax_rate,
    'input', v_month, v_year, NEW.contribution_date
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vat_tx_from_partner_contribution ON partner_contributions;
CREATE TRIGGER trg_vat_tx_from_partner_contribution
  AFTER INSERT OR UPDATE OF vat_amount, is_deleted ON partner_contributions
  FOR EACH ROW EXECUTE FUNCTION record_vat_tx_from_partner_contribution();
