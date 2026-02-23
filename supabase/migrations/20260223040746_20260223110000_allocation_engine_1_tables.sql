
/*
  # Allocation Engine — Migration 1: Core Tables

  ## Summary
  Creates the AR/AP payment allocation infrastructure.

  ## Schema Additions

  ### `invoices`
  - `branch_id` uuid NULL  — added for branch isolation; resolved via sale_id when NULL.

  ### `supplier_payments`
  - `branch_id` uuid NULL  — added for branch isolation; resolved via purchase link when NULL.

  ### New Table: `invoice_payments` (AR allocation)
  Links a customer_payment to one or more invoices.
  | Column           | Description |
  |------------------|-------------|
  | id               | PK |
  | invoice_id       | FK → invoices |
  | payment_id       | FK → customer_payments |
  | allocated_amount | Amount applied from payment to invoice (> 0) |
  | allocation_date  | Date of allocation |
  | branch_id        | Branch (copied from payment for isolation) |
  | is_deleted       | Soft-delete flag |
  | voided_at/by     | Void tracking |
  | created_at/by    | Audit |

  ### New Table: `purchase_payments` (AP allocation)
  Links a supplier_payment to one or more purchases.
  Same structure as invoice_payments, references purchases.

  ## Security
  - RLS enabled on both new tables.
  - Authenticated users can SELECT rows for their branch.
  - Admins/accountants can INSERT.
  - No direct DELETE (soft-delete only).

  ## Backward Compatibility
  - Existing invoices/supplier_payments rows: branch_id defaults to NULL.
  - No existing logic is changed.
*/

-- ── 1. Add branch_id to invoices ──────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE invoices ADD COLUMN branch_id uuid NULL;
    -- Back-fill from linked sale
    UPDATE invoices i
    SET branch_id = s.branch_id
    FROM sales s
    WHERE s.id = i.sale_id AND i.branch_id IS NULL;
  END IF;
END $$;

-- ── 2. Add branch_id to supplier_payments ─────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'supplier_payments' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE supplier_payments ADD COLUMN branch_id uuid NULL;
  END IF;
END $$;

-- ── 3. Create invoice_payments (AR allocation table) ──────────────────────────
CREATE TABLE IF NOT EXISTS invoice_payments (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       uuid        NOT NULL REFERENCES invoices(id),
  payment_id       uuid        NOT NULL REFERENCES customer_payments(id),
  allocated_amount numeric     NOT NULL CHECK (allocated_amount > 0),
  allocation_date  date        NOT NULL DEFAULT CURRENT_DATE,
  branch_id        uuid        NOT NULL,
  is_deleted       boolean     NOT NULL DEFAULT false,
  voided_at        timestamptz NULL,
  voided_by        uuid        NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid        NULL
);

CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice  ON invoice_payments (invoice_id)  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_invoice_payments_payment  ON invoice_payments (payment_id)  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_invoice_payments_branch   ON invoice_payments (branch_id)   WHERE is_deleted = false;

ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch members can view invoice_payments"
  ON invoice_payments FOR SELECT TO authenticated
  USING (
    branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid()
        AND role IN ('admin','super_admin','accountant','observer')
    )
  );

CREATE POLICY "Admins and accountants can insert invoice_payments"
  ON invoice_payments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid()
        AND role IN ('admin','super_admin','accountant')
    )
  );

CREATE POLICY "Admins can update invoice_payments (soft delete only)"
  ON invoice_payments FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid()
        AND role IN ('admin','super_admin','accountant')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid()
        AND role IN ('admin','super_admin','accountant')
    )
  );

-- ── 4. Create purchase_payments (AP allocation table) ─────────────────────────
CREATE TABLE IF NOT EXISTS purchase_payments (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id      uuid        NOT NULL REFERENCES purchases(id),
  payment_id       uuid        NOT NULL REFERENCES supplier_payments(id),
  allocated_amount numeric     NOT NULL CHECK (allocated_amount > 0),
  allocation_date  date        NOT NULL DEFAULT CURRENT_DATE,
  branch_id        uuid        NOT NULL,
  is_deleted       boolean     NOT NULL DEFAULT false,
  voided_at        timestamptz NULL,
  voided_by        uuid        NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid        NULL
);

CREATE INDEX IF NOT EXISTS idx_purchase_payments_purchase ON purchase_payments (purchase_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_purchase_payments_payment  ON purchase_payments (payment_id)  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_purchase_payments_branch   ON purchase_payments (branch_id)   WHERE is_deleted = false;

ALTER TABLE purchase_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch members can view purchase_payments"
  ON purchase_payments FOR SELECT TO authenticated
  USING (
    branch_id = (SELECT branch_id FROM users WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid()
        AND role IN ('admin','super_admin','accountant','observer')
    )
  );

CREATE POLICY "Admins and accountants can insert purchase_payments"
  ON purchase_payments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid()
        AND role IN ('admin','super_admin','accountant')
    )
  );

CREATE POLICY "Admins can update purchase_payments (soft delete only)"
  ON purchase_payments FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid()
        AND role IN ('admin','super_admin','accountant')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid()
        AND role IN ('admin','super_admin','accountant')
    )
  );
