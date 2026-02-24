/*
  # ZATCA Invoice Chaining - Phase 3: Hash Chain Trigger

  ## Summary
  Creates a BEFORE INSERT trigger on the `sales` table that automatically:
  1. Assigns a fresh `invoice_uuid` if the caller did not provide one
  2. Reads the current chain tip (`last_invoice_hash`) from `zatca_chain_state`
  3. Computes a placeholder SHA256 hash over key invoice fields using pgcrypto
  4. Writes `previous_hash` and `invoice_hash` onto the new row
  5. Advances the chain tip in `zatca_chain_state`

  ## Hash Input (placeholder — not ZATCA-compliant XML yet)
  The hash is computed over the concatenation of:
    invoice_uuid || invoice_number || total_amount || previous_hash

  This is intentionally a placeholder. Full ZATCA compliance requires
  signing the canonical UBL/XML representation, which is handled by the
  ZATCA integration layer (future phase).

  ## Design Constraints
  - Trigger runs BEFORE INSERT so the hash is embedded in the stored row
  - Uses `pgcrypto` extension's `digest()` function (already available in Supabase)
  - The chain state update is part of the same transaction → atomic
  - No accounting columns, journal entries, or ledger logic are touched

  ## Security
  - Function runs with SECURITY DEFINER so it can update zatca_chain_state
    regardless of the caller's RLS context
  - search_path pinned to public to prevent search-path injection
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.fn_zatca_stamp_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_hash    TEXT;
  v_chain_id     UUID;
  v_hash_input   TEXT;
  v_invoice_hash TEXT;
BEGIN
  IF NEW.invoice_uuid IS NULL THEN
    NEW.invoice_uuid := gen_random_uuid();
  END IF;

  SELECT id, last_invoice_hash
    INTO v_chain_id, v_prev_hash
    FROM zatca_chain_state
    LIMIT 1
    FOR UPDATE;

  IF v_chain_id IS NULL THEN
    v_prev_hash := 'GENESIS';
    INSERT INTO zatca_chain_state (last_invoice_hash)
      VALUES ('GENESIS')
      RETURNING id INTO v_chain_id;
  END IF;

  NEW.previous_hash := v_prev_hash;

  v_hash_input := COALESCE(NEW.invoice_uuid::TEXT, '')
    || '|' || COALESCE(NEW.invoice_number, '')
    || '|' || COALESCE(NEW.total_amount::TEXT, '0')
    || '|' || v_prev_hash;

  v_invoice_hash := encode(digest(v_hash_input, 'sha256'), 'hex');

  NEW.invoice_hash := v_invoice_hash;

  UPDATE zatca_chain_state
     SET last_invoice_hash = v_invoice_hash,
         updated_at        = now()
   WHERE id = v_chain_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_zatca_stamp_invoice ON sales;

CREATE TRIGGER trg_zatca_stamp_invoice
  BEFORE INSERT ON sales
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_zatca_stamp_invoice();
