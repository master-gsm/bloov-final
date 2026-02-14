/*
  # Assign Existing Data to Default Branch

  ## Changes
  Assigns all existing users, sales, inventory, expenses, and other records to the default "Main Branch".
  This ensures data continuity after implementing multi-branch system.

  ## Steps
  1. Get the default branch ID
  2. Update all existing records to use this branch_id
*/

-- Get the default branch ID and update all existing records
DO $$
DECLARE
  v_default_branch_id uuid;
BEGIN
  -- Get the default branch ID
  SELECT id INTO v_default_branch_id FROM branches WHERE code = 'MAIN' LIMIT 1;

  -- If no branch exists, create it
  IF v_default_branch_id IS NULL THEN
    INSERT INTO branches (name, code, location, city, is_active, opening_date)
    VALUES ('Main Branch', 'MAIN', 'Main Location', 'Riyadh', true, CURRENT_DATE)
    RETURNING id INTO v_default_branch_id;
  END IF;

  -- Update users (only if they don't have a branch assigned)
  UPDATE users
  SET branch_id = v_default_branch_id
  WHERE branch_id IS NULL;

  -- Update sales
  UPDATE sales
  SET branch_id = v_default_branch_id
  WHERE branch_id IS NULL;

  -- Update inventory
  UPDATE inventory
  SET branch_id = v_default_branch_id
  WHERE branch_id IS NULL;

  -- Update expenses
  UPDATE expenses
  SET branch_id = v_default_branch_id
  WHERE branch_id IS NULL;

  -- Update customers (set branch of origin)
  UPDATE customers
  SET branch_id = v_default_branch_id
  WHERE branch_id IS NULL;

  -- Update cash_transactions
  UPDATE cash_transactions
  SET branch_id = v_default_branch_id
  WHERE branch_id IS NULL;

  -- Update purchases
  UPDATE purchases
  SET branch_id = v_default_branch_id
  WHERE branch_id IS NULL;

  -- Update operating_expenses
  UPDATE operating_expenses
  SET branch_id = v_default_branch_id
  WHERE branch_id IS NULL;

  -- Update cash_shifts
  UPDATE cash_shifts
  SET branch_id = v_default_branch_id
  WHERE branch_id IS NULL;

  -- Create branch_stock entries from existing inventory
  INSERT INTO branch_stock (branch_id, product_id, quantity, last_restock_date)
  SELECT 
    v_default_branch_id,
    i.product_id,
    i.quantity,
    i.last_updated
  FROM inventory i
  WHERE NOT EXISTS (
    SELECT 1 FROM branch_stock bs
    WHERE bs.branch_id = v_default_branch_id
    AND bs.product_id = i.product_id
  );

END $$;
