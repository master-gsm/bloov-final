
/*
  # VAT Idempotency Fix — Part 1: Deduplicate & Add Unique Constraint

  ## Problem
  Both `trg_vat_tx_from_purchase` (trigger) and `process_purchase_receipt_atomic`
  (atomic function) insert into `vat_transactions` for the same purchase, causing
  duplicate rows. Same pattern affects `setup_expense` via
  `post_partner_operation_atomic`.

  ## Changes

  ### 1. Deduplicate existing data
  For each (source_type, source_id, direction) group that has more than one row,
  keep only the oldest row (lowest created_at / id). This is safe because duplicate
  rows are identical in business meaning — only one VAT entry per source document
  per direction is correct.

  ### 2. Add unique constraint
  `UNIQUE (source_type, source_id, direction)` — enforces one VAT entry per
  source document per direction at the database level.

  ### 3. Verify branch_period index
  `idx_vat_tx_branch_period` already exists on (branch_id, period_year, period_month).
  A named unique constraint index also covers (source_type, source_id, direction).

  ## Notes
  - No business logic is changed.
  - Triggers are NOT modified in this migration.
  - The constraint uses DO NOTHING semantics — whichever path fires second is silently ignored.
*/

-- ── STEP 1: Remove duplicate rows, keeping oldest per (source_type, source_id, direction) ──
DELETE FROM vat_transactions
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY source_type, source_id, direction
        ORDER BY created_at ASC, id ASC
      ) AS rn
    FROM vat_transactions
  ) ranked
  WHERE rn > 1
);

-- ── STEP 2: Add unique constraint ──────────────────────────────────────────────────────────
ALTER TABLE public.vat_transactions
  ADD CONSTRAINT uq_vat_tx_source_direction
  UNIQUE (source_type, source_id, direction);

-- ── STEP 3: Confirm branch_period index exists (create if missing) ─────────────────────────
CREATE INDEX IF NOT EXISTS idx_vat_tx_branch_period
  ON public.vat_transactions (branch_id, period_year, period_month);
