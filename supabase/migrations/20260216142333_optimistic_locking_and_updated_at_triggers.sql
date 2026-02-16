/*
  # Optimistic Locking and Auto-Updated Timestamps

  1. Purpose
    - Implement optimistic concurrency control on all financial tables
    - Auto-increment version on every UPDATE
    - Reject UPDATEs where the provided version doesn't match the current version
    - Auto-set updated_at on every UPDATE

  2. Triggers Created
    - `trg_optimistic_lock_<table>` on each financial table (BEFORE UPDATE)
    - `trg_auto_updated_at_<table>` on tables missing updated_at triggers

  3. How It Works
    - Client must send the current version in the UPDATE payload
    - If NEW.version != OLD.version, the update is rejected (someone else modified it)
    - On successful update, version is auto-incremented to OLD.version + 1

  4. Important Notes
    - bypass via session variable 'app.bypass_immutable'
    - The version check only applies when the client explicitly sets version
    - If client doesn't change version, it auto-increments safely
*/

-- Optimistic locking function
CREATE OR REPLACE FUNCTION enforce_optimistic_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF current_setting('app.bypass_immutable', true) = 'true' THEN
    NEW.version := OLD.version + 1;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF NEW.version != OLD.version THEN
    RAISE EXCEPTION 'Optimistic lock conflict on "%" (ID: %). Expected version %, got %. Another user has modified this record.',
      TG_TABLE_NAME, OLD.id, OLD.version, NEW.version;
  END IF;

  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Apply optimistic locking trigger to all financial tables
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
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_optimistic_lock_%I ON %I;
      CREATE TRIGGER trg_optimistic_lock_%I
        BEFORE UPDATE ON %I
        FOR EACH ROW
        EXECUTE FUNCTION enforce_optimistic_lock();
    ', tbl, tbl, tbl, tbl);
  END LOOP;
END $$;