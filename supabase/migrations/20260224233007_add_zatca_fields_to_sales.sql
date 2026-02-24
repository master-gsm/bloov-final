/*
  # ZATCA Invoice Chaining - Phase 1: Sales Table Columns

  ## Summary
  Adds ZATCA-required fields to the sales table to support e-invoicing compliance
  with the Saudi Arabia Zakat, Tax and Customs Authority (ZATCA) Phase 2 requirements.

  ## Changes to Existing Tables

  ### sales
  - `invoice_uuid` (UUID, UNIQUE) — Universally unique identifier per invoice for ZATCA
  - `invoice_hash` (TEXT) — SHA256 hash of this invoice (links the chain forward)
  - `previous_hash` (TEXT) — Hash of the preceding invoice (links the chain back)
  - `zatca_status` (TEXT, DEFAULT 'pending') — Lifecycle status: pending / reported / cleared / error
  - `zatca_response` (JSONB) — Raw JSON response from ZATCA API
  - `zatca_cleared_at` (TIMESTAMPTZ) — Timestamp when ZATCA cleared the invoice
  - `zatca_error_message` (TEXT) — Human-readable error from ZATCA if submission failed

  ## Notes
  - All columns are nullable except `zatca_status` which defaults to 'pending'
  - Existing rows are unaffected (new columns are additive only)
  - No accounting logic or triggers are modified
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'invoice_uuid'
  ) THEN
    ALTER TABLE sales ADD COLUMN invoice_uuid UUID UNIQUE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'invoice_hash'
  ) THEN
    ALTER TABLE sales ADD COLUMN invoice_hash TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'previous_hash'
  ) THEN
    ALTER TABLE sales ADD COLUMN previous_hash TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'zatca_status'
  ) THEN
    ALTER TABLE sales ADD COLUMN zatca_status TEXT NOT NULL DEFAULT 'pending';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'zatca_response'
  ) THEN
    ALTER TABLE sales ADD COLUMN zatca_response JSONB;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'zatca_cleared_at'
  ) THEN
    ALTER TABLE sales ADD COLUMN zatca_cleared_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'zatca_error_message'
  ) THEN
    ALTER TABLE sales ADD COLUMN zatca_error_message TEXT;
  END IF;
END $$;
