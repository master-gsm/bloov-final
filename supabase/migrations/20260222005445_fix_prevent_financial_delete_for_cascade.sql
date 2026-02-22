/*
  # Fix prevent_financial_delete function for cascade deletes

  1. Changes
    - Fixed error: `record "old" has no field "status"` when cascade-deleting sale_items
    - The function now only checks `OLD.status` on the `sales` table
    - For `sale_items`, `purchase_items`, and other child tables, cascade deletes are allowed
      via the `app.bypass_immutable` setting or by checking if the parent is a draft

  2. Security
    - Draft sales can be fully deleted (including their sale_items)
    - Non-draft financial records are still protected from deletion
*/

CREATE OR REPLACE FUNCTION prevent_financial_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.bypass_immutable', true) = 'true' THEN
    RETURN OLD;
  END IF;

  IF TG_TABLE_NAME = 'sales' AND OLD.status = 'draft' THEN
    RETURN OLD;
  END IF;

  IF TG_TABLE_NAME = 'sale_items' THEN
    IF EXISTS (SELECT 1 FROM sales WHERE id = OLD.sale_id AND status = 'draft') THEN
      RETURN OLD;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM sales WHERE id = OLD.sale_id) THEN
      RETURN OLD;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'purchase_items' THEN
    IF NOT EXISTS (SELECT 1 FROM purchases WHERE id = OLD.purchase_id) THEN
      RETURN OLD;
    END IF;
  END IF;

  RAISE EXCEPTION 'DELETE operation is not permitted on financial table "%" - use void/reversal functions instead. Record ID: %', TG_TABLE_NAME, OLD.id;
  RETURN NULL;
END;
$$;
