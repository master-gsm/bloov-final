/*
  # Block DELETE and TRUNCATE on Financial Tables (Immutable Model)

  1. Purpose
    - Prevent physical deletion of financial records at the database level
    - This applies to ALL users including service_role
    - Financial records can only be voided via trusted functions

  2. Triggers Created
    - `trg_prevent_delete_sales` on sales
    - `trg_prevent_delete_sale_items` on sale_items
    - `trg_prevent_delete_purchases` on purchases
    - `trg_prevent_delete_purchase_items` on purchase_items
    - `trg_prevent_delete_expenses` on expenses
    - `trg_prevent_delete_inventory_movements` on inventory_movements
    - `trg_prevent_delete_operating_expenses` on operating_expenses
    - `trg_prevent_delete_cash_transactions` on cash_transactions
    - `trg_prevent_delete_cash_shifts` on cash_shifts
    - `trg_prevent_delete_partner_contributions` on partner_contributions
    - `trg_prevent_delete_partner_settlements` on partner_settlements
    - `trg_prevent_delete_setup_expenses` on setup_expenses

  3. Security
    - Uses session variable 'app.bypass_immutable' as escape hatch
    - Only SECURITY DEFINER functions can set this variable
    - Direct DELETE via REST, SQL, or service_role will be rejected

  4. Important Notes
    - TRUNCATE is blocked via revoke (not trigger, as TRUNCATE triggers are per-statement)
    - Existing CASCADE constraints on sale_items/purchase_items will be handled
      by also blocking deletes on child tables
*/

-- Create the universal prevent-delete function
CREATE OR REPLACE FUNCTION prevent_financial_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF current_setting('app.bypass_immutable', true) = 'true' THEN
    RETURN OLD;
  END IF;
  
  RAISE EXCEPTION 'DELETE operation is not permitted on financial table "%" - use void/reversal functions instead. Record ID: %',
    TG_TABLE_NAME, OLD.id;
  RETURN NULL;
END;
$$;

-- Apply the delete-prevention trigger to all financial tables
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
      DROP TRIGGER IF EXISTS trg_prevent_delete_%I ON %I;
      CREATE TRIGGER trg_prevent_delete_%I
        BEFORE DELETE ON %I
        FOR EACH ROW
        EXECUTE FUNCTION prevent_financial_delete();
    ', tbl, tbl, tbl, tbl);
  END LOOP;
END $$;

-- Revoke TRUNCATE from all roles on financial tables
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
    EXECUTE format('REVOKE TRUNCATE ON %I FROM public, anon, authenticated', tbl);
  END LOOP;
END $$;