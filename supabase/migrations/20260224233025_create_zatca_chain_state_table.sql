/*
  # ZATCA Invoice Chaining - Phase 2: Chain State Table

  ## Summary
  Creates the `zatca_chain_state` table which holds exactly one row representing
  the tip of the invoice hash chain. This is the "genesis block" equivalent for
  ZATCA invoice chaining — every new invoice reads the current hash from here
  and writes its own hash back.

  ## New Tables

  ### zatca_chain_state
  - `id` (UUID, PK) — Fixed row identifier
  - `last_invoice_hash` (TEXT) — SHA256 hash of the most recently issued invoice
  - `updated_at` (TIMESTAMPTZ) — When the chain tip was last advanced

  ## Security
  - RLS enabled
  - SELECT: authenticated users can read the chain tip (needed during invoice creation)
  - INSERT/UPDATE/DELETE: restricted to service role only (via trigger / server functions)
  - No direct client writes allowed

  ## Initial Seed
  Inserts a single genesis row with a well-known placeholder hash so the first
  real invoice has a valid `previous_hash` to reference.
*/

CREATE TABLE IF NOT EXISTS zatca_chain_state (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  last_invoice_hash TEXT     NOT NULL DEFAULT 'GENESIS',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE zatca_chain_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read chain state"
  ON zatca_chain_state FOR SELECT
  TO authenticated
  USING (true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM zatca_chain_state) THEN
    INSERT INTO zatca_chain_state (last_invoice_hash) VALUES ('GENESIS');
  END IF;
END $$;
