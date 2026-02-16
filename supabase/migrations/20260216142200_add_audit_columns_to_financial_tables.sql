/*
  # Add Audit Columns to All Financial Tables

  1. Purpose
    - Add enterprise-grade audit and soft-delete columns to all financial tables
    - Enable optimistic concurrency control via version column
    - Prepare for immutable financial record model

  2. Tables Modified
    - `sales` - add is_deleted, version, voided_at, voided_by
    - `sale_items` - add is_deleted, version, updated_at, voided_at, voided_by
    - `purchases` - add is_deleted, version, voided_at, voided_by
    - `purchase_items` - add is_deleted, version, updated_at, voided_at, voided_by
    - `expenses` - add is_deleted, version, updated_at, voided_at, voided_by
    - `inventory_movements` - add is_deleted, version, updated_at, voided_at, voided_by
    - `operating_expenses` - add is_deleted, version, updated_at, voided_at, voided_by
    - `cash_transactions` - add is_deleted, version, updated_at, voided_at, voided_by
    - `cash_shifts` - add is_deleted, version, voided_at, voided_by
    - `partner_contributions` - add is_deleted, version, updated_at, voided_at, voided_by
    - `partner_settlements` - add is_deleted, version, updated_at, voided_at, voided_by
    - `setup_expenses` - add is_deleted, version, voided_at, voided_by

  3. New Columns
    - `is_deleted` (boolean, default false) - soft delete flag
    - `version` (integer, default 1) - optimistic locking counter
    - `updated_at` (timestamptz, default now()) - last modification timestamp
    - `voided_at` (timestamptz, nullable) - when the record was voided
    - `voided_by` (uuid, nullable) - who voided the record

  4. Important Notes
    - All columns use IF NOT EXISTS for safety
    - Default values ensure backward compatibility
    - No data is modified or deleted
*/

-- Helper: add audit columns to a table
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'sales', 'sale_items', 'purchases', 'purchase_items',
    'expenses', 'inventory_movements', 'operating_expenses',
    'cash_transactions', 'cash_shifts', 'partner_contributions',
    'partner_settlements', 'setup_expenses'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- is_deleted
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'is_deleted'
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN is_deleted boolean NOT NULL DEFAULT false', tbl);
    END IF;

    -- version
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'version'
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN version integer NOT NULL DEFAULT 1', tbl);
    END IF;

    -- updated_at (some tables already have it)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'updated_at'
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now()', tbl);
    END IF;

    -- voided_at
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'voided_at'
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN voided_at timestamptz', tbl);
    END IF;

    -- voided_by
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'voided_by'
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN voided_by uuid REFERENCES auth.users(id)', tbl);
    END IF;
  END LOOP;
END $$;

-- Add indexes on is_deleted for efficient soft-delete filtering
CREATE INDEX IF NOT EXISTS idx_sales_is_deleted ON sales(is_deleted);
CREATE INDEX IF NOT EXISTS idx_sale_items_is_deleted ON sale_items(is_deleted);
CREATE INDEX IF NOT EXISTS idx_purchases_is_deleted ON purchases(is_deleted);
CREATE INDEX IF NOT EXISTS idx_purchase_items_is_deleted ON purchase_items(is_deleted);
CREATE INDEX IF NOT EXISTS idx_expenses_is_deleted ON expenses(is_deleted);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_is_deleted ON inventory_movements(is_deleted);
CREATE INDEX IF NOT EXISTS idx_operating_expenses_is_deleted ON operating_expenses(is_deleted);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_is_deleted ON cash_transactions(is_deleted);
CREATE INDEX IF NOT EXISTS idx_cash_shifts_is_deleted ON cash_shifts(is_deleted);
CREATE INDEX IF NOT EXISTS idx_partner_contributions_is_deleted ON partner_contributions(is_deleted);
CREATE INDEX IF NOT EXISTS idx_partner_settlements_is_deleted ON partner_settlements(is_deleted);
CREATE INDEX IF NOT EXISTS idx_setup_expenses_is_deleted ON setup_expenses(is_deleted);

-- Add indexes on voided_at for audit queries
CREATE INDEX IF NOT EXISTS idx_sales_voided_at ON sales(voided_at) WHERE voided_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchases_voided_at ON purchases(voided_at) WHERE voided_at IS NOT NULL;